package middleware

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

type RateLimiter struct {
	redis *redis.Client
}

func NewRateLimiter(r *redis.Client) *RateLimiter {
	return &RateLimiter{redis: r}
}

func (rl *RateLimiter) Allow(key string, limit int, window time.Duration) (bool, error) {
	ctx := context.Background()
	count, err := rl.redis.Incr(ctx, key).Result()
	if err != nil {
		return false, err
	}
	if count == 1 {
		rl.redis.Expire(ctx, key, window)
	}
	return count <= int64(limit), nil
}
