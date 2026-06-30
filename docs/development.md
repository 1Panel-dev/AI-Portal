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

参考 `.env.example`，核心变量如下：

| 变量 | 说明 |
|------|------|
| `INIT_ADMIN_PASSWORD` | 首次启动创建 admin 账号；不设置则不自动创建管理员 |
| `PANEL_BASE_URL` | 1Panel 网关地址，也可在管理后台配置 |
| `PANEL_API_KEY` | 1Panel API 密钥，也可在管理后台配置 |
| `PANEL_API_TIMEOUT` | 1Panel API 请求超时时间，单位毫秒 |
| `BASE_PATH` | 反向代理路径前缀，默认 `/` |
| `SYNC_USER_DEFAULT_PASSWORD` | 从 1Panel 同步用户时的默认密码兜底；留空则无法密码登录 |

`JWT_SECRET` 由应用首次启动自动生成并持久化到 `data/.generated_secrets`，无需手动配置。

## 默认账号

首次启动以下账号使用默认密码，生产部署前务必修改：

| 服务 | 账号 | 默认密码 | 配置方式 |
|------|------|---------|---------|
| 管理后台 | admin | `admintest` | 编辑 `.env` 中 `INIT_ADMIN_PASSWORD` |
