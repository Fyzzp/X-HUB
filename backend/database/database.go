package database

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	_ "github.com/lib/pq"
	"xhub/config"
)

var DB *sql.DB

func Init(cfg *config.Config) {
	dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Database.Host, cfg.Database.Port, cfg.Database.User, cfg.Database.Password, cfg.Database.DBName, cfg.Database.SSLMode)
	var err error
	DB, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	// S-12: Connection pool tuning
	// MaxOpenConns: 25 is sufficient for 4-core CPU (5 conns per core)
	DB.SetMaxOpenConns(25)
	// MaxIdleConns: keep 10 connections ready for reuse
	DB.SetMaxIdleConns(10)
	// ConnMaxLifetime: refresh connections every hour to avoid stale connections
	DB.SetConnMaxLifetime(time.Hour)
	// ConnMaxIdleTime: close idle connections after 10 minutes
	DB.SetConnMaxIdleTime(10 * time.Minute)

	if err = DB.Ping(); err != nil {
		log.Fatal("Database ping failed:", err)
	}
	log.Println("Database connected successfully with optimized connection pool")
}

func InitSchema() {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			username VARCHAR(255) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			email VARCHAR(255) DEFAULT '',
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS private_nodes (
			id SERIAL PRIMARY KEY,
			user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			alias_name VARCHAR(255) NOT NULL,
			url VARCHAR(255) NOT NULL,
			base_path VARCHAR(255) NOT NULL,
			panel_user VARCHAR(255) NOT NULL,
			panel_pass VARCHAR(255) NOT NULL,
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		// B-05: Audit logs table for security tracking
		`CREATE TABLE IF NOT EXISTS audit_logs (
			id SERIAL PRIMARY KEY,
			user_id INT,
			username VARCHAR(255),
			action VARCHAR(100) NOT NULL,
			ip VARCHAR(45),
			user_agent TEXT,
			details JSONB,
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`,
	}
	for _, q := range queries {
		if _, err := DB.Exec(q); err != nil {
			log.Printf("Schema init warning: %v", err)
		}
	}
	// Add email column if not exists (for existing tables)
	DB.Exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) DEFAULT ''")
	DB.Exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true")
	DB.Exec("ALTER TABLE private_nodes ADD COLUMN IF NOT EXISTS xray_template_config TEXT DEFAULT NULL")
	log.Println("Database schema initialized")
}

// B-05: Audit logging helper
func LogAudit(userID int, username, action, ip, userAgent string, details interface{}) {
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		detailsJSON = []byte("{}")
	}
	DB.Exec("INSERT INTO audit_logs (user_id, username, action, ip, user_agent, details) VALUES ($1, $2, $3, $4, $5, $6)",
		userID, username, action, ip, userAgent, detailsJSON)
}
