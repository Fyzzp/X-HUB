#!/bin/bash

# X-HUB 一键安装脚本
# 适用于 Ubuntu/Debian

set -e

echo "=========================================="
echo "         X-HUB 一键安装脚本"
echo "=========================================="

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    echo "请使用 root 用户运行此脚本"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[1/7] 检查依赖..."

# 检查 Go
if ! command -v go &> /dev/null; then
    echo "安装 Go..."
    LATEST=$(curl -s https://go.dev/VERSION?m=text | head -1)
    wget -q "https://go.dev/dl/${LATEST}.linux-amd64.tar.gz"
    rm -rf /usr/local/go
    tar -C /usr/local -xzf "${LATEST}.linux-amd64.tar.gz"
    rm "${LATEST}.linux-amd64.tar.gz"
    export PATH=$PATH:/usr/local/go/bin
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "安装 Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi

# 检查 Git
if ! command -v git &> /dev/null; then
    echo "安装 Git..."
    apt-get update
    apt-get install -y git
fi

# 检查 PostgreSQL
if ! command -v psql &> /dev/null; then
    echo "安装 PostgreSQL..."
    apt-get update
    apt-get install -y postgresql postgresql-contrib
    systemctl start postgresql
    systemctl enable postgresql
fi

# 检查 Redis
if ! command -v redis-server &> /dev/null; then
    echo "安装 Redis..."
    apt-get update
    apt-get install -y redis-server
    systemctl start redis
    systemctl enable redis
fi

echo "[2/7] 配置数据库..."

# 交互式数据库配置
echo ""
echo "请配置数据库信息:"
read -p "数据库用户名 [xhub]: " DB_USER
DB_USER=${DB_USER:-xhub}
DB_USER=$(echo "$DB_USER" | tr '[:upper:]' '[:lower:]')

read -p "数据库密码: " DB_PASS
while [ -z "$DB_PASS" ]; do
    echo "密码不能为空"
    read -p "数据库密码: " DB_PASS
done

read -p "数据库名 [xhub]: " DB_NAME
DB_NAME=${DB_NAME:-xhub}

# 创建数据库用户和数据库
su - postgres -c "psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';\"" 2>/dev/null || true
su - postgres -c "psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER;\"" 2>/dev/null || true
su - postgres -c "psql -c \"ALTER USER $DB_USER CREATEDB;\"" 2>/dev/null || true

echo "[3/7] 配置 Redis..."

# Redis 配置
echo ""
read -p "Redis 密码 (直接回车跳过): " REDIS_PASS

echo "[4/7] 配置 SMTP (邮件发送)..."
echo ""
read -p "SMTP 主机 [smtp.gmail.com]: " SMTP_HOST
SMTP_HOST=${SMTP_HOST:-smtp.gmail.com}

read -p "SMTP 端口 [465]: " SMTP_PORT
SMTP_PORT=${SMTP_PORT:-465}

read -p "SMTP 用户名: " SMTP_USER
read -p "SMTP 密码: " SMTP_PASS
read -p "发件人邮箱: " SMTP_FROM

echo "[5/7] 配置服务器..."
echo ""
read -p "后端监听端口 [:6636]: " SERVER_PORT
SERVER_PORT=${SERVER_PORT:-6636}

echo "[6/7] 生成配置文件..."

# 生成 config.json
cat > "$SCRIPT_DIR/config.json" << EOF
{
  "server": {
    "listen": ":$SERVER_PORT",
    "polling_interval": 60
  },
  "database": {
    "host": "127.0.0.1",
    "port": 5432,
    "user": "$DB_USER",
    "password": "$DB_PASS",
    "dbname": "$DB_NAME",
    "sslmode": "disable"
  },
  "cache": {
    "host": "127.0.0.1",
    "port": 6379,
    "password": "$REDIS_PASS",
    "prefix": "XHUB"
  },
  "smtp": {
    "enabled": $( [ -n "$SMTP_USER" ] && echo "true" || echo "false" ),
    "host": "$SMTP_HOST",
    "port": $SMTP_PORT,
    "user": "$SMTP_USER",
    "password": "$SMTP_PASS",
    "from": "$SMTP_FROM"
  }
}
EOF

echo "配置文件已生成: $SCRIPT_DIR/config.json"

# 创建软链接 (config.json 在 backend 目录)
ln -sf "$SCRIPT_DIR/config.json" "$SCRIPT_DIR/backend/config.json"

echo "[7/7] 构建后端并配置 systemd 服务..."

cd "$SCRIPT_DIR/backend"
go mod download
go build -o xhub .

# 创建 systemd 服务
cat > /etc/systemd/system/xhub-backend.service << SVCEOF
[Unit]
Description=X-HUB Backend
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=root
WorkingDirectory=$SCRIPT_DIR/backend
ExecStart=/bin/bash -c "cd $SCRIPT_DIR/backend && $SCRIPT_DIR/backend/xhub"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

cat > /etc/systemd/system/xhub-frontend.service << SVCEOF
[Unit]
Description=X-HUB Frontend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$SCRIPT_DIR/frontend
ExecStart=/usr/bin/npm run preview -- --host 0.0.0.0
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable xhub-backend xhub-frontend
systemctl start xhub-backend xhub-frontend

echo ""
echo "=========================================="
echo "         安装完成!"
echo "=========================================="
echo ""
echo "服务已配置并启动:"
echo "  xhub-backend  - 后端服务 (端口 $SERVER_PORT)"
echo "  xhub-frontend - 前端服务 (端口 4173)"
echo ""
echo "管理命令:"
echo "  systemctl start xhub-backend   # 启动后端"
echo "  systemctl stop xhub-backend    # 停止后端"
echo "  systemctl restart xhub-backend # 重启后端"
echo "  systemctl status xhub-backend # 后端状态"
echo ""
echo "前端访问: http://服务器IP:4173"
echo ""
echo "=========================================="
