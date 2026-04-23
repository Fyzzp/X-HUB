# X-HUB

专业的代理面板管理系统，基于 Go + React + PostgreSQL + Redis 构建。

## 功能特性

### 用户侧
- **节点管理**：私有节点接入、统一管理
- **一键部署**：剪贴板扫描自动填充 SOCKS5 账号批量部署
- **入站管理**：Inbound 配置、部署、删除（连带清理路由/出站规则）
- **订阅系统**：节点订阅链接生成
- **剪贴板扫描**：支持 URL/基础路径/用户名/密码 格式自动填充
- **重复检查**：添加节点时自动检测同 IP 节点
- **连通性测试**：添加节点前自动测试面板连接

### 管理侧
- **用户管理**：注册、登录、密码重置、邮箱验证
- **节点管理**：用户节点统一管理、状态监控
- **入站管理**：入站配置、客户端管理、批量操作
- **后台管理**：用户管理、系统统计、注册开关
- **审计日志**：操作记录、IP 追踪
- **邮件通知**：SMTP 邮件发送支持

### 安全特性
- **AES 加密**：面板密码加密存储
- **API 限速**：防止暴力破解
- **CORS 防护**：跨域请求控制
- **连接池优化**：数据库连接复用

## 系统要求

- Go 1.21+
- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- Linux amd64

## 一键部署

```bash
# 方式一：Git 克隆
git clone https://github.com/Fyzzp/X-HUB.git
cd X-HUB

# 运行安装脚本
chmod +x install.sh
./install.sh
```

## 配置说明

安装后，编辑 `config.json`：

```json
{
  "server": {
    "listen": ":6636",
    "polling_interval": 60
  },
  "database": {
    "host": "127.0.0.1",
    "port": 5432,
    "user": "your_db_user",
    "password": "your_db_password",
    "dbname": "your_db_name",
    "sslmode": "disable"
  },
  "cache": {
    "host": "127.0.0.1",
    "port": 6379,
    "password": "your_redis_password",
    "prefix": "XHUB"
  },
  "aes_key": "32位AES加密密钥",
  "smtp": {
    "enabled": true,
    "host": "smtp.gmail.com",
    "port": 465,
    "user": "your_email@gmail.com",
    "password": "your_app_password",
    "from": "X-HUB <your_email@gmail.com>"
  }
}
```

## 手动构建

### 后端

```bash
cd backend
go mod download
go build -o xhub .
./xhub
```

### 前端

```bash
cd frontend
npm install
npm run build
```

构建产物在 `frontend/dist/`，可部署到 Nginx 等 Web 服务器。

## 目录结构

```
X-HUB/
├── backend/          # Go 后端
│   ├── handlers/     # API 处理器
│   ├── models/       # 数据模型
│   ├── middleware/   # 中间件（认证、限速）
│   ├── config/       # 配置加载
│   ├── database/     # 数据库连接
│   ├── cache/        # Redis 缓存
│   ├── crypto/       # AES 加密/解密
│   └── main.go       # 入口文件
├── frontend/         # React 前端
│   ├── src/
│   │   ├── pages/   # 页面组件
│   │   ├── components/ # UI 组件
│   │   └── lib/      # API 工具函数
│   └── dist/         # 构建产物
├── install.sh         # 一键部署脚本
├── config.json.example # 配置模板
└── README.md
```

## API 端口

- 后端默认监听：`6636`
- 前端默认访问：通过 Nginx 托管（见 Caddyfile）

## License

MIT License
