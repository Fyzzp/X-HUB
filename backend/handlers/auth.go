package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"strconv"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"xhub/cache"
	"xhub/database"
)

var allowRegister = true

const allowRegisterPath = "/mnt/X-HUB/allow_register.txt"

func saveAllowRegister() {
	var val string
	if allowRegister {
		val = "1"
	} else {
		val = "0"
	}
	os.WriteFile(allowRegisterPath, []byte(val), 0644)
}

func LoadAllowRegister() {
	data, err := os.ReadFile(allowRegisterPath)
	if err == nil {
		allowRegister = strings.TrimSpace(string(data)) == "1"
	}
}


func generateCode() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(1000000))
	return fmt.Sprintf("%06d", n.Int64())
}

// S-06: Generate UUID token for password reset
func generateResetToken() string {
	return uuid.New().String()
}

func SendVerifyCode(c *gin.Context) {
	if !allowRegister {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "管理员已关闭注册"})
		return
	}
	var req struct{ Email string `json:"email"` }
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "参数错误"})
		return
	}
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "请输入正确的邮箱"})
		return
	}

	code := generateCode()
	cache.Set("verify:"+req.Email, code, 10*time.Minute)
	go sendEmail(req.Email, code)

	c.JSON(http.StatusOK, gin.H{"success": true, "msg": "验证码已发送"})
}

func SendResetCode(c *gin.Context) {
	var req struct{ Email string `json:"email"` }
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "参数错误"})
		return
	}
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "请输入正确的邮箱"})
		return
	}

	// Check if user exists with this email
	var exists bool
	err := database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE email=$1)", req.Email).Scan(&exists)
	if err != nil || !exists {
		// Don't reveal whether email exists for security
	c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "邮箱未注册"})
		return
	}

	// S-06: Generate UUID token and 6-digit code
	token := generateResetToken()
	code := generateCode()
	// Store token->code mapping in Redis, expire in 10 minutes
	cache.Set("reset_token:"+token, code, 10*time.Minute)
	cache.Set("reset_email:"+token, req.Email, 10*time.Minute)

	subject := "您的 X-HUB 密码重置验证码"
	body := fmt.Sprintf("您的密码重置验证码是：%s，10分钟内有效。\n\n如果您没有请求重置密码，请忽略此邮件。", code)
	go sendResetEmail(req.Email, subject, body)

	// Return token to frontend (for potential future use)
	c.JSON(http.StatusOK, gin.H{"success": true, "msg": "验证码已发送", "token": token})
}

func sendResetEmail(to, subject, body string) {
	defer func() {
		if r := recover(); r != nil {
			fmt.Println("sendResetEmail panic:", r)
		}
	}()

	cfgMu.RLock()
	smtp := smtpCfg
	cfgMu.RUnlock()

	if !smtp.Enabled {
		fmt.Println("SMTP not enabled, skipping reset email")
		return
	}

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		smtp.From, to, subject, body)

	addr := fmt.Sprintf("%s:%d", smtp.Host, smtp.Port)

	var err error
	if smtp.Port == 465 {
		err = sendMailSSL(addr, smtp.User, smtp.Password, smtp.From, to, []byte(msg))
	} else {
		err = sendMailSTARTTLS(addr, smtp.User, smtp.Password, smtp.From, to, []byte(msg))
	}

	if err != nil {
		fmt.Println("SMTP reset email error:", err)
	} else {
		fmt.Println("SMTP reset email sent to", to)
	}
}

func ResetPassword(c *gin.Context) {
	var req struct {
		Token    string `json:"token"`
		Email    string `json:"email"`
		Code     string `json:"code"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "参数错误"})
		return
	}

	if req.Email == "" || req.Code == "" || req.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "请填写所有字段"})
		return
	}

	if len(req.Password) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "密码长度至少8位"})
		return
	}

	if err := validatePassword(req.Password); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}

	// S-06: Verify using token and code
	storedCode, _ := cache.Get("reset_token:" + req.Token)
	if storedCode != req.Code {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "验证码错误"})
		return
	}
	cache.Del("reset_token:" + req.Token)
	cache.Del("reset_email:" + req.Token)

	hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	result, err := database.DB.Exec("UPDATE users SET password_hash=$1 WHERE email=$2", string(hash), req.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "密码重置失败"})
	 return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "用户不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "msg": "密码重置成功"})
}

// S-07: 密码强度校验
func validatePassword(password string) error {
	if len(password) < 8 {
		return fmt.Errorf("密码长度至少8位")
	}
	if !regexp.MustCompile(`[A-Z]`).MatchString(password) {
		return fmt.Errorf("密码必须包含大写字母")
	}
	if !regexp.MustCompile(`[0-9]`).MatchString(password) {
		return fmt.Errorf("密码必须包含数字")
	}
	if !regexp.MustCompile(`[!@#$%^&*]`).MatchString(password) {
		return fmt.Errorf("密码必须包含特殊字符")
	}
	return nil
}

func Register(c *gin.Context) {
	if !allowRegister {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "管理员已关闭注册"})
		return
	}

	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Code     string `json:"code"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "参数错误"})
		return
	}

	if req.Email != "" {
		if req.Code == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "请输入验证码"})
			return
		}
		stored, _ := cache.Get("verify:" + req.Email)
		if stored != req.Code {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "验证码错误"})
			return
		}
		cache.Del("verify:" + req.Email)
	}

	if req.Username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "用户名不能为空"})
		return
	}
	if err := validatePassword(req.Password); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	var userID int
	err := database.DB.QueryRow(
		"INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING id",
		req.Username, string(hash), req.Email,
	).Scan(&userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "用户名已被注册"})
		return
	}
	// B-05: Audit log - successful registration
	database.LogAudit(userID, req.Username, "register", c.ClientIP(), c.GetHeader("User-Agent"), map[string]interface{}{"email": req.Email})
	c.JSON(http.StatusOK, gin.H{"success": true, "msg": "注册成功"})
}

func Login(c *gin.Context) {
	// S-05: API限流 - 5次/分钟
	clientIP := c.ClientIP()
	key := "ratelimit:login:" + clientIP
	ctx := context.Background()
	count, _ := cache.Client.Incr(ctx, key).Result()
	if count == 1 {
		cache.Client.Expire(ctx, key, time.Minute)
	}
	if count > 5 {
		c.JSON(http.StatusTooManyRequests, gin.H{"success": false, "msg": "请求过于频繁，请稍后再试"})
		return
	}

	var req struct{ Username, Password string }
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "参数错误"})
		return
	}
	var id int
	var hash string
	var enabled bool
	err := database.DB.QueryRow("SELECT id, password_hash, COALESCE(enabled, true) FROM users WHERE username=$1", req.Username).Scan(&id, &hash, &enabled)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		// B-05: Audit log - failed login
		database.LogAudit(0, req.Username, "login_failed", c.ClientIP(), c.GetHeader("User-Agent"), map[string]interface{}{"reason": "invalid_credentials"})
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "msg": "账号或密码错误"})
		return
	}
	if !enabled {
		// B-05: Audit log - disabled account login attempt
		database.LogAudit(id, req.Username, "login_failed", c.ClientIP(), c.GetHeader("User-Agent"), map[string]interface{}{"reason": "account_disabled"})
		c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "您的账户已被禁用，请联系管理员"})
		return
	}
	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	token := hex.EncodeToString(tokenBytes)
	cache.Set("session:"+token, id, 7*24*time.Hour)
	// S-04: Cookie安全属性 (Secure=true, HttpOnly=true)
	c.SetCookie("session_token", token, 7*24*3600, "/", "", true, true)
	// B-05: Audit log - successful login
	database.LogAudit(id, req.Username, "login_success", c.ClientIP(), c.GetHeader("User-Agent"), map[string]interface{}{"method": "password"})
	c.JSON(http.StatusOK, gin.H{"success": true, "msg": "登录成功"})
}
func Logout(c *gin.Context) {
	userID := c.GetInt("user_id")
	var username string
	database.DB.QueryRow("SELECT username FROM users WHERE id=$1", userID).Scan(&username)

	if token, err := c.Cookie("session_token"); err == nil {
		cache.Del("session:" + token)
	}
	// B-05: Audit log - logout
	database.LogAudit(userID, username, "logout", c.ClientIP(), c.GetHeader("User-Agent"), nil)
	c.SetCookie("session_token", "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"success": true, "msg": "注销成功"})
}

func Me(c *gin.Context) {
	userID := c.GetInt("user_id")
	var username string
	database.DB.QueryRow("SELECT username FROM users WHERE id=$1", userID).Scan(&username)
	c.JSON(http.StatusOK, gin.H{"code": 0, "username": username, "is_admin": userID == 1})
}

func ToggleRegister(c *gin.Context) {
	userID := c.GetInt("user_id")
	if userID != 1 {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "无权限"})
		return
	}
	var username string
	database.DB.QueryRow("SELECT username FROM users WHERE id=$1", userID).Scan(&username)

	var req struct{ Enabled bool }
	c.ShouldBindJSON(&req)
	allowRegister = req.Enabled
	saveAllowRegister()
	var msg string
	if req.Enabled {
		msg = "注册功能已开启"
	} else {
		msg = "注册功能已关闭"
	}
	// B-05: Audit log - admin toggle register
	database.LogAudit(userID, username, "admin_toggle_register", c.ClientIP(), c.GetHeader("User-Agent"), map[string]interface{}{"enabled": req.Enabled})
	c.JSON(http.StatusOK, gin.H{"code": 0, "msg": msg})
}


func ToggleUserEnabled(c *gin.Context) {
	adminID := c.GetInt("user_id")
	if adminID != 1 {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "无权限"})
		return
	}
	var adminUsername string
	database.DB.QueryRow("SELECT username FROM users WHERE id=$1", adminID).Scan(&adminUsername)

	var req struct {
		UserID  int  `json:"user_id"`
		Enabled bool `json:"enabled"`
	}
	c.ShouldBindJSON(&req)
	if req.UserID == 1 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "无法禁用管理员账户"})
		return
	}

	// Get target username for audit log
	var targetUsername string
	database.DB.QueryRow("SELECT username FROM users WHERE id=$1", req.UserID).Scan(&targetUsername)

	database.DB.Exec("UPDATE users SET enabled=$1 WHERE id=$2", req.Enabled, req.UserID)
	if !req.Enabled {
		// Disable: delete user's session so they are immediately logged out
		cache.Del("session:" + strconv.Itoa(req.UserID))
	}
	// B-05: Audit log - admin toggle user enabled
	database.LogAudit(adminID, adminUsername, "admin_toggle_user", c.ClientIP(), c.GetHeader("User-Agent"), map[string]interface{}{"target_user_id": req.UserID, "target_username": targetUsername, "enabled": req.Enabled})
	c.JSON(http.StatusOK, gin.H{"code": 0, "msg": "操作成功"})
}

func GetRegisterStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"enabled": allowRegister}})
}

func GetRegisterStatusPublic(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"enabled": allowRegister}})
}

// B-05: Get audit logs for admin
func GetAuditLogs(c *gin.Context) {
	userID := c.GetInt("user_id")
	if userID != 1 {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "无权限"})
		return
	}

	// Parse pagination parameters
	page := 1
	pageSize := 50
	if p := c.Query("page"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil && parsed > 0 {
			page = parsed
		}
	}
	if ps := c.Query("page_size"); ps != "" {
		if parsed, err := strconv.Atoi(ps); err == nil && parsed > 0 && parsed <= 100 {
			pageSize = parsed
		}
	}

	// Parse filter parameters
	actionFilter := c.Query("action")
	userFilter := c.Query("user_id")

	// Build query
	whereClause := ""
	args := []interface{}{}
	argCount := 0

	if actionFilter != "" {
		argCount++
		whereClause += fmt.Sprintf(" AND action = $%d", argCount)
		args = append(args, actionFilter)
	}
	if userFilter != "" {
		argCount++
		whereClause += fmt.Sprintf(" AND user_id = $%d", argCount)
		args = append(args, userFilter)
	}

	// Get total count
	var totalCount int
	countQuery := "SELECT COUNT(*) FROM audit_logs WHERE 1=1" + whereClause
	err := database.DB.QueryRow(countQuery, args...).Scan(&totalCount)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "查询失败"})
		return
	}

	// Get logs with pagination
	offset := (page - 1) * pageSize
	argCount++
	limitClause := fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d", argCount)
	args = append(args, pageSize)
	argCount++
	offsetClause := fmt.Sprintf(" OFFSET $%d", argCount)
	args = append(args, offset)

	query := "SELECT id, user_id, username, action, ip, user_agent, details, created_at FROM audit_logs WHERE 1=1" + whereClause + limitClause + offsetClause

	rows, err := database.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "查询失败"})
		return
	}
	defer rows.Close()

	logs := []gin.H{}
	for rows.Next() {
		var id int
		var uid *int
		var username, action, ip, userAgent *string
		var details []byte
		var createdAt time.Time

		err := rows.Scan(&id, &uid, &username, &action, &ip, &userAgent, &details, &createdAt)
		if err != nil {
			continue
		}

		log := gin.H{
			"id":         id,
			"user_id":    uid,
			"username":   username,
			"action":     action,
			"ip":         ip,
			"user_agent": userAgent,
			"created_at": createdAt.Format("2006-01-02 15:04:05"),
		}

		// Parse details JSON if present
		if len(details) > 0 {
			var detailsMap map[string]interface{}
			if json.Unmarshal(details, &detailsMap) == nil {
				log["details"] = detailsMap
			}
		}

		logs = append(logs, log)
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"logs":       logs,
			"total":      totalCount,
			"page":       page,
			"page_size":  pageSize,
			"total_pages": (totalCount + pageSize - 1) / pageSize,
		},
	})
}

// B-05: Clear audit logs for admin
func ClearAuditLogs(c *gin.Context) {
	userID := c.GetInt("user_id")
	if userID != 1 {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "无权限"})
		return
	}

	var req struct {
		Days int `json:"days"` // 0 means all, otherwise delete logs older than N days
	}
	c.ShouldBindJSON(&req)

	var result sql.Result
	var err error

	if req.Days <= 0 {
		// Clear all logs
		result, err = database.DB.Exec("DELETE FROM audit_logs")
	} else {
		// Clear logs older than N days
		result, err = database.DB.Exec("DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '1 day' * $1", req.Days)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "清除失败"})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	c.JSON(http.StatusOK, gin.H{"code": 0, "msg": fmt.Sprintf("已清除 %d 条记录", rowsAffected)})
}
