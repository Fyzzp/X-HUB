package handlers

import (
	"strconv"
	"xhub/cache"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"xhub/database"
)

func SavePrivateNode(c *gin.Context) {
	userID := c.GetInt("user_id")
	var node struct {
		Alias    string `json:"alias"`
		URL      string `json:"url"`
		BasePath string `json:"base_path"`
		User     string `json:"user"`
		Pass     string `json:"pass"`
	}
	if err := c.ShouldBindJSON(&node); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "参数不完整"})
		return
	}
	_, err := database.DB.Exec(
		"INSERT INTO private_nodes (user_id, alias_name, url, base_path, panel_user, panel_pass) VALUES ($1, $2, $3, $4, $5, $6)",
		userID, node.Alias, node.URL, node.BasePath, node.User, node.Pass,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "保存失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "msg": "节点已保存"})
}

func GetNodes(c *gin.Context) {
	userID := c.GetInt("user_id")
	response := gin.H{"private": make(map[string]map[string]string)}
	rows, _ := database.DB.Query("SELECT id, user_id, alias_name, url FROM private_nodes WHERE user_id=$1", userID)
	defer rows.Close()
	for rows.Next() {
		var id, userID int
		var alias, nurl string
		rows.Scan(&id, &userID, &alias, &nurl)
		response["private"].(map[string]map[string]string)[fmt.Sprintf("%d", id)] = map[string]string{"alias": alias, "host": nurl}
	}
	c.JSON(http.StatusOK, response)
}

func GetAdminDashboard(c *gin.Context) {
	userID := c.GetInt("user_id")
	if userID != 1 {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "无权限"})
		return
	}

	rows, _ := database.DB.Query("SELECT id, username, COALESCE(enabled, true) as enabled FROM users WHERE id != 1")
	var users []gin.H
	for rows.Next() {
		var uid int
		var uname string
		var uenabled bool
		rows.Scan(&uid, &uname, &uenabled)
		users = append(users, gin.H{"id": uid, "username": uname, "enabled": uenabled})
	}
	rows.Close()

	rows2, _ := database.DB.Query("SELECT p.id, u.username, p.alias_name, p.url, p.base_path, p.panel_user, p.panel_pass FROM private_nodes p JOIN users u ON p.user_id = u.id")
	var pnodes []gin.H
	for rows2.Next() {
		var pid int
		var uname, alias, purl, ppath, puser, ppass string
		rows2.Scan(&pid, &uname, &alias, &purl, &ppath, &puser, &ppass)
		pnodes = append(pnodes, gin.H{"id": pid, "username": uname, "alias": alias, "url": purl, "base_path": ppath, "panel_user": puser, "panel_pass": ppass})
	}
	rows2.Close()

	var totalUsers, totalNodes, activeUsers, activeNodes int
	database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE id != 1").Scan(&totalUsers)
	database.DB.QueryRow("SELECT COUNT(*) FROM private_nodes").Scan(&totalNodes)
	database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE id != 1 AND last_login > NOW() - INTERVAL '30 days'").Scan(&activeUsers)
	activeNodes = totalNodes

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"users":  users,
			"nodes":  pnodes,
			"stats": gin.H{
				"total_users":  totalUsers,
				"total_nodes":  totalNodes,
				"active_users": activeUsers,
				"active_nodes": activeNodes,
			},
		},
	})
}

func AdminAction(c *gin.Context) {
	userID := c.GetInt("user_id")
	if userID != 1 {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "无权限"})
		return
	}
	var req struct {
		Action string `json:"action"`
		ID     int    `json:"id"`
	}
	c.ShouldBindJSON(&req)
	if req.Action == "delete_user" {
		// Delete user's session from cache
		cache.Del("session:" + strconv.Itoa(req.ID))
		database.DB.Exec("DELETE FROM private_nodes WHERE user_id=$1", req.ID)
		database.DB.Exec("DELETE FROM users WHERE id=$1", req.ID)
		c.JSON(http.StatusOK, gin.H{"code": 0, "msg": "用户已删除"})
	} else if req.Action == "delete_node" {
		database.DB.Exec("DELETE FROM private_nodes WHERE id=$1", req.ID)
		c.JSON(http.StatusOK, gin.H{"code": 0, "msg": "节点已删除"})
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "未知操作"})
	}
}

func GetUserNodes(c *gin.Context) {
	adminID := c.GetInt("user_id")
	if adminID != 1 {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "无权限"})
		return
	}

	userID := c.Param("userId")
	response := gin.H{"private": make(map[string]map[string]string)}
	rows, _ := database.DB.Query("SELECT id, alias_name, url FROM private_nodes WHERE user_id=$1", userID)
	defer rows.Close()
	for rows.Next() {
		var id int
		var alias, nurl string
		rows.Scan(&id, &alias, &nurl)
		response["private"].(map[string]map[string]string)[fmt.Sprintf("%d", id)] = map[string]string{"alias": alias, "host": nurl}
	}
	c.JSON(http.StatusOK, response)
}
