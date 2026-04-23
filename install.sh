#!/bin/bash

# X-HUB 一键安装脚本 (纯 Bash，无 Git 依赖)
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

SCRIPT_DIR="/opt/X-HUB"
cd "$SCRIPT_DIR"

echo "[1/8] 检查系统依赖..."

# 检测 OS
if [[ -f /etc/debian_version ]]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y curl wget build-essential libpq-dev
elif [[ -f /etc/redhat-release ]]; then
    yum install -y curl wget gcc gcc-c++ make libpq-devel
else
    echo "不支持的操作系统"
    exit 1
fi

echo "[2/8] 安装 Go..."
if ! command -v go &> /dev/null; then
    LATEST=$(curl -s https://go.dev/VERSION?m=text | head -1)
    wget -q "https://go.dev/dl/${LATEST}.linux-amd64.tar.gz"
    rm -rf /usr/local/go
    tar -C /usr/local -xzf "${LATEST}.linux-amd64.tar.gz"
    rm "${LATEST}.linux-amd64.tar.gz"
fi
export PATH=$PATH:/usr/local/go/bin
echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
source /etc/profile

echo "[3/8] 安装 Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi

echo "[4/8] 安装 PostgreSQL..."
if ! command -v psql &> /dev/null; then
    apt-get update
    apt-get install -y postgresql postgresql-contrib
    systemctl start postgresql
    systemctl enable postgresql
fi

echo "[5/8] 安装 Redis..."
if ! command -v redis-server &> /dev/null; then
    apt-get update
    apt-get install -y redis-server
    systemctl start redis
    systemctl enable redis
fi

echo "[6/8] 配置数据库..."
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

# 创建数据库和用户
su - postgres -c "psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';\"" 2>/dev/null || true
su - postgres -c "psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER;\"" 2>/dev/null || true
su - postgres -c "psql -c \"ALTER USER $DB_USER CREATEDB;\"" 2>/dev/null || true

echo "[7/8] 生成配置文件..."
echo ""
read -p "Redis 密码 (直接回车跳过): " REDIS_PASS
read -p "后端监听端口 [:6636]: " SERVER_PORT
SERVER_PORT=${SERVER_PORT:-6636}
read -p "Caddy HTTP 端口 [80]: " CADDY_HTTP
CADDY_HTTP=${CADDY_HTTP:-80}
read -p "面板域名: " DOMAIN

# 生成 config.json (与后端 config.go 结构匹配)
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
    "password": "${REDIS_PASS}",
    "prefix": "XHUB"
  },
  "smtp": {
    "enabled": false,
    "host": "smtp.gmail.com",
    "port": 465,
    "user": "",
    "password": "",
    "from": ""
  },
  "aes_key": "$(openssl rand -base64 32)"
}
EOF

echo "[8/8] 构建并启动服务..."

# 编译后端
cd "$SCRIPT_DIR/backend"
go mod download
go build -o xhub .

# 编译前端
cd "$SCRIPT_DIR/frontend"
npm install
npm run build

# 安装 Caddy
if ! command -v caddy &> /dev/null; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
    apt-get update
    apt-get install -y caddy
fi

# 配置 Caddy
cat > /etc/caddy/Caddyfile << EOF
:$CADDY_HTTP {
    handle /api/* {
        reverse_proxy localhost:$SERVER_PORT
    }
    handle /* {
        root * $SCRIPT_DIR/frontend/dist
        file_server
        try_files {path} /index.html
    }
}
EOF

# 创建 systemd 服务
cat > /etc/systemd/system/xhub.service << 'SVCEOF'
[Unit]
Description=X-HUB Service
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/X-HUB
ExecStart=/opt/X-HUB/backend/xhub
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable xhub caddy
systemctl restart xhub caddy

echo ""
echo "=========================================="
echo "         安装完成!"
echo "=========================================="
echo ""
echo "访问地址: http://$DOMAIN:$CADDY_HTTP"
echo "管理后台: http://$DOMAIN:$CADDY_HTTP/admin"
echo ""
echo "配置文件: $SCRIPT_DIR/config.json"
echo ""
echo "服务状态:"
systemctl status xhub --no-pager -l
echo ""
systemctl status caddy --no-pager -l
echo "=========================================="
