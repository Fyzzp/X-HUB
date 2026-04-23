package handlers

import (
	"bytes"
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"xhub/crypto"

	"github.com/gin-gonic/gin"
	"xhub/cache"
	"xhub/database"
	"xhub/models"
)

var (
	httpClients  = make(map[string]*http.Client)
	clientMutex sync.Mutex
)

type socks5ClientData struct {
	email  string
	uuid   string
	subID  string
	socks5 map[string]string
}

func resolveNode(userID int, nodeID string) (models.NodeConfig, error) {
	if strings.HasPrefix(nodeID, "private|") {
		dbID := strings.TrimPrefix(nodeID, "private|")
		var n models.NodeConfig
		var encryptedPass string
		err := database.DB.QueryRow(
			"SELECT url, base_path, panel_user, panel_pass FROM private_nodes WHERE id=$1 AND user_id=$2",
			dbID, userID,
		).Scan(&n.URL, &n.BasePath, &n.Username, &encryptedPass)
		if err != nil {
			return n, err
		}
		// S-03: Decrypt panel password for PanelRequest
		n.Password, _ = crypto.Decrypt(encryptedPass)
		return n, nil
	}
	return models.NodeConfig{}, fmt.Errorf("无效的节点标识")
}

func resolveNodeByID(userID int, dbID int) (models.NodeConfig, error) {
	var n models.NodeConfig
	var encryptedPass string
	err := database.DB.QueryRow(
		"SELECT url, base_path, panel_user, panel_pass FROM private_nodes WHERE id=$1 AND user_id=$2",
		dbID, userID,
	).Scan(&n.URL, &n.BasePath, &n.Username, &encryptedPass)
	if err != nil {
		return n, err
	}
	// S-03: Decrypt panel password for PanelRequest
	n.Password, _ = crypto.Decrypt(encryptedPass)
	return n, nil
}

func PanelRequest(node models.NodeConfig, path, method, contentType string, body []byte) ([]byte, error) {
	poolKey := node.URL + node.Username
	clientMutex.Lock()
	client, hasClient := httpClients[poolKey]
	if !hasClient {
		jar, _ := cookiejar.New(nil)
		client = &http.Client{
			Jar: jar,
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		}
		httpClients[poolKey] = client
	}
	clientMutex.Unlock()

	var req *http.Request
	if body != nil {
		req, _ = http.NewRequest(method, node.URL+node.BasePath+path, bytes.NewBuffer(body))
	} else {
		req, _ = http.NewRequest(method, node.URL+node.BasePath+path, nil)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.Header.Set("X-Requested-With", "XMLHttpRequest")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	resBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	bodyStr := string(resBody)
	if resp.StatusCode != 200 || !strings.HasPrefix(strings.TrimSpace(bodyStr), "{") || strings.Contains(bodyStr, `"success":false`) {
		log.Printf("DEBUG PanelRequest login: user=%s, pass=%s, url=%s", node.Username, node.Password, node.URL+node.BasePath)
	loginReq, _ := http.NewRequest("POST", node.URL+node.BasePath+"/login",
			strings.NewReader(url.Values{"username": {node.Username}, "password": {node.Password}}.Encode()))
		loginReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		if loginResp, _ := client.Do(loginReq); loginResp != nil {
			io.Copy(io.Discard, loginResp.Body)
			loginResp.Body.Close()
		}
		resp, err = client.Do(req)
		if err != nil {
			return nil, err
		}
		resBody, _ = io.ReadAll(resp.Body)
		resp.Body.Close()
	}
	return resBody, nil
}

// Test panel connectivity before saving node (with short timeout)
func TestNodeConnection(c *gin.Context) {
	var req struct {
		URL      string `json:"url"`
		BasePath string `json:"base_path"`
		User     string `json:"user"`
		Pass     string `json:"pass"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "参数错误"})
		return
	}

	// Use dedicated client with 3 second timeout
	testClient := &http.Client{
		Timeout: 3 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	// Try to login
	loginReq, _ := http.NewRequest("POST", req.URL+req.BasePath+"/login",
		strings.NewReader(url.Values{"username": {req.User}, "password": {req.Pass}}.Encode()))
	loginReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	loginReq.Header.Set("X-Requested-With", "XMLHttpRequest")

	resp, err := testClient.Do(loginReq)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "msg": "连接超时（3秒），请检查地址是否正确"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)

	// 3x-ui returns {"success": true} on successful login
	if strings.Contains(bodyStr, `"success":true`) {
		c.JSON(http.StatusOK, gin.H{"success": true, "msg": "连接成功"})
	} else {
		c.JSON(http.StatusOK, gin.H{"success": false, "msg": "登录失败：请检查用户名密码"})
	}
}

func GetNodeInbounds(c *gin.Context) {
	userID := c.GetInt("user_id")
	nodeID := c.Query("node_id")
	if nodeID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "缺少节点ID"})
		return
	}

	node, err := resolveNode(userID, nodeID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "msg": err.Error()})
		return
	}

	res, err := PanelRequest(node, "/panel/api/inbounds/list", "GET", "", nil)
	if err != nil || len(res) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "连接面板失败"})
		return
	}

	var result map[string]interface{}
	if err := json.Unmarshal(res, &result); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "解析失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}

func GetNodeStatus(c *gin.Context) {
	userID := c.GetInt("user_id")
	nodeID := c.Query("node_id")
	if nodeID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "缺少节点ID"})
		return
	}

	dbID := strings.TrimPrefix(nodeID, "private|")
	var node models.NodeConfig
	err := database.DB.QueryRow(
		"SELECT url, base_path FROM private_nodes WHERE id=$1 AND user_id=$2",
		dbID, userID,
	).Scan(&node.URL, &node.BasePath)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "msg": "节点不存在"})
		return
	}

	client := &http.Client{Timeout: 5 * time.Second, Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}
	resp, err := client.Get(node.URL + node.BasePath + "/login")
	if err != nil || resp == nil {
		c.JSON(http.StatusOK, gin.H{"online": false, "msg": "离线"})
		return
	}
	defer resp.Body.Close()
	c.JSON(http.StatusOK, gin.H{"online": true, "msg": "在线"})
}

func GetSubscription(c *gin.Context) {
	userID := c.GetInt("user_id")
	nodeID := c.Param("node_id")
	if nodeID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "缺少节点ID"})
		return
	}

	dbID := strings.TrimPrefix(nodeID, "private|")
	var intID int
	fmt.Sscanf(dbID, "%d", &intID)
	node, err := resolveNodeByID(userID, intID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "msg": "节点不存在"})
		return
	}

	res, err := PanelRequest(node, "/panel/api/inbounds/list", "GET", "", nil)
	if err != nil || len(res) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "获取配置失败"})
		return
	}

	subBase64 := base64.StdEncoding.EncodeToString(res)
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(subBase64))
}

func GetInbounds(c *gin.Context) {
	userID := c.GetInt("user_id")
	var req models.BaseRequest
	if c.Request.Method == "GET" {
		req.NodeID = c.Query("node_id")
	} else {
		c.ShouldBindJSON(&req)
	}

	if cachedData, err := cache.Get("node:" + req.NodeID); err == nil {
		c.Data(http.StatusOK, "application/json", []byte(cachedData))
		return
	}

	node, err := resolveNode(userID, req.NodeID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "msg": err.Error()})
		return
	}

	res, err := PanelRequest(node, "/panel/api/inbounds/list", "GET", "", nil)
	if err != nil || len(res) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "连接面板失败"})
		return
	}
	cache.Set("node:"+req.NodeID, string(res), 0)
	c.Data(http.StatusOK, "application/json", res)
}

func DeleteInbound(c *gin.Context) {
	userID := c.GetInt("user_id")
	var req models.DeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "参数错误"})
		return
	}

	node, err := resolveNode(userID, req.NodeID)
	if err != nil {
		log.Printf("DEBUG: resolveNode failed for NodeID=%s, userID=%d, err=%v", req.NodeID, userID, err)
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "msg": err.Error()})
		return
	}
	log.Printf("DEBUG: resolveNode success for NodeID=%s, userID=%d", req.NodeID, userID)

	// Special case: inbound_id == 0 means delete the entire node (private_nodes record)
	if req.InboundID == 0 {
		// NodeID format is "private|X", extract the numeric part
		nodeIDStr := strings.Split(req.NodeID, "|")
		nodeID, _ := strconv.Atoi(nodeIDStr[len(nodeIDStr)-1])
		// Get node info and username for audit log before deletion
		var nodeAlias, nodeURL, username string
		database.DB.QueryRow("SELECT alias_name, url FROM private_nodes WHERE id=$1", nodeID).Scan(&nodeAlias, &nodeURL)
		database.DB.QueryRow("SELECT username FROM users WHERE id=$1", userID).Scan(&username)
		log.Printf("DEBUG: Deleting node id=%d, NodeID=%s, userID=%d", nodeID, req.NodeID, userID)
		database.DB.Exec("DELETE FROM private_nodes WHERE id=$1", nodeID)
		log.Printf("DEBUG: Delete completed for node id=%d", nodeID)
		// B-05: Audit log - user delete node
		log.Printf("DEBUG: About to log audit for node delete, userID=%d, IP=%s", userID, c.ClientIP())
		database.LogAudit(userID, username, "user_delete_node", c.ClientIP(), c.GetHeader("User-Agent"), map[string]interface{}{"node_id": nodeID, "alias": nodeAlias, "url": nodeURL})
		log.Printf("DEBUG: Audit log called")
		c.JSON(http.StatusOK, gin.H{"success": true, "msg": "节点已删除"})
		return
	}

	var emailsToClean []string

	emailMap := getClientEmailMap(node)

	if req.ClientID != "" {
		if email, ok := emailMap[req.ClientID]; ok && email != "" {
			emailsToClean = append(emailsToClean, email)
		}
		PanelRequest(node, fmt.Sprintf("/panel/api/inbounds/%d/delClient/%s", req.InboundID, req.ClientID), "POST", "", nil)
	} else if len(req.ClientIDs) > 0 {
		for _, cid := range req.ClientIDs {
			if email, ok := emailMap[cid]; ok && email != "" {
				emailsToClean = append(emailsToClean, email)
			}
			PanelRequest(node, fmt.Sprintf("/panel/api/inbounds/%d/delClient/%s", req.InboundID, cid), "POST", "", nil)
		}
	} else if len(req.TagsToDelete) > 0 {
		emailsToClean = req.TagsToDelete
	} else {
		// Delete entire inbound - collect all client emails FIRST before deletion
		inboundsRes, err := PanelRequest(node, "/panel/api/inbounds/list", "GET", "", nil)
		if err == nil && len(inboundsRes) > 0 {
			var inboundsResult map[string]interface{}
			if json.Unmarshal(inboundsRes, &inboundsResult) == nil {
				if inbounds, ok := inboundsResult["obj"].([]interface{}); ok {
					for _, ib := range inbounds {
						if ibMap, ok := ib.(map[string]interface{}); ok {
							if ibId, ok := ibMap["id"].(float64); ok && int(ibId) == req.InboundID {
								if clientStats, ok := ibMap["clientStats"].([]interface{}); ok {
									for _, cs := range clientStats {
										if csm, ok := cs.(map[string]interface{}); ok {
											if email, ok := csm["email"].(string); ok && email != "" {
												emailsToClean = append(emailsToClean, email)
											}
										}
									}
								}
								break
							}
						}
					}
				}
			}
		}
		PanelRequest(node, fmt.Sprintf("/panel/api/inbounds/del/%d", req.InboundID), "POST", "", nil)
	}

	if len(emailsToClean) > 0 {
		cleanOrphanedRules(node, emailsToClean)
	}

	refreshSingleNodeCache(req.NodeID, node)
	c.JSON(http.StatusOK, gin.H{"success": true, "msg": "删除成功"})
}

func getClientEmailByUUID(node models.NodeConfig, inboundID int, uuid string) string {
	res, err := PanelRequest(node, fmt.Sprintf("/panel/api/inbounds/%d/getClient/%s", inboundID, uuid), "GET", "", nil)
	if err != nil || len(res) == 0 {
		return ""
	}
	var result map[string]interface{}
	if err := json.Unmarshal(res, &result); err != nil {
		return ""
	}
	settings, ok := result["settings"].(map[string]interface{})
	if !ok {
		return ""
	}
	clients, ok := settings["clients"].([]interface{})
	if !ok {
		return ""
	}
	for _, client := range clients {
		if c, ok := client.(map[string]interface{}); ok {
			if id, ok := c["id"].(string); ok && id == uuid {
				if email, ok := c["email"].(string); ok {
					return email
				}
			}
		}
	}
	return ""
}

type clientInfo struct {
	ID    int
	UUID  string
	Email string
}

func getClientEmailMap(node models.NodeConfig) map[string]string {
	emails := make(map[string]string)
	res, err := PanelRequest(node, "/panel/api/inbounds/list", "GET", "", nil)
	if err != nil || len(res) == 0 {
		return emails
	}

	var result map[string]interface{}
	if err := json.Unmarshal(res, &result); err != nil {
		return emails
	}

	obj, ok := result["obj"].([]interface{})
	if !ok {
		return emails
	}

	for _, inbound := range obj {
		if ib, ok := inbound.(map[string]interface{}); ok {
			// Try clientStats first (contains email and uuid directly)
			if clientStats, ok := ib["clientStats"].([]interface{}); ok {
				for _, stat := range clientStats {
					if cs, ok := stat.(map[string]interface{}); ok {
						uuid, _ := cs["uuid"].(string)
						email, _ := cs["email"].(string)
						if uuid != "" && email != "" {
							emails[uuid] = email
						}
					}
				}
			}
			// Also try parsing settings string if clientStats is empty
			if len(emails) == 0 {
				if settingsStr, ok := ib["settings"].(string); ok {
					var settingsObj map[string]interface{}
					if err := json.Unmarshal([]byte(settingsStr), &settingsObj); err == nil {
						if clients, ok := settingsObj["clients"].([]interface{}); ok {
							for _, client := range clients {
								if c, ok := client.(map[string]interface{}); ok {
									var cli clientInfo
									if id, ok := c["id"].(string); ok {
										cli.UUID = id
									} else if idInt, ok := c["id"].(float64); ok {
										cli.UUID = fmt.Sprintf("%d", int(idInt))
									}
									if e, ok := c["email"].(string); ok {
										cli.Email = e
									}
									if cli.UUID != "" && cli.Email != "" {
										emails[cli.UUID] = cli.Email
									}
								}
							}
						}
					}
				}
			}
		}
	}
	return emails
}

func cleanOrphanedRules(node models.NodeConfig, emails []string) error {
	res, err := PanelRequest(node, "/panel/xray/", "POST", "", nil)
	if err != nil || len(res) == 0 {
		return fmt.Errorf("获取xray配置失败: %v", err)
	}

	var apiResp struct {
		Success bool   `json:"success"`
		Obj     string `json:"obj"`
	}
	if err := json.Unmarshal(res, &apiResp); err != nil {
		return fmt.Errorf("解析xray配置失败: %v", err)
	}

	// Parse the obj string which contains the xrayTemplateConfig
	// API returns: {inboundTags, outboundTestUrl, xraySetting}
	var tpl struct {
		InboundTags     []string                 `json:"inboundTags"`
		OutboundTestUrl string                   `json:"outboundTestUrl"`
		XraySetting     map[string]interface{}    `json:"xraySetting"`
	}
	if err := json.Unmarshal([]byte(apiResp.Obj), &tpl); err != nil {
		return fmt.Errorf("解析xray模板失败: %v", err)
	}

	// xraySetting may be triple-nested due to 3x-ui bug - unwrap until we get the actual config
	xrayConfig := tpl.XraySetting
	for {
		if nested, ok := xrayConfig["xraySetting"].(map[string]interface{}); ok {
			xrayConfig = nested
		} else {
			break
		}
	}

	if outbounds, ok := xrayConfig["outbounds"].([]interface{}); ok {
		cleanedOutbounds := make([]interface{}, 0)
		for _, ob := range outbounds {
			if obMap, ok := ob.(map[string]interface{}); ok {
				tag, _ := obMap["tag"].(string)
				if tag == "direct" || tag == "blocked" || tag == "api" {
					cleanedOutbounds = append(cleanedOutbounds, ob)
				} else {
					shouldDelete := false
					for _, email := range emails {
						if tag == email {
							shouldDelete = true
							break
						}
					}
					if !shouldDelete {
						cleanedOutbounds = append(cleanedOutbounds, ob)
					}
				}
			}
		}
		xrayConfig["outbounds"] = cleanedOutbounds
	}

	if routing, ok := xrayConfig["routing"].(map[string]interface{}); ok {
		if rules, ok := routing["rules"].([]interface{}); ok {
			cleanedRules := make([]interface{}, 0)
			for _, rule := range rules {
				if ruleMap, ok := rule.(map[string]interface{}); ok {
					user := ruleMap["user"]
					shouldDelete := false
					if userStr, ok := user.(string); ok {
						for _, email := range emails {
							if userStr == email {
								shouldDelete = true
								break
							}
						}
					} else if userArr, ok := user.([]interface{}); ok {
						for _, u := range userArr {
							if uStr, ok := u.(string); ok {
								for _, email := range emails {
									if uStr == email {
										shouldDelete = true
										break
									}
								}
							}
							if shouldDelete {
								break
							}
						}
					}
					if !shouldDelete {
						cleanedRules = append(cleanedRules, rule)
					}
				}
			}
			routing["rules"] = cleanedRules
		}
	}

	// Send the modified xrayConfig directly
	newSetting, _ := json.Marshal(xrayConfig)
	updateData := url.Values{"xraySetting": {string(newSetting)}}
	PanelRequest(node, "/panel/xray/update", "POST", "application/x-www-form-urlencoded", []byte(updateData.Encode()))
	return nil
}

func DeployInbound(c *gin.Context) {
	userID := c.GetInt("user_id")
	var req models.DeployRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "参数错误"})
		return
	}

	node, err := resolveNode(userID, req.NodeID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "msg": err.Error()})
		return
	}

	apiPath := "/panel/api/inbounds/add"
	if req.InboundID > 0 {
		apiPath = "/panel/api/inbounds/addClient"
	}

	inData, _ := json.Marshal(req.InboundData)
	_, err = PanelRequest(node, apiPath, "POST", "application/json", inData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "写入失败"})
		return
	}

	refreshSingleNodeCache(req.NodeID, node)
	c.JSON(http.StatusOK, gin.H{"success": true, "msg": "下发完毕"})
}

func DeploySocks5(c *gin.Context) {
	userID := c.GetInt("user_id")
	var req struct {
		NodeID      string `json:"node_id"`
		InboundID   int    `json:"inbound_id"`
		Socks5List  string `json:"socks5_list"`
		TagPrefix   string `json:"tag_prefix"`
		StartNumber int    `json:"start_number"`
		Order       string `json:"order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "参数错误"})
		return
	}

	node, err := resolveNode(userID, req.NodeID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "msg": err.Error()})
		return
	}

	socks5List := parseSocks5List(req.Socks5List)
	if len(socks5List) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "SOCKS5 列表解析失败或为空"})
		return
	}

	if req.Order == "desc" {
		for i, j := 0, len(socks5List)-1; i < j; i, j = i+1, j-1 {
			socks5List[i], socks5List[j] = socks5List[j], socks5List[i]
		}
	}

	clients := make([]socks5ClientData, 0, len(socks5List))
	for i, socks5 := range socks5List {
		num := req.StartNumber + i
		numStr := strconv.Itoa(num)
		if num < 10 {
			numStr = "0" + numStr
		}
		email := req.TagPrefix + numStr
		clients = append(clients, socks5ClientData{
			email:  email,
			uuid:   generateUUID(),
			subID:  generateSubID(),
			socks5: socks5,
		})
	}

	if req.InboundID > 0 {
		for _, client := range clients {
			clientReq := map[string]interface{}{
				"id":         client.uuid,
				"email":      client.email,
				"subId":      client.subID,
				"enable":     true,
				"flow":       "",
				"limitIp":    0,
				"tgId":       "",
				"expiryTime": 0,
				"totalGB":    0,
				"reset":      0,
			}
			settings := map[string]interface{}{
				"clients": []interface{}{clientReq},
			}
			settingsJSON, _ := json.Marshal(settings)
			addClientData := map[string]interface{}{
				"id":       req.InboundID,
				"settings": string(settingsJSON),
			}
			addClientJSON, _ := json.Marshal(addClientData)
			PanelRequest(node, "/panel/api/inbounds/addClient", "POST", "application/json", addClientJSON)
		}
	} else if req.InboundID == 0 {
		port := 50000 + int(time.Now().UnixNano()%10000)
		settings := map[string]interface{}{
			"clients": []interface{}{},
		}
		settingsJSON, _ := json.Marshal(settings)
		streamSettings := map[string]interface{}{
			"network": "tcp",
			"security": "none",
			"tcpSettings": map[string]interface{}{
				"header": map[string]interface{}{
					"type": "none",
				},
			},
		}
		streamSettingsJSON, _ := json.Marshal(streamSettings)
		sniffing := map[string]interface{}{
			"enabled":      false,
			"destOverride": []interface{}{"http", "tls"},
		}
		sniffingJSON, _ := json.Marshal(sniffing)
		newInbound := map[string]interface{}{
			"up":             0,
			"down":           0,
			"total":          0,
			"remark":         "",
			"enable":         true,
			"expiryTime":     0,
			"listen":         "",
			"port":           port,
			"protocol":       "vmess",
			"settings":       string(settingsJSON),
			"streamSettings": string(streamSettingsJSON),
			"sniffing":       string(sniffingJSON),
		}
		newInboundJSON, _ := json.Marshal(newInbound)
		resp, err := PanelRequest(node, "/panel/api/inbounds/add", "POST", "application/json", newInboundJSON)
		if err != nil {
			log.Printf("DEBUG DeploySocks5: inbound_id=%d, resp=: %v\nresp: %s", err, resp)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "创建入站失败: " + err.Error()})
			return
		}
		var addResp struct {
			Success bool `json:"success"`
			Msg     string `json:"msg"`
			Obj     struct {
				ID int `json:"id"`
			} `json:"obj"`
		}
		json.Unmarshal(resp, &addResp)
		if !addResp.Success || addResp.Obj.ID == 0 {
			log.Printf("DEBUG DeploySocks5 failed: msg=%s, resp=%s", addResp.Msg, string(resp))
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "创建入站失败: " + addResp.Msg})
			return
		}
		newInboundID := addResp.Obj.ID
		for _, client := range clients {
			clientReq := map[string]interface{}{
				"id":         client.uuid,
				"email":      client.email,
				"subId":      client.subID,
				"enable":     true,
				"flow":       "",
				"limitIp":    0,
				"tgId":       "",
				"expiryTime": 0,
				"totalGB":    0,
				"reset":      0,
			}
			settings := map[string]interface{}{
				"clients": []interface{}{clientReq},
			}
			settingsJSON, _ := json.Marshal(settings)
			addClientData := map[string]interface{}{
				"id":       newInboundID,
				"settings": string(settingsJSON),
			}
			addClientJSON, _ := json.Marshal(addClientData)
			PanelRequest(node, "/panel/api/inbounds/addClient", "POST", "application/json", addClientJSON)
		}
		req.InboundID = newInboundID
	}

	if err := updateSocks5XrayRules(node, clients, req.InboundID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "更新路由规则失败: " + err.Error()})
		return
	}

	PanelRequest(node, "/panel/api/server/restartXrayService", "POST", "", nil)

	refreshSingleNodeCache(req.NodeID, node)
	c.JSON(http.StatusOK, gin.H{"success": true, "msg": fmt.Sprintf("部署成功，共 %d 条", len(clients))})
}

func parseSocks5List(socks5List string) []map[string]string {
	lines := strings.Split(strings.TrimSpace(socks5List), "\n")
	result := make([]map[string]string, 0)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var socks5 map[string]string
		if strings.Count(line, ":") == 3 && !strings.Contains(line, "@") {
			parts := strings.Split(line, ":")
			socks5 = map[string]string{
				"address":  parts[0],
				"port":     parts[1],
				"username": parts[2],
				"password": parts[3],
			}
		} else if strings.Contains(line, "@") {
			leftRight := strings.Split(line, "@")
			if len(leftRight) == 2 {
				ipPort := strings.Split(leftRight[0], ":")
				userPass := strings.Split(leftRight[1], ":")
				if len(ipPort) == 2 && len(userPass) == 2 {
					socks5 = map[string]string{
						"address":  ipPort[0],
						"port":     ipPort[1],
						"username": userPass[0],
						"password": userPass[1],
					}
				}
			}
		}
		if socks5 != nil {
			result = append(result, socks5)
		}
	}
	return result
}

func generateUUID() string {
	bytes := make([]byte, 16)
	rand.Read(bytes)
	// Set version to 0100 (v4)
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	// Set variant to 10xx
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%04x%08x",
		bytes[0:4], bytes[4:6], bytes[6:8], bytes[8:10], bytes[10:12], bytes[12:16])
}

func generateSubID() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func updateSocks5XrayRules(node models.NodeConfig, clients []socks5ClientData, inboundID int) error {
	res, err := PanelRequest(node, "/panel/xray/", "POST", "", nil)
	if err != nil || len(res) == 0 {
		return fmt.Errorf("获取xray配置失败")
	}

	var wrapper struct {
		Obj string `json:"obj"`
	}
	if err := json.Unmarshal(res, &wrapper); err != nil {
		return fmt.Errorf("解析xray配置失败: %v", err)
	}

	var objMap struct {
		XraySetting json.RawMessage `json:"xraySetting"`
	}
	if err := json.Unmarshal([]byte(wrapper.Obj), &objMap); err != nil {
		return fmt.Errorf("解析xray配置失败: %v", err)
	}

	var xray map[string]interface{}
	if err := json.Unmarshal(objMap.XraySetting, &xray); err != nil {
		return fmt.Errorf("解析xray模板失败: %v", err)
	}

	outbounds, ok := xray["outbounds"].([]interface{})
	if !ok {
		outbounds = []interface{}{}
	}
	for _, client := range clients {
		port, _ := strconv.Atoi(client.socks5["port"])
		socks5Outbound := map[string]interface{}{
			"tag":      client.email,
			"protocol": "socks",
			"settings": map[string]interface{}{
				"servers": []interface{}{
					map[string]interface{}{
						"address": client.socks5["address"],
						"port":    port,
						"users": []interface{}{
							map[string]interface{}{
								"user": client.socks5["username"],
								"pass": client.socks5["password"],
							},
						},
					},
				},
			},
		}
		outbounds = append(outbounds, socks5Outbound)
	}
	xray["outbounds"] = outbounds

	routing, ok := xray["routing"].(map[string]interface{})
	if !ok {
		routing = map[string]interface{}{
			"domainStrategy": "AsIs",
			"rules":          []interface{}{},
		}
	}
	rules, ok := routing["rules"].([]interface{})
	if !ok {
		rules = []interface{}{}
	}
	for _, client := range clients {
		routeRule := map[string]interface{}{
			"type":        "field",
			"outboundTag": client.email,
			"user":        []string{client.email},
		}
		rules = append(rules, routeRule)
	}
	routing["rules"] = rules
	xray["routing"] = routing

	newSetting, _ := json.Marshal(xray)
	updateData := url.Values{"xraySetting": {string(newSetting)}}
	PanelRequest(node, "/panel/xray/update", "POST", "application/x-www-form-urlencoded", []byte(updateData.Encode()))
	return nil
}

func RestartXray(c *gin.Context) {
	userID := c.GetInt("user_id")
	var req models.BaseRequest
	c.ShouldBindJSON(&req)

	node, err := resolveNode(userID, req.NodeID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "msg": err.Error()})
		return
	}

	_, err = PanelRequest(node, "/panel/api/server/restartXrayService", "POST", "", nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "重启失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "msg": "Xray 已重启"})
}

func refreshSingleNodeCache(nodeID string, node models.NodeConfig) {
	go func() {
		if res, err := PanelRequest(node, "/panel/api/inbounds/list", "GET", "", nil); err == nil && len(res) > 0 {
			cache.Set("node:"+nodeID, string(res), 0)
		}
	}()
}
