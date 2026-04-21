package models

import (
	"encoding/json"
	"time"
)

type User struct {
	ID           int       `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email,omitempty"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

type NodeConfig struct {
	URL      string `json:"url"`
	BasePath string `json:"base_path"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type PrivateNode struct {
	ID                 int       `json:"id"`
	UserID             int       `json:"user_id"`
	AliasName          string    `json:"alias_name"`
	URL                string    `json:"url"`
	BasePath           string    `json:"base_path"`
	PanelUser          string    `json:"panel_user"`
	PanelPass          string    `json:"panel_pass"`
	CreatedAt          time.Time `json:"created_at"`
	XrayTemplateConfig string    `json:"xray_template_config,omitempty"`
}

type BaseRequest struct {
	NodeID string `json:"node_id"`
}

type DeployRequest struct {
	BaseRequest
	InboundID    int             `json:"inbound_id"`
	InboundData  json.RawMessage `json:"inbound_data"`
	OutboundData json.RawMessage `json:"outbound_data"`
	RoutingData  json.RawMessage `json:"routing_data"`
}

type DeploySocks5Request struct {
	NodeID      string `json:"node_id"`
	InboundID   int    `json:"inbound_id"`
	Socks5List  string `json:"socks5_list"`
	TagPrefix   string `json:"tag_prefix"`
	StartNumber int    `json:"start_number"`
	Order       string `json:"order"`
}

type DeleteRequest struct {
	BaseRequest
	InboundID    int      `json:"inbound_id"`
	ClientID     string   `json:"client_id"`
	ClientIDs    []string `json:"client_ids"`
	TagsToDelete []string `json:"tags_to_delete"`
}
