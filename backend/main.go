package main

import (
	"log"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"xhub/cache"
	"xhub/config"
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
	r.POST("/api/auth/logout", handlers.Logout)
	r.GET("/api/auth/me", middleware.AuthRequired(), handlers.Me)
	r.POST("/api/auth/send_code", handlers.SendVerifyCode)
	r.POST("/api/auth/send_reset_code", handlers.SendResetCode)
	r.POST("/api/auth/reset_password", handlers.ResetPassword)
	r.GET("/api/register/status", handlers.GetRegisterStatusPublic)

	nodeRoutes := r.Group("/api")
	nodeRoutes.Use(middleware.AuthRequired())
	{
		nodeRoutes.POST("/nodes/save", handlers.SavePrivateNode)
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
	log.Printf("Server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatal("Server failed:", err)
	}
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
