package middleware

import (
	"xhub/database"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"xhub/cache"
)

var trustedOrigins = []string{
	"https://room.pppoe.one",
}

func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie("session_token")
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "msg": "未登录"})
			c.Abort()
			return
		}

		userIDStr, err := cache.Get("session:" + token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "msg": "登录已过期"})
			c.Abort()
			return
		}

		userID, _ := strconv.Atoi(userIDStr)

		// Check if user is still enabled
		var enabled bool
		err = database.DB.QueryRow("SELECT COALESCE(enabled, true) FROM users WHERE id=$1", userID).Scan(&enabled)
		if err != nil || !enabled {
			cache.Del("session:" + token)
			c.SetCookie("session_token", "", -1, "/", "", false, true)
			c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "您的账户已被禁用，请联系管理员"})
			c.Abort()
			return
		}

		c.Set("user_id", userID)
		c.Next()
	}
}

func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetInt("user_id")
		if userID != 1 {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "无管理员权限"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// S-08: CORS middleware with trusted origin validation
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin == "" {
			origin = c.GetHeader("Referer")
		}

		// If origin is present, validate it
		if origin != "" {
			trusted := false
			for _, allowed := range trustedOrigins {
				if len(origin) >= len(allowed) && origin[:len(allowed)] == allowed {
					trusted = true
					break
				}
			}
			if trusted {
				c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
				c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			}
		}

		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Authorization, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
