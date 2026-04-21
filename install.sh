#!/bin/bash

# X-HUB 一键安装脚本
# 适用于 Ubuntu/Debian/CentOS

set -e

echo "=========================================="
echo "         X-HUB 一键安装脚本"
echo "=========================================="

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    echo "请使用 root 用户运行此脚本"
    exit 1
fi

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[1/6] 检查依赖..."

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

# 检查 Git
if ! command -v git &> /dev/null; then
    echo "安装 Git..."
    apt-get update
    apt-get install -y git
fi

echo "[2/6] 配置数据库..."

# 创建数据库用户和数据库
su - postgres -c "psql -c \"CREATE USER xhub WITH PASSWORD 'xhub_password';\"" 2>/dev/null || true
su - postgres -c "psql -c \"CREATE DATABASE xhub OWNER xhub;\"" 2>/dev/null || true

echo "[3/6] 构建后端..."

cd "$SCRIPT_DIR/backend"
go mod download
go build -o xhub .

echo "[4/6] 安装前端依赖..."

cd "$SCRIPT_DIR/frontend"
npm install

echo "[5/6] 配置..."

# 创建配置目录
mkdir -p /opt/xhub

# 复制文件
cp -r "$SCRIPT_DIR/backend" /opt/xhub/
cp -r "$SCRIPT_DIR/frontend" /opt/xhub/

# 创建配置文件的步骤不再自动执行，因为用户需要手动配置数据库密码等信息

echo "[6/6] 完成!"

echo ""
echo "=========================================="
echo "         安装完成!"
echo "=========================================="
echo ""
echo "请按以下步骤操作:"
echo ""
echo "1. 编辑配置文件:"
echo "   nano /opt/xhub/backend/config.json"
echo ""
echo "2. 配置数据库连接信息 (用户名、密码需与上面创建的一致)"
echo ""
echo "3. 启动后端:"
echo "   cd /opt/xhub/backend && ./xhub"
echo ""
echo "4. 构建前端 (可选，用于生产环境):"
echo "   cd /opt/xhub/frontend && npm run build"
echo ""
echo "=========================================="
