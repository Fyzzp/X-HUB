package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"xhub/cache"
	"xhub/config"
	"xhub/crypto"
	"xhub/database"
	"xhub/handlers"
	"xhub/middleware"
)

var cfg *config.Config

func main() {
	cfg = config.Load("config.json")

	database.Init(cfg)
	database.InitSchema()

	cache.Init(cfg)

	// S-03: Initialize AES key for panel password encryption
	if err := crypto.InitKey(cfg.AESKey); err != nil {
		log.Printf("Warning: AES key initialization failed: %v", err)
	}

	if cfg.SMTP.Enabled {
		handlers.SetSMTP(handlers.SMTPConfig{
			Enabled:  cfg.SMTP.Enabled,
			Host:     cfg.SMTP.Host,
			Port:     cfg.SMTP.Port,
			User:     cfg.SMTP.User,
			Password: cfg.SMTP.Password,
			From:     cfg.SMTP.From,
		})
	}

	r := gin.Default()
	r.Use(middleware.CORSMiddleware())

	r.POST("/api/auth/register", handlers.Register)
	r.POST("/api/auth/login", handlers.Login)
	r.POST("/api/auth/logout", middleware.AuthRequired(), handlers.Logout)
	r.GET("/api/auth/me", middleware.AuthRequired(), handlers.Me)
	r.POST("/api/auth/send_code", handlers.SendVerifyCode)
	r.POST("/api/auth/send_reset_code", handlers.SendResetCode)
	r.POST("/api/auth/reset_password", handlers.ResetPassword)
	r.GET("/register/status", handlers.GetRegisterStatusPublic)

	nodeRoutes := r.Group("/api")
	nodeRoutes.Use(middleware.AuthRequired())
	{
		nodeRoutes.POST("/nodes/save", handlers.SavePrivateNode)
	nodeRoutes.POST("/nodes/check_duplicate", handlers.CheckNodeDuplicate)
	nodeRoutes.POST("/nodes/test_connection", handlers.TestNodeConnection)
		nodeRoutes.GET("/nodes", handlers.GetNodes)
		nodeRoutes.GET("/inbounds", handlers.GetInbounds)
		nodeRoutes.POST("/inbounds", handlers.GetInbounds)
		nodeRoutes.GET("/nodes/inbounds", handlers.GetNodeInbounds)
		nodeRoutes.GET("/nodes/status", handlers.GetNodeStatus)
		nodeRoutes.GET("/subscription/:node_id", handlers.GetSubscription)
		nodeRoutes.POST("/deploy", handlers.DeployInbound)
		nodeRoutes.POST("/deploy/socks5", handlers.DeploySocks5)
		nodeRoutes.POST("/delete", handlers.DeleteInbound)
		nodeRoutes.POST("/restart", handlers.RestartXray)
	}

	adminRoutes := r.Group("/api/admin")
	adminRoutes.Use(middleware.AuthRequired(), middleware.AdminRequired())
	{
		adminRoutes.GET("/dashboard", handlers.GetAdminDashboard)
		adminRoutes.GET("/system_stats", handlers.GetSystemStats)
		adminRoutes.POST("/action", handlers.AdminAction)
		adminRoutes.GET("/toggle_register", handlers.GetRegisterStatus)
		adminRoutes.POST("/toggle_register", handlers.ToggleRegister)
		adminRoutes.GET("/user/:userId/nodes", handlers.GetUserNodes)
		adminRoutes.POST("/toggle_user", handlers.ToggleUserEnabled)
		adminRoutes.GET("/audit_logs", handlers.GetAuditLogs)
		adminRoutes.POST("/audit_logs/clear", handlers.ClearAuditLogs)
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	go startBackgroundPolling()

	loadRegisterFlag()

	addr := cfg.Server.Listen
	if !strings.Contains(addr, ":") {
		addr = ":" + addr
	}

	// P-08: Graceful Shutdown
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	go func() {
		log.Printf("Server starting on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited properly")
}

func startBackgroundPolling() {
	ticker := time.NewTicker(time.Duration(cfg.Server.PollingInterval) * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		rows, err := database.DB.Query("SELECT id, url, base_path, panel_user, panel_pass FROM private_nodes")
		if err != nil {
			continue
		}
		for rows.Next() {
			var id int
			var n struct {
				URL, BasePath, Username, Password string
			}
			rows.Scan(&id, &n.URL, &n.BasePath, &n.Username, &n.Password)
			_ = id
		}
		rows.Close()
	}
}


func loadRegisterFlag() {
	handlers.LoadAllowRegister()
}
