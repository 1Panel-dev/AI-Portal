# 开发文档

## 本地开发

```bash
cd portal && npm install && cd ..
cd server && npm install && cd ..

# 终端 1：后端
cd server && npm run dev

# 终端 2：前端
cd portal && npm run dev
```

前端地址：`http://localhost:5173`

后端地址：`http://localhost:3002`

管理后台：`http://localhost:5173/admin`

后端首次启动会自动创建数据库并执行所有迁移。

## 项目结构

```text
AI-Portal/
├── portal/              前端 (Vue 3 + Vite)
├── server/              后端 (Express + PostgreSQL, CommonJS)
├── skillctl/            Go 语言 CLI 安装工具
├── docs/                文档
├── Dockerfile           Docker 镜像构建文件
├── docker-compose.yml   Docker Compose 编排文件
└── .env.example         环境变量示例
```

## 配置

所有可配置环境变量如下。在 `docker-compose` 部署方式下，编辑 `.env` 即可生效。

### 基本配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 后端服务端口 |
| `BASE_PATH` | `/` | 反向代理路径前缀，例：`/ai-portal/` |
| `SERVE_STATIC` | `true` | 是否托管前端静态文件（开发时设为 `false`） |
| `STATIC_PATH` | `./dist` | 前端构建产物路径 |

### 数据库（PostgreSQL）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DB_HOST` | `localhost` | 数据库地址；容器内默认走内置 Postgres，设为外置库 IP 即可使用外部数据库 |
| `DB_PORT` | `5432` | 数据库端口 |
| `DB_NAME` | `ai_portal` | 数据库名称 |
| `DB_USER` | `aiportal` | 数据库用户 |
| `DB_PASSWORD` | `Password123@aiportal` | 数据库密码 |

### 1Panel 网关

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PANEL_BASE_URL` | — | 1Panel 网关地址（也可在管理后台配置） |
| `PANEL_API_KEY` | — | 1Panel API 密钥（也可在管理后台配置） |
| `PANEL_API_TIMEOUT` | `10000` | 1Panel API 请求超时（毫秒） |

### 认证与用户

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `JWT_SECRET` | 首次启动自动生成并持久化到 `data/.generated_secrets` | JWT 签名密钥；可手动预置覆盖自动生成 |
| `INIT_ADMIN_PASSWORD` | — | 首次启动创建 admin 账号的密码；留空则不自动创建管理员 |
| `SYNC_USER_DEFAULT_PASSWORD` | — | 从 1Panel 同步用户时的默认密码；留空则同步用户无法密码登录 |

`JWT_SECRET` 由应用首次启动自动生成并持久化到 `data/.generated_secrets`，无需手动配置。

## 默认账号

首次启动以下账号使用默认密码，生产部署前务必修改：

| 服务 | 账号 | 默认密码 | 配置方式 |
|------|------|---------|---------|
| 管理后台 | admin | `admintest` | 编辑 `.env` 中 `INIT_ADMIN_PASSWORD` |
