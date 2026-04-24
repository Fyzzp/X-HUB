package handlers

import (
	"log"
	"strconv"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"xhub/cache"
	"xhub/crypto"
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
	// S-03: Encrypt panel password before saving
	encryptedPass, _ := crypto.Encrypt(node.Pass)
	result, err := database.DB.Exec(
		"INSERT INTO private_nodes (user_id, alias_name, url, base_path, panel_user, panel_pass) VALUES ($1, $2, $3, $4, $5, $6)",
		userID, node.Alias, node.URL, node.BasePath, node.User, encryptedPass,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "保存失败"})
		return
	}
	// B-05: Audit log - node created
	nodeID, _ := result.LastInsertId()
	var username string
	database.DB.QueryRow("SELECT username FROM users WHERE id=$1", userID).Scan(&username)
	database.LogAudit(userID, username, "create_node", getRealIP(c), c.GetHeader("User-Agent"), map[string]interface{}{"node_id": nodeID, "alias": node.Alias, "url": node.URL})
	c.JSON(http.StatusOK, gin.H{"success": true, "msg": "节点已保存"})
}

// Check if user already has a node with the same IP
func CheckNodeDuplicate(c *gin.Context) {
	userID := c.GetInt("user_id")
	var req struct {
		URL string `json:"url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "参数错误"})
		return
	}

	log.Printf("DEBUG CheckNodeDuplicate: input URL=%s, userID=%d", req.URL, userID)

	// Extract host from URL (remove protocol and port)
	host := req.URL
	if len(host) > 8 && host[:8] == "https://" {
		host = host[8:]
	} else if len(host) > 7 && host[:7] == "http://" {
		host = host[7:]
	}
	// Remove port and path
	for i := 0; i < len(host); i++ {
		if host[i] == ':' || host[i] == '/' {
			host = host[:i]
			break
		}
	}
	log.Printf("DEBUG CheckNodeDuplicate: extracted host=%s", host)

	// Extract host from stored URLs and compare exactly
	rows, err := database.DB.Query(
		"SELECT id, url FROM private_nodes WHERE user_id=$1", userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "查询失败"})
		return
	}
	defer rows.Close()

	duplicate := false
	for rows.Next() {
		var id int
		var storedURL string
		if err := rows.Scan(&id, &storedURL); err != nil {
			continue
		}
		// Extract host from stored URL
		storedHost := storedURL
		if len(storedHost) > 8 && storedHost[:8] == "https://" {
			storedHost = storedHost[8:]
		} else if len(storedHost) > 7 && storedHost[:7] == "http://" {
			storedHost = storedHost[7:]
		}
		for i := 0; i < len(storedHost); i++ {
			if storedHost[i] == ':' || storedHost[i] == '/' {
				storedHost = storedHost[:i]
				break
			}
		}
		log.Printf("DEBUG CheckNodeDuplicate: comparing input=%s with stored=%s", host, storedHost)
		if storedHost == host {
			duplicate = true
			break
		}
	}

	log.Printf("DEBUG CheckNodeDuplicate: duplicate=%v", duplicate)

	if duplicate {
		c.JSON(http.StatusOK, gin.H{"duplicate": true, "msg": "该节点已添加"})
	} else {
		c.JSON(http.StatusOK, gin.H{"duplicate": false, "msg": "无重复"})
	}
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
		// S-03: Decrypt panel password when reading
		decryptedPass, _ := crypto.Decrypt(ppass)
		pnodes = append(pnodes, gin.H{"id": pid, "username": uname, "alias": alias, "url": purl, "base_path": ppath, "panel_user": puser, "panel_pass": decryptedPass})
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
	var adminUsername string
	database.DB.QueryRow("SELECT username FROM users WHERE id=$1", userID).Scan(&adminUsername)

	var req struct {
		Action string `json:"action"`
		ID     int    `json:"id"`
	}
	c.ShouldBindJSON(&req)
	if req.Action == "delete_user" {
		// Get username before deletion for audit log
		var targetUsername string
		database.DB.QueryRow("SELECT username FROM users WHERE id=$1", req.ID).Scan(&targetUsername)

		// Delete user's session from cache
		cache.Del("session:" + strconv.Itoa(req.ID))
		database.DB.Exec("DELETE FROM private_nodes WHERE user_id=$1", req.ID)
		database.DB.Exec("DELETE FROM users WHERE id=$1", req.ID)
		// B-05: Audit log - admin delete user
		database.LogAudit(userID, adminUsername, "admin_delete_user", getRealIP(c), c.GetHeader("User-Agent"), map[string]interface{}{"target_user_id": req.ID, "target_username": targetUsername})
		c.JSON(http.StatusOK, gin.H{"code": 0, "msg": "用户已删除"})
	} else if req.Action == "delete_node" {
		// Get node info before deletion for audit log
		var nodeAlias, nodeURL string
		database.DB.QueryRow("SELECT alias_name, url FROM private_nodes WHERE id=$1", req.ID).Scan(&nodeAlias, &nodeURL)

		database.DB.Exec("DELETE FROM private_nodes WHERE id=$1", req.ID)
		// B-05: Audit log - admin delete node
		database.LogAudit(userID, adminUsername, "admin_delete_node", getRealIP(c), c.GetHeader("User-Agent"), map[string]interface{}{"node_id": req.ID, "alias": nodeAlias, "url": nodeURL})
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