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
    wget -q https://go.dev/dl/go1.21.6.linux-amd64.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf go1.21.6.linux-amd64.tar.gz
    rm go1.21.6.linux-amd64.tar.gz
    export PATH=$PATH:/usr/local/go/bin
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "安装 Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
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

echo "[7/7] 构建后端..."

cd "$SCRIPT_DIR/backend"
go mod download
go build -o xhub .

echo ""
echo "=========================================="
echo "         安装完成!"
echo "=========================================="
echo ""
echo "配置文件: $SCRIPT_DIR/config.json"
echo ""
echo "启动后端:"
echo "  cd $SCRIPT_DIR/backend"
echo "  ./xhub"
echo ""
echo "构建前端 (用于生产环境):"
echo "  cd $SCRIPT_DIR/frontend"
echo "  npm install"
echo "  npm run build"
echo ""
echo "=========================================="
