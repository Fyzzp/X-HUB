package cache

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
	"xhub/config"
)

var (
	Client *redis.Client
	Prefix string
	ctx    = context.Background()
)

func Init(cfg *config.Config) {
	Prefix = cfg.Cache.Prefix
	Client = redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", cfg.Cache.Host, cfg.Cache.Port),
		Password: cfg.Cache.Password,
		DB:       0,
	})
	if err := Client.Ping(ctx).Err(); err != nil {
		log.Fatal("Redis connection failed:", err)
	}
	log.Println("Redis connected successfully")
}

func Set(key string, value interface{}, expiration time.Duration) error {
	return Client.Set(ctx, Prefix+":"+key, value, expiration).Err()
}

func Get(key string) (string, error) {
	return Client.Get(ctx, Prefix+":"+key).Result()
}

func Del(key string) error {
	return Client.Del(ctx, Prefix+":"+key).Err()
}
