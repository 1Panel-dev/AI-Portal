# AI-Portal

面向 1Panel 生态的 AI 门户与技能市场平台。

## 快速开始

### Docker（推荐）

```bash
git clone https://github.com/1Panel-dev/AI-Portal.git
cp .env.example .env
# 默认配置即可启动，生产环境务必修改默认密码（见下方说明）
docker-compose up -d
```

访问 `http://localhost:3000`

内置 PostgreSQL 持久化在 `pg_data` 卷中。生产环境建议使用外部数据库，在 `.env` 中配置 `DB_HOST` 等覆盖默认值。

### 本地开发

```bash
cd portal && npm install && cd ..
cd server && npm install && cd ..

# 终端 1：后端
cd server && npm run dev

# 终端 2：前端
cd portal && npm run dev
```

前端 `http://localhost:5173`，后端 `http://localhost:3002`，管理后台 `http://localhost:5173/admin`

> 后端首次启动会自动创建数据库并执行所有迁移。

## 功能

- **模型广场** — 展示 1Panel AI 网关模型，按供应商分组，一键复制模型名
- **API Key 管理** — 申请、查看、重置、删除，与 1Panel 网关实时同步
- **技能市场** — 浏览、搜索、安装 AI 技能（Skill），配套 CLI 工具 `f2chub`
- **技能提交** — 用户上传技能包，管理员审核上线
- **管理后台** — 审核技能、管理用户、配置 OAuth 和 1Panel 网关
- **OAuth 登录** — 支持企业微信等第三方登录（可插拔适配器）
- **远端同步** — 模型列表和技能从 1Panel 定时同步

## 项目结构

```
AI-Portal/
├── portal/      前端 (Vue 3 + Vite)
├── server/      后端 (Express + PostgreSQL, CommonJS)
├── cli/         f2chub 安装工具
├── docs/        踩坑文档
├── Dockerfile
└── docker-compose.yml
```

## 配置

参考 `.env.example`，核心变量：

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | JWT 签名密钥（默认 `change-me-in-production`） |
| `DB_*` | PostgreSQL 连接信息 |
| `INIT_ADMIN_PASSWORD` | 首次启动创建 admin 账号 |
| `PANEL_*` | 1Panel 网关配置（也可在管理后台配置） |

## 默认密码

首次启动以下服务使用默认密码，**生产部署前务必修改**：

| 服务 | 账号 | 默认密码 | 配置方式 |
|------|------|---------|---------|
| 管理后台 | admin | `admintest` | 编辑 `.env` 中 `INIT_ADMIN_PASSWORD` |
| PostgreSQL | aiportal | `Password123@aiportal` | 编辑 `.env` 中 `DB_PASSWORD` |
| JWT 签名 | - | `change-me-in-production` | 编辑 `.env` 中 `JWT_SECRET` |

## License

[GPLv3](LICENSE) © AI-Portal Team
