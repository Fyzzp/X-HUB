package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"os"
)

var key []byte

func SetKey(k []byte) {
	if len(k) == 32 {
		key = k
	}
}

func InitKey(cfgKey string) error {
	if cfgKey == "" {
		return errors.New("AES key not configured")
	}
	decoded, err := base64.StdEncoding.DecodeString(cfgKey)
	if err != nil {
		// If not base64, use as-is if 32 bytes
		if len([]byte(cfgKey)) == 32 {
			key = []byte(cfgKey)
			return nil
		}
		return err
	}
	if len(decoded) != 32 {
		return errors.New("AES key must be 32 bytes")
	}
	key = decoded
	return nil
}

func GetKey() []byte {
	if key == nil {
		// Try environment variable as fallback
		if envKey := os.Getenv("AES_KEY"); envKey != "" {
			InitKey(envKey)
		}
	}
	return key
}

func Encrypt(text string) (string, error) {
	k := GetKey()
	if k == nil {
		return "", errors.New("AES key not initialized")
	}
	block, err := aes.NewCipher(k)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	encrypted := gcm.Seal(nonce, nonce, []byte(text), nil)
	return base64.StdEncoding.EncodeToString(encrypted), nil
}

func Decrypt(data string) (string, error) {
	k := GetKey()
	if k == nil {
		return "", errors.New("AES key not initialized")
	}
	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(k)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := gcm.NonceSize()
	if len(decoded) < nonceSize {
		return "", err
	}
	nonce, ciphertext := decoded[:nonceSize], decoded[nonceSize:]
	decrypted, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(decrypted), nil
}
