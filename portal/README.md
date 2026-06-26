# AI-Portal

面向 1Panel 生态的 AI 门户与技能市场平台，提供模型广场、API Key 管理、用户中心、Skill 市场和技能提交审核能力。

## 当前能力

- **模型广场**：默认首页，展示 1Panel AI 网关模型、供应商分组、Base URL 和调用示例。
- **用户体系**：支持普通用户登录、注册、个人中心，并可同步 1Panel 企业版用户。
- **API Key 管理**：用户可查看、复制、重置自己的 API Key（前端 → `/api/keys` 接口）；本地缺失时自动从远端补齐。
- **Skill 市场**：浏览、搜索、分类筛选 Skill 和 Skill Package。
- **技能提交**：登录用户可提交技能包，系统记录提交人，管理员审核后上线。
- **我的技能**：用户可在个人中心查看自己提交的技能。
- **管理后台**：支持提交审核、技能管理、系统配置。
- **远端集成**：用户删除时同步删除 1Panel 远端用户和对应 API Key。
- **CLI 安装**：保留 `f2chub` / `f2c` 命令用于安装 Skill。

## 技术栈

- 前端：Vue 3 + Vite + Tailwind CSS
- 路由：Vue Router 4
- 后端：Express + PostgreSQL
- 认证：JWT + bcrypt
- 部署：Docker / Docker Compose
- 存储：本地磁盘 / 腾讯云 COS（可热切换）

## 快速开始

### 环境要求

- Node.js 18+
- PostgreSQL 16+
- Docker 24+ 和 Docker Compose（生产或容器化部署）

### 本地开发

```bash
git clone git@github.com:stoneaigc/AI-Portal.git
cd AI-Portal

cp .env.example .env
# 编辑 .env，配置数据库、JWT_SECRET、INIT_ADMIN_PASSWORD、1Panel 远端接口等变量

cd portal && npm install && cd ..
cd server && npm install && cd ..

# 终端 1：后端
cd server && npm run dev

# 终端 2：前端
cd portal && npm run dev
```

访问地址：`http://localhost:5173`

后端默认端口：`http://localhost:3002`

管理员后台：`http://localhost:5173/admin`

### Docker 部署

```bash
cp .env.example .env
# 编辑 .env 配置
docker-compose up -d
```

默认访问：`http://localhost:18090`

## 常用命令

```bash
cd portal
npm run dev          # 启动前端开发服务器
npm run build        # 构建前端生产产物

cd ../server
npm run dev          # 启动后端开发服务
npm start            # 启动后端服务
```

后端启动时会自动执行 `server/migrations` 下未运行过的 SQL 迁移。

## 项目结构

```text
AI-Portal/
├── portal/                        # 前端源码 (Vue 3 + Vite)
│   ├── src/
│   │   ├── components/            # 通用 Vue 组件
│   │   ├── composables/           # 前端状态与数据加载逻辑
│   │   ├── views/                 # 页面视图
│   │   │   ├── ModelsView.vue     # 模型广场首页
│   │   │   ├── HomeView.vue       # Skill 市场
│   │   │   ├── SubmitSkillView.vue# 提交技能
│   │   │   ├── ProfileView.vue    # 个人中心 / API Key / 我的技能
│   │   │   ├── LoginView.vue      # 用户登录
│   │   │   └── RegisterView.vue   # 用户注册
│   │   ├── main.js                # 路由与入口
│   │   └── style.css              # 全局样式
│   ├── index.html
│   └── vite.config.js
├── server/                        # 后端 API (Express)
│   ├── index.js                   # 服务启动入口
│   ├── app.js                     # Express 应用与中间件
│   ├── auth.js                    # JWT、认证中间件、限流
│   ├── db.js                      # 数据库连接与迁移初始化
│   ├── panel.js                   # 1Panel 远端接口封装
│   ├── routes/                    # 后端路由模块
│   │   ├── admin.js               # 管理后台 API
│   │   ├── marketplace.js         # Skill 市场 API
│   │   ├── portal.js              # 用户、模型、API Key API
│   │   └── oauth.js               # 第三方登录
│   ├── oauth/                     # OAuth 适配器
│   ├── migrations/                # 数据库迁移 SQL
│   └── lib/                       # 存储、迁移器、1Panel API 基础封装
├── cli/                           # Skill 安装 CLI（f2chub / f2c）
├── skills/                        # 单个 Skill 示例与资源
├── skills-packages/               # Skill Package 示例与资源
├── docs/                          # 项目文档
├── Dockerfile                     # 前后端一体镜像构建
├── docker-compose.yml             # Docker 编排
├── .env.example                   # 环境变量示例（复制为 .env 后修改）
├── LICENSE                        # GPLv3
└── README.md
```

## 路由

| 路径 | 说明 |
|------|------|
| `/` | 模型广场首页 |
| `/models` | 重定向到 `/` |
| `/skills` | Skill 市场 |
| `/skill/:slug` | Skill 详情 |
| `/submit` | 提交技能，需普通用户登录 |
| `/my-skills` | 我的技能，需普通用户登录 |
| `/profile` | 个人中心，需普通用户登录 |
| `/docs` | 帮助文档 |
| `/login` | 普通用户登录 |
| `/register` | 普通用户注册 |
| `/admin/login` | 管理员登录 |
| `/admin` | 审核管理，需管理员登录 |
| `/admin/skills` | 技能管理，需管理员登录 |
| `/admin/users` | 用户管理，需管理员登录 |
| `/admin/config` | 系统配置，需管理员登录 |
| `/admin/oauth` | 三方登录配置，需管理员登录 |

## 主要 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/auth/register` | POST | 普通用户注册 |
| `/api/auth/login` | POST | 普通用户/管理员登录（按 role 区分 token） |
| `/api/auth/me` | GET | 当前登录用户信息（需登录） |
| `/api/auth/password` | PUT | 修改当前用户密码（需登录） |
| `/api/auth/password/set` | POST | 首次设置密码（OAuth 自动建账号后使用） |
| `/api/models` | GET | 模型列表（含 1Panel 网关同步的模型） |
| `/api/models/sync` | POST | 立即同步 1Panel 模型（管理员） |
| `/api/models/example` | GET | 模型调用示例配置 |
| `/api/keys` | GET / POST | 当前用户 API Key 查询 / 申请 |
| `/api/keys/:id` | GET | 揭示完整 Key（reveal-first） |
| `/api/keys/reset` | POST | 重置当前用户 API Key |
| `/api/skills` | GET | 技能列表（分页/搜索/分类） |
| `/api/skills/:slug` | GET | 技能详情 |
| `/api/skills/:slug/download` | GET | 下载技能包 |
| `/api/skills/upload` | POST | 提交技能包（需普通用户登录） |
| `/api/my/skills` | GET | 当前用户提交的技能 |

> 完整路由清单见 `server/routes/{portal,marketplace,admin,oauth}.js`。1Panel 业务码（HTTP 200 + body.code≥400）的处理约定见 `docs/1panel-api-gotchas.md`。

## 安全配置

### 必需环境变量

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | JWT 签名密钥，未配置服务无法启动 |
| `INIT_ADMIN_PASSWORD` | 管理员初始密码（留空则不自动建管理员；部署后必须立即登录改密） |
| `DB_PASSWORD` | 数据库密码 |

### 可选环境变量

| 变量 | 说明 |
|------|------|
| `DB_HOST` / `DB_PORT` / `DB_NAME` | 数据库连接（默认 `localhost:5432/ai_portal`） |
| `PANEL_BASE_URL` / `PANEL_API_KEY` / `PANEL_API_TIMEOUT` | 1Panel 网关配置；DB 中 `system_config.panel_*` 覆盖此处 |
| `BASE_PATH` | 反向代理前缀（如 `/portal/`），改后必须重启容器 |

## 反向代理（BASE_PATH）

容器固定在 18090 端口对外暴露，但很多场景需要把它挂到 nginx 的子路径下：

```nginx
location /portal/ {
    proxy_pass http://127.0.0.1:18090/;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

同时在 `.env` 里设置 `BASE_PATH=/portal/`，改完必须重启容器才生效。

## License

[GPLv3](LICENSE) © AI-Portal Team
