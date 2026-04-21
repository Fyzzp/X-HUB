package handlers

import (
	"strconv"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
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

	code := generateCode()
	cache.Set("reset:"+req.Email, code, 10*time.Minute)

	subject := "您的 3X-UI 密码重置验证码"
	body := fmt.Sprintf("您的密码重置验证码是：%s，10分钟内有效。", code)
	go sendResetEmail(req.Email, subject, body)

	c.JSON(http.StatusOK, gin.H{"success": true, "msg": "验证码已发送"})
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

	if len(req.Password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "密码至少6位"})
		return
	}

	stored, _ := cache.Get("reset:" + req.Email)
	if stored != req.Code {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "验证码错误"})
		return
	}
	cache.Del("reset:" + req.Email)

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

	if req.Username == "" || len(req.Password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "账号为空或密码太短"})
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
	c.JSON(http.StatusOK, gin.H{"success": true, "msg": "注册成功"})
}

func Login(c *gin.Context) {
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
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "msg": "账号或密码错误"})
		return
	}
	if !enabled {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "您的账户已被禁用，请联系管理员"})
		return
	}
	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	token := hex.EncodeToString(tokenBytes)
	cache.Set("session:"+token, id, 7*24*time.Hour)
	c.SetCookie("session_token", token, 7*24*3600, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"success": true, "msg": "登录成功"})
}

func Logout(c *gin.Context) {
	if token, err := c.Cookie("session_token"); err == nil {
		cache.Del("session:" + token)
	}
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
	c.JSON(http.StatusOK, gin.H{"code": 0, "msg": msg})
}


func ToggleUserEnabled(c *gin.Context) {
	adminID := c.GetInt("user_id")
	if adminID != 1 {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "无权限"})
		return
	}
	var req struct {
		UserID  int  `json:"user_id"`
		Enabled bool `json:"enabled"`
	}
	c.ShouldBindJSON(&req)
	if req.UserID == 1 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "无法禁用管理员账户"})
		return
	}
	database.DB.Exec("UPDATE users SET enabled=$1 WHERE id=$2", req.Enabled, req.UserID)
	if !req.Enabled {
		// Disable: delete user's session so they are immediately logged out
		cache.Del("session:" + strconv.Itoa(req.UserID))
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "msg": "操作成功"})
}

func GetRegisterStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"enabled": allowRegister}})
}

func GetRegisterStatusPublic(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"enabled": allowRegister}})
}
