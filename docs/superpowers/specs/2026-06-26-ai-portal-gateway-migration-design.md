# AI-Portal 网关功能迁移设计

日期：2026-06-26

## 背景

目标项目 `D:\claude-code\AI-Portal` 当前像是 `D:\claude-code\AI-Portal` 的旧版/拆分版。AI-Portal 已有 1Panel 网关核心基础，但落后于当前 AI-Portal 的 OAuth、站点品牌公告、管理员新增用户、1Panel 角色配置和部分前端管理能力。

本次目标是把当前 AI-Portal 的网关门户能力尽量同步到 AI-Portal，同时保留 AI-Portal 现有仓库布局。

## 已确认决策

- 采用“方案 1：分层同步，保留 AI-Portal 布局”。
- AI-Portal 前端继续保留在 `portal/` 目录。
- 功能范围选择整站对齐当前 AI-Portal。
- 用户可见品牌改为 **AI-Portal**。
- 尽量不改 LICENSE 和 README；如 README 必须变更，只做必要最小说明。
- 暂不提交 git。
- 不碰 `.env`，不复制 `node_modules`，不复制运行时 `data`。

## 迁移边界与目录映射

### 保留的目标结构

```text
AI-Portal/
├── portal/   # Vue/Vite 前端
├── server/   # Express/PostgreSQL 后端
└── cli/      # f2chub CLI
```

### 核心路径映射

| AI-Portal 源路径 | AI-Portal 目标路径 |
|---|---|
| `src/...` | `portal/src/...` |
| `package.json` | `portal/package.json` |
| `package-lock.json` | `portal/package-lock.json` |
| `vite.config.js` | `portal/vite.config.js` |
| `index.html` | `portal/index.html` |
| `public/...` | `portal/public/...` |
| `server/...` | `server/...` |
| `fithub-cli/...` | `cli/...` |
| `docs/...` | `docs/...` |

不会整仓覆盖 `AI-Portal`，因为源项目的前端在根目录，而目标项目前端在 `portal/`。直接覆盖会破坏目录布局，也容易误带旧镜像名、旧文案或无关文件。

## 功能范围

迁移范围包括：

- 1Panel AI Gateway 配置、同步、模型广场、API Key。
- 1Panel Skills Hub 上传、同步、下载。
- 企业微信/OAuth 登录、绑定、首次扫码流程。
- 管理员 OAuth 配置。
- 管理员新增本地用户。
- 站点品牌、Logo/Favicon 上传、公告横幅/弹窗。
- 新建 1Panel 用户时的角色 ID 可配置。
- 前端登录、个人中心、管理后台相关页面对齐。
- Dockerfile / 构建路径适配 `portal/` 布局。

## 后端迁移设计

### 基础模块

对齐以下模块：

- `server/auth.js`
  - 增加 OAuth ticket 能力：`signOauthTicket`、`signOauthBindingTicket`、`consumeTicket`。
  - 保留 JWT、限流、`verifyUser`、`verifyAdmin` 语义。

- `server/app.js`
  - 增加 `app.set('trust proxy', 1)`，保证反代 HTTPS 下 OAuth 回调 URL 正确。
  - 增加 `/uploads` 静态资源服务，用于 Logo/Favicon。
  - 挂载 `routes/oauth.js`。
  - 保持 API 404 与 SPA fallback 顺序不变。

- `server/panel.js`
  - 增加 `getPanelUserRoleId()` 和 `getPanelRoles()`。
  - `createPanelUser()` 不再硬编码 `roleId: 4`，改从 `system_config.panel_user_role_id` 读取，缺省仍回退 `4`。

新增模块：

- `server/routes/oauth.js`
- `server/oauth/index.js`
- `server/oauth/wecom.js`
- `server/oauth/token-cache.js`
- `server/oauth/username-generator.js`
- `server/lib/state-store.js`

### 数据库迁移

补齐当前项目新增迁移：

- `016_portal_users_auto_created.sql`
- `017_oauth_providers.sql`
- `018_user_identities.sql`
- `019_oauth_provider_allowlist.sql`

这些迁移增加：

- `portal_users.auto_created_from`
- `oauth_providers`
- `user_identities`
- `oauth_provider_allowlist`

`panel_user_role_id` 不强行改旧迁移历史。代码读取 `system_config.panel_user_role_id`，不存在时回退 `4`；管理员保存配置后写入该 key。

### 路由层

#### `server/routes/portal.js`

补齐：

- OAuth 启用时关闭自助注册。
- `/api/auth/me` 返回 `has_password`、`auto_created_from`。
- `GET /api/auth/identities`。
- `DELETE /api/auth/identities/:provider`。
- `POST /api/auth/password/set`。
- `GET /api/site/branding`。
- `GET /api/site/announcement`。

必须保留当前网关 API Key 的关键逻辑：

- 1Panel 业务码 `body.code >= 400` 判失败。
- reset 前 purge 远端用户所有 key。
- search 必须翻页。
- 不信任本地 `panel_key_id`，以 `panel_user_id` 搜远端为准。
- `PANSL_SYNC_UNVERIFIED` 拼写不修。

#### `server/routes/admin.js`

补齐：

- `/api/admin/panel-config` 返回 `panelRoles`、`panelUserRoleId`。
- `/api/admin/panel-config` 保存 `panel_user_role_id`。
- 站点品牌接口：
  - `GET /api/admin/branding`
  - `POST /api/admin/branding`
  - `POST /api/admin/branding/upload/:kind`
- 公告接口：
  - `GET /api/admin/announcement`
  - `POST /api/admin/announcement`
- 管理员新增用户：
  - `POST /api/admin/portal-users`
- OAuth provider 管理：
  - `GET /api/admin/oauth/providers`
  - `PUT /api/admin/oauth/providers/:provider`
  - `POST /api/admin/oauth/providers/:provider/test`

### 低改动后端文件

这些文件在 AI-Portal 中已基本对齐，只做差异校验，不主动大改：

- `server/lib/1panel-api.js`
- `server/lib/modelSync.js`
- `server/lib/skillsSync.js`
- `server/routes/marketplace.js`
- `server/lib/storage.js`
- `server/lib/downloadCounter.js`

如果 diff 显示完全一致，不修改；如果有必须依赖的新接口，再做最小合并。

## 前端迁移设计

前端以 `AI-Portal/src` 为功能源，落到 `AI-Portal/portal/src`。

### 路由入口

更新 `portal/src/main.js`，补齐：

- `/oauth/complete` → `OAuthCompleteView.vue`
- `/oauth/error` → `OAuthErrorView.vue`
- `/oauth/bind` → `OAuthBindView.vue`
- `/admin/oauth` → `AdminOAuthView.vue`

保留 token 分离：

- 普通用户：`localStorage.token`
- 管理员：`localStorage.admin_token`

### 登录与注册

对齐 `LoginView.vue`、`RegisterView.vue`：

- 登录页加载 `/api/auth/oauth/providers`。
- 展示可用 OAuth provider 登录按钮。
- 企业微信/微信内置浏览器中优先显示 loading，避免先闪现普通登录表单。
- OAuth 启用时，注册页根据后端返回提示用户使用第三方登录或联系管理员。
- 保留本地账号登录能力，避免 OAuth 未配置时无法进入系统。

### OAuth 页面与组件

新增：

- `portal/src/views/OAuthCompleteView.vue`
- `portal/src/views/OAuthErrorView.vue`
- `portal/src/views/OAuthBindView.vue`
- `portal/src/views/AdminOAuthView.vue`
- `portal/src/components/admin/OAuthProviderCard.vue`
- `portal/src/components/AppDialog.vue`

这些页面负责：

- OAuth 回调后的 ticket 换 token。
- 首次扫码时绑定已有账号或跳过绑定自动建号。
- OAuth 错误展示。
- 管理员配置企业微信 provider。
- 管理员测试 provider 配置。

### 个人中心

对齐 `ProfileView.vue`：

- 保留 API Key 管理。
- 增加账号绑定区：查看已绑定身份、绑定/解绑 OAuth provider、OAuth 自动创建账号首次设置密码。
- 展示 OAuth 自动创建账号提示。
- 不破坏现有模型/API Key 使用说明。

### 管理后台

对齐：

- `AdminConfigView.vue`
  - 默认展示 1Panel 网关配置。
  - 隐藏旧存储 Tab / COS 卡片。
  - 增加 1Panel 用户角色选择。
  - 增加站点品牌、Logo/Favicon 上传。
  - 增加公告横幅/弹窗配置。
  - 增加前往 `/admin/oauth` 的入口。

- `AdminUsersView.vue`
  - 增加“新增用户”按钮。
  - 引入 `NewUserDialog.vue`。
  - 创建成功后刷新用户列表。
  - 保留批量重置密码等已有能力。

- `AdminView.vue`、`AdminSkillsView.vue`
  - 做导航一致性补齐，避免缺少 `/admin/oauth` 入口。

新增：

- `portal/src/components/admin/NewUserDialog.vue`

### 站点品牌与公告

AI-Portal 已有：

- `portal/src/composables/useSiteBranding.js`
- `portal/src/composables/useAnnouncement.js`
- `portal/src/components/AnnouncementModal.vue`

本次让它们与后端接口闭环：

- `/api/site/branding`
- `/api/site/announcement`
- `/api/admin/branding`
- `/api/admin/announcement`

用户可见默认站点名改为 **AI-Portal**。

## 构建部署设计

### Vite

更新 `portal/vite.config.js`：

- `base: './'`。
- dev 环境支持 `__BASE_PATH__` 占位符替换。
- dev server 代理：
  - `/api` → 后端。
  - `/uploads` → 后端。
- 不引入暗黑模式相关配置。

### `.env.example`

只更新示例文件，不碰真实 `.env`。补齐必要提示：

- `JWT_SECRET`
- `INIT_ADMIN_PASSWORD`
- `DB_*`
- `BASE_PATH`
- `SERVE_STATIC`
- `STATIC_PATH`
- `PANEL_BASE_URL`
- `PANEL_API_KEY`
- `PANEL_API_TIMEOUT`

OAuth/企业微信以后台配置为主，示例文件只保留必要提示。

### Dockerfile

AI-Portal 当前 Dockerfile 仍假设前端在根目录。需要改为适配 `portal/`：

1. `frontend-builder`
   - 工作目录指向 `/app/portal`。
   - 安装 `portal/package*.json`。
   - 构建 `portal/src`。

2. `backend-deps`
   - 工作目录指向 `/app/server`。
   - 安装后端依赖。

3. `runtime`
   - 拷贝 `server/`。
   - 拷贝 `portal/dist` 到后端静态目录。
   - 按现有 Dockerfile 需要拷贝 `cli/`。
   - 设置 `SERVE_STATIC=true`。

以现有 Dockerfile 为基础最小修改，不整份替换为 AI-Portal 的 Dockerfile。

## 品牌命名设计

用户可见品牌尽量改为 **AI-Portal**：

- 默认站点名：`AI-Portal`。
- 页面 title / navbar 默认文案：`AI-Portal`。
- 默认公告中的用户可见旧 `AI-Portal` 文案改为 AI-Portal 语境。
- package 名可以从 `1panel-ai-hub` 调整为 `ai-portal` / `ai-portal-server`，仅限项目自身 package。
- Docker 镜像名、compose service 名如果明显是旧 `1panel-ai-hub`，改成 AI-Portal 语义。

尽量不改：

- LICENSE。
- README 大段内容。若 README 必须更新，只做少量必要说明，例如“前端位于 `portal/`”。

## 验证设计

### 自动化验证

迁移完成后至少运行：

```bash
cd D:/claude-code/AI-Portal/portal
npm run build
```

后端基础启动检查：

```bash
cd D:/claude-code/AI-Portal/server
npm start
```

如果本地数据库或环境变量不足导致 `npm start` 无法完整启动，需要报告具体阻塞，不声称通过。

### 接口级验证

后端可启动时，检查：

- `GET /api/health`
- `GET /api/site/branding`
- `GET /api/site/announcement`
- `GET /api/auth/oauth/providers`
- 管理员登录后：
  - `GET /api/admin/panel-config`
  - `GET /api/admin/oauth/providers`
  - `GET /api/admin/branding`
  - `GET /api/admin/announcement`

如果没有管理员 token，只验证公开接口和启动/构建，并说明管理员接口未验证。

### 功能级手动验证

环境允许时检查：

- 普通账号登录。
- OAuth 未启用时可注册；启用时注册提示第三方登录或联系管理员。
- 企业微信 provider 未配置时不影响普通登录。
- 管理后台配置页能打开。
- 个人中心 API Key 区域仍可用。
- Logo/Favicon 上传后 `/uploads/branding/...` 可访问。
- 模型同步/技能同步失败时只记录错误，不导致服务崩溃。

## 回滚策略

- 迁移前记录关键文件清单。
- 大文件合并优先使用 diff 对比，避免散落手写修改。
- 如果某个模块失败，优先回退该模块相关文件，而不是继续叠加修补。
- 数据库迁移必须幂等、只加字段/表，不破坏已有数据。
- 因暂不提交 git，不执行 `git add` / `git commit`。

## 成功标准

- AI-Portal 保持 `portal/` 前端布局。
- 核心功能对齐当前 AI-Portal。
- 前端能 build。
- 后端能在配置完整环境下启动并跑 migration。
- OAuth、品牌公告、管理员新增用户、1Panel 角色配置相关前后端接口闭环。
- 用户可见品牌默认是 AI-Portal。
- 未改 LICENSE。
- README 不改或只做必要最小改动。
- 未提交 git。
