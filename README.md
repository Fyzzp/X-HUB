# X-HUB

专业的代理面板管理系统，基于 Go + React + PostgreSQL + Redis 构建。

## 功能特性

- **用户管理**：注册、登录、密码重置、邮箱验证
- **节点管理**：私有节点接入、统一管理
- **入站管理**：Inbound 配置、部署、删除
- **订阅系统**：节点订阅链接生成
- **后台管理**：用户管理、系统统计、注册开关
- **邮件通知**：SMTP 邮件发送支持

## 系统要求

- Go 1.21+
- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- Linux amd64 (用于编译后运行)

## 一键安装

```bash
# 下载项目
git clone https://github.com/你的用户名/X-HUB.git
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
│   ├── middleware/   # 中间件
│   ├── config/       # 配置加载
│   ├── database/     # 数据库连接
│   ├── cache/        # Redis 缓存
│   └── main.go       # 入口文件
├── frontend/         # React 前端
│   ├── src/
│   │   ├── pages/   # 页面组件
│   │   ├── components/ # UI 组件
│   │   └── lib/      # 工具函数
│   └── dist/         # 构建产物
├── install.sh        # 一键安装脚本
└── config.json.example # 配置模板
```

## API 端口

- 后端默认监听：`6636`
- 前端默认访问：`http://your-server:3000` (开发模式) 或 通过 Nginx 托管

## 截图

(待添加)

## License

MIT License
