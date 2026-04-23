package handlers

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"sync"
)

type SMTPConfig struct {
	Enabled  bool
	Host     string
	Port     int
	User     string
	Password string
	From     string
}

var cfgMu sync.RWMutex
var smtpCfg = SMTPConfig{Enabled: false}

func SetSMTP(cfg SMTPConfig) {
	cfgMu.Lock()
	smtpCfg = cfg
	cfgMu.Unlock()
}

func extractEmail(from string) string {
	idx := strings.Index(from, "<")
	if idx == -1 {
		return from
	}
	email := from[idx+1:]
	idx = strings.Index(email, ">")
	if idx == -1 {
		return email
	}
	return email[:idx]
}

func SendTestEmail(to, code string) error {
	cfgMu.RLock()
	smtp := smtpCfg
	cfgMu.RUnlock()

	if !smtp.Enabled {
		return fmt.Errorf("SMTP not enabled")
	}

	subject := "您的 X-HUB 注册验证码"
	body := fmt.Sprintf("您的验证码是：%s，10分钟内有效。", code)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		smtp.From, to, subject, body)

	addr := fmt.Sprintf("%s:%d", smtp.Host, smtp.Port)

	var err error
	if smtp.Port == 465 {
		err = sendMailSSL(addr, smtp.User, smtp.Password, smtp.From, to, []byte(msg))
	} else {
		err = sendMailSTARTTLS(addr, smtp.User, smtp.Password, smtp.From, to, []byte(msg))
	}
	return err
}

func sendEmail(to, code string) {
	defer func() {
		if r := recover(); r != nil {
			fmt.Println("sendEmail panic:", r)
		}
	}()

	cfgMu.RLock()
	smtp := smtpCfg
	cfgMu.RUnlock()

	if !smtp.Enabled {
		fmt.Println("SMTP not enabled, skipping email")
		return
	}

	subject := "您的 X-HUB 注册验证码"
	body := fmt.Sprintf("您的验证码是：%s，10分钟内有效。", code)

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
		fmt.Println("SMTP send error:", err)
	} else {
		fmt.Println("SMTP email sent to", to)
	}
}

func sendMailSSL(addr, user, pass, from, to string, msg []byte) error {
	host, _, _ := net.SplitHostPort(addr)
	conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: host})
	if err != nil {
		return fmt.Errorf("TLS dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("new client: %w", err)
	}
	defer client.Close()

	auth := smtp.PlainAuth("", user, pass, host)
	if err = client.Auth(auth); err != nil {
		return fmt.Errorf("auth: %w", err)
	}
	if err = client.Mail(extractEmail(from)); err != nil {
		return fmt.Errorf("mail from: %w", err)
	}
	if err = client.Rcpt(to); err != nil {
		return fmt.Errorf("mail to: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("data: %w", err)
	}
	_, err = w.Write(msg)
	if err != nil {
		return fmt.Errorf("write: %w", err)
	}
	if err = w.Close(); err != nil {
		return fmt.Errorf("close data: %w", err)
	}
	return client.Quit()
}

func sendMailSTARTTLS(addr, user, pass, from, to string, msg []byte) error {
	host, _, _ := net.SplitHostPort(addr)

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("new client: %w", err)
	}
	defer client.Close()

	if err = client.Hello("localhost"); err != nil {
		return fmt.Errorf("hello: %w", err)
	}

	tlsConfig := &tls.Config{ServerName: host}
	if err = client.StartTLS(tlsConfig); err != nil {
		return fmt.Errorf("starttls: %w", err)
	}

	auth := smtp.PlainAuth("", user, pass, host)
	if err = client.Auth(auth); err != nil {
		return fmt.Errorf("auth: %w", err)
	}
	if err = client.Mail(extractEmail(from)); err != nil {
		return fmt.Errorf("mail from: %w", err)
	}
	if err = client.Rcpt(to); err != nil {
		return fmt.Errorf("mail to: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("data: %w", err)
	}
	_, err = w.Write(msg)
	if err != nil {
		return fmt.Errorf("write: %w", err)
	}
	if err = w.Close(); err != nil {
		return fmt.Errorf("close data: %w", err)
	}
	return client.Quit()
}
