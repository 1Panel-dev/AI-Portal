# AGENTS.md

本文件为 Codex 在 AI-Portal 项目中的开发指南。

## 项目概述

**AI-Portal** 是面向 1Panel 生态的 AI 门户与技能市场平台。当前已接入模型广场、普通用户登录注册、个人中心、API Key 管理、Skill 市场、技能提交审核和管理后台。

配套 CLI 工具 **f2chub**，支持一键安装 Skill（含依赖自动处理）。

## 技术栈

- **前端**：Vue 3（Composition API）+ Vite + Tailwind CSS
- **路由**：Vue Router 4
- **后端**：Express + PostgreSQL
- **认证**：JWT + bcrypt
- **部署**：Docker 多阶段构建

## 项目结构

```text
AI-Portal/
├── portal/src/
│   ├── components/              # Vue 通用组件
│   ├── composables/             # 前端数据加载与状态逻辑
│   ├── views/                   # 页面视图
│   │   ├── ModelsView.vue       # 模型广场首页
│   │   ├── HomeView.vue         # Skill 市场
│   │   ├── SkillDetailView.vue  # Skill 详情页
│   │   ├── SubmitSkillView.vue  # 提交技能页
│   │   ├── ProfileView.vue      # 个人中心 / API Key / 我的技能
│   │   ├── LoginView.vue        # 用户登录
│   │   ├── RegisterView.vue     # 用户注册
│   │   ├── AdminLoginView.vue   # 管理员登录
│   │   ├── AdminView.vue        # 审核管理
│   │   ├── AdminSkillsView.vue  # 技能管理
│   │   ├── AdminUsersView.vue   # 用户管理
│   │   ├── AdminConfigView.vue  # 系统配置
│   │   ├── AdminOAuthView.vue   # 第三方登录配置
│   │   ├── McpPlazaView.vue     # MCP 广场
│   │   └── DocsView.vue         # 在线文档
│   ├── main.js                  # 前端入口与路由
│   └── style.css                # 全局样式
├── server/
│   ├── index.js                 # 后端启动入口
│   ├── app.js                   # Express 应用、中间件、路由挂载
│   ├── auth.js                  # JWT、认证中间件、限流
│   ├── db.js                    # 数据库连接与迁移初始化
│   ├── panel.js                 # 1Panel 远端接口封装
│   ├── routes/                  # 后端路由模块
│   │   ├── admin.js             # 管理后台 API
│   │   ├── marketplace.js       # Skill 市场 API
│   │   └── portal.js            # 用户、模型、API Key API
│   ├── migrations/              # SQL 迁移文件
│   └── lib/                     # 存储、迁移器、1Panel API 基础封装
├── fithub-cli/                  # CLI 工具
├── skills/                      # 单个 Skill 示例与资源
├── skills-packages/             # Skill Package 示例与资源
├── docs/                        # 文档
├── Dockerfile
├── docker-compose.yml
└── tailwind.config.js
```

## 开发命令

```bash
npm install          # 安装前端依赖
npm run dev          # 启动前端开发服务器（端口 5173）
npm run build        # 构建生产版本
npm run preview      # 预览生产构建

cd server
npm install          # 安装后端依赖
npm run dev          # 启动后端开发服务
npm start            # 启动后端服务
```

后端启动时会自动执行 `server/migrations` 下未运行过的 SQL 迁移。

## 路由结构

| 路径 | 组件 | 描述 |
|------|------|------|
| `/` | ModelsView | 模型广场首页 |
| `/models` | - | 重定向到 `/` |
| `/skills` | HomeView | Skill 市场 |
| `/skill/:slug` | SkillDetailView | Skill 详情页 |
| `/submit` | SubmitSkillView | 提交技能，需普通用户登录 |
| `/profile` | ProfileView | 个人中心，需普通用户登录 |
| `/login` | LoginView | 普通用户登录 |
| `/register` | RegisterView | 普通用户注册 |
| `/admin/login` | AdminLoginView | 管理员登录 |
| `/admin` | AdminView | 审核管理，需管理员登录 |
| `/admin/skills` | AdminSkillsView | 技能管理，需管理员登录 |
| `/admin/config` | AdminConfigView | 系统配置，需管理员登录 |
| `/admin/users` | AdminUsersView | 用户管理，需管理员登录 |
| `/admin/oauth` | AdminOAuthView | 第三方登录配置，需管理员登录 |

## 数据结构

### Skill 对象

```json
{
  "id": "skill-id",
  "title": "技能名称",
  "slug": "url-friendly-id",
  "description": "技能描述",
  "avatar": "S",
  "avatarColor": "av-blue",
  "downloads": 313000,
  "stars": 2800,
  "version": "v1.0.0",
  "category": "skill",
  "author": "author-name",
  "installCommand": "f2chub install skill-id",
  "createdAt": "2024-01-01",
  "updatedAt": "2024-12-01"
}
```

## 设计规范

1Panel 蓝白主题，纯亮色模式：

- 背景：`#f5f5f7`，卡片：`#fff`，正文：`#1D2129`
- 导航栏：毛玻璃效果（white/80 + backdrop-blur）
- 卡片：4 列响应式网格，无头图，小图标 + 内联色彩
- 按钮：蓝底白字（accent `rgba(0,94,235,1)`），hover 深蓝（`rgba(0,58,150,1)`）
- 管理页图标：lucide-vue-next（描边风格，fill=none stroke=currentColor）
- 暗黑模式：已移除

## 注意事项

- 前端组件使用 Composition API + `<script setup>`。
- 根 `package.json` 是 ESM：`"type": "module"`。
- `server/package.json` 是 CommonJS，后端文件保持 `.js` + `require()`。
- 前端数据统一通过 `fetch` 调用后端 API。
- 普通用户路由使用 `localStorage.token` 守卫。
- 管理员路由使用 `localStorage.admin_token` 守卫。
- 不要新增一次性 `.cjs` 脚本到仓库；临时脚本用完必须删除。

## 安全配置

### 必需环境变量

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | JWT 签名密钥，未配置服务无法启动 |
| `INIT_ADMIN_PASSWORD` | 管理员初始密码（默认 `admin123`，留空则不自动建管理员；部署后必须立即登录改密） |
| `DB_PASSWORD` | 数据库密码 |

> ⚠️ **`ADMIN_PASSWORD_HASH` 已废弃**：旧实现要求手工 bcrypt 后塞 hash，新实现由后端首次启动时根据 `INIT_ADMIN_PASSWORD` 创建账号。两个变量不会并存，`INIT_ADMIN_PASSWORD` 才是当前规范。

### 可选环境变量

| 变量 | 说明 |
|------|------|
| `BASE_PATH` | 反向代理前缀（如 `/portal/`），改后必须重启容器 |
| `PANEL_BASE_URL` / `PANEL_API_KEY` / `PANEL_API_TIMEOUT` | 1Panel 网关配置；DB 中 `system_config.panel_*` 覆盖此处 |
| `SYNC_USER_DEFAULT_PASSWORD` | 从 1Panel 同步用户时的默认密码兜底（默认空，留空则创建的用户无法密码登录） |

### 安全特性

- JWT_SECRET 启动时强制检查。
- 技能提交接口需普通用户登录。
- 管理接口需管理员登录。
- 登录、上传、下载接口带限流。
- 错误信息避免泄露内部细节。
- 请求日志使用 morgan。
