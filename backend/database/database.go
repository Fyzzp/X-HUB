package database

import (
	"database/sql"
	"fmt"
	"log"

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
	DB.SetMaxOpenConns(100)
	DB.SetMaxIdleConns(20)
	if err = DB.Ping(); err != nil {
		log.Fatal("Database ping failed:", err)
	}
	log.Println("Database connected successfully")
}

func InitSchema() {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			username VARCHAR(255) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			email VARCHAR(255) DEFAULT ,
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
	}
	for _, q := range queries {
		if _, err := DB.Exec(q); err != nil {
			log.Printf("Schema init warning: %v", err)
		}
	}
	// Add email column if not exists (for existing tables)
	DB.Exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) DEFAULT ")
	DB.Exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true")
	DB.Exec("ALTER TABLE private_nodes ADD COLUMN IF NOT EXISTS xray_template_config TEXT DEFAULT NULL")
	log.Println("Database schema initialized")
}
