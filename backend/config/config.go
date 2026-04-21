package config

import (
	"encoding/json"
	"os"
)

type Config struct {
	Server struct {
		Listen          string `json:"listen"`
		PollingInterval int    `json:"polling_interval"`
	} `json:"server"`
	Database struct {
		Host     string `json:"host"`
		Port     int    `json:"port"`
		User     string `json:"user"`
		Password string `json:"password"`
		DBName   string `json:"dbname"`
		SSLMode  string `json:"sslmode"`
	} `json:"database"`
	Cache struct {
		Host     string `json:"host"`
		Port     int    `json:"port"`
		Password string `json:"password"`
		Prefix   string `json:"prefix"`
	} `json:"cache"`
	SMTP struct {
		Enabled  bool   `json:"enabled"`
		Host     string `json:"host"`
		Port     int    `json:"port"`
		User     string `json:"user"`
		Password string `json:"password"`
		From     string `json:"from"`
	} `json:"smtp"`
}

func Load(path string) *Config {
	data, err := os.ReadFile(path)
	if err != nil {
		panic("failed to read config: " + err.Error())
	}
	var cfg Config
	cfg.Server.Listen = ":6636"
	cfg.Server.PollingInterval = 60
	cfg.Database.Host = "127.0.0.1"
	cfg.Database.Port = 5432
	cfg.Database.SSLMode = "disable"
	cfg.Cache.Host = "127.0.0.1"
	cfg.Cache.Port = 6379
	_ = json.Unmarshal(data, &cfg)
	return &cfg
}
