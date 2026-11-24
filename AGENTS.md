# AGENTS.md

> 本文件是 AI-Portal 仓库的**唯一权威**开发指引，WorkBuddy / Codex / Claude Code / Trae 一律以此为准。
> `.claude/CLAUDE.md` 和 `.codex/AGENTS.md` 是历史版本，有效条目已并入本文件；**不要再往那两份里加规则**，
> 它们里面的目录树和命令已经过期，不要被误导。
> 动手前先过一遍文末「修改前对照清单」。

## 项目身份

**AI-Portal** — 面向 1Panel 生态的 AI 门户与技能市场。内置模型广场、Skill 市场、MCP 广场、
个人中心 / API Key、技能提交审核、RBAC 管理后台。
生产域名 `ai.fit2cloud.cn`，镜像走华为云 SWR（`swr.cn-north-4.myhuaweicloud.com/maxkb`）。

- 前端：Vue 3（Composition API + `<script setup>`）+ Vite + Tailwind CSS + Vue Router 4
- 后端：Express + PostgreSQL（`pg`）+ JWT + bcrypt
- 图表：echarts；图标：lucide-vue-next
- 部署：Docker 多阶段一体镜像（`Dockerfile` / `docker-compose.yml`），另有 `Dockerfile.separate`

## 目录边界

```
AI-Portal/
├── portal/                    ← 前端 (ESM, Vite, 有独立 package.json)
│   └── src/
│       ├── views/             ← 页面 (20 个, 另有 views/admin/ 子目录)
│       ├── components/        ← 通用组件 (AdminLayout.vue 等)
│       ├── composables/       ← 数据加载/状态 (useSiteBranding.js 等)
│       ├── lib/               ← 前端工具函数 (不是后端 lib)
│       └── main.js            ← 路由表与守卫
├── server/                    ← 后端 (CommonJS, 有独立 package.json)
│   ├── app.js                 ← 中间件 + 路由挂载 + SPA fallback + BASE_PATH 注入
│   ├── index.js               ← 启动入口 (先 require app.js 加载 dotenv, 再跑迁移)
│   ├── auth.js                ← JWT、verifyUser/verifyAdmin、限流
│   ├── db.js                  ← pg Pool + 启动时自动跑 migrations
│   ├── panel.js               ← 1Panel 远端接口高层封装
│   ├── lib/
│   │   ├── 1panel-api.js      ← 1Panel 底层 HTTP 客户端 (token + 超时 + logPanelCall)
│   │   ├── gateway/           ← V2 网关抽象层 (见下)
│   │   ├── permission.js      ← RBAC 权限解析
│   │   └── panel-biz.js / *Sync.js / storage.js
│   ├── routes/                ← 7 个路由模块
│   └── migrations/            ← 49 个 SQL, 按文件名顺序执行, 已执行的记在 migrations 表
├── skillctl/                  ← skillctl CLI 工具
├── scripts/                   ← 运维/构建脚本
├── data/                      ← 运行时数据 (uploads/ 等)
└── docs/                      ← 1panel-api-gotchas.md / development.md / specs / prototypes
```

**根目录没有 `package.json`，也没有 `tailwind.config.js`**（配置在 `portal/` 下）。
所有 npm 命令必须先进子目录。

## 命令

```bash
# 安装
cd portal && npm install
cd server && npm install

# 开发 (两个终端)
cd server && npm run dev      # nodemon, 端口 3002
cd portal && npm run dev      # vite, 端口 5173

# 构建
cd portal && npm run build    # 产物 portal/dist, 镜像内拷到静态目录
cd server && npm start
```

后端启动会自动执行 `server/migrations` 下未运行过的 SQL。前端 `/admin` 为管理后台入口。

## 架构边界

1. **ESM / CJS 分裂**。`portal/package.json` 是 `"type": "module"`，前端写 ESM；`server/package.json`
   **没有** 该字段，后端是 CommonJS，保持 `.js` + `require()`，**不要** import/export。
   新增后端模块前先看相邻文件写法。

2. **1Panel 调用一律走 `server/lib/1panel-api.js` 的 `panel`**，不要绕过它直接 `https.request`。
   它统一处理 token（`md5('1panel' + apiKey + timestamp)`）、超时、二进制响应识别，并打 `[panel-call]` 日志。

3. **1Panel 业务失败不在 HTTP 层**。常见 HTTP 200 + `body.code`（401/403/400/500）。
   任何新加的 1Panel 调用**都必须**判断 `body.code >= 400` 视为失败。`portal.js` 已抽成
   `inspectPanelBiz()`，直接复用。详见 `docs/1panel-api-gotchas.md`。

4. **panel search 必须翻全页**。`pageSize` 上限 100，不要 `pageSize:100, page:1` 就当完整列表。
   范式见 `listPanelKeysOfUser(panelUserId)`。

5. **1Panel 一人一 API Key**。reset 必须先用 `purgePanelKeysOfUser` 清干净再 create，
   否则报 `code=400 "user already has an ai proxy api key"`。
   **本地 DB 字段 ≠ 远端真值**：`portal_api_keys.panel_key_id` 可能因半失败 reset 漂移，
   reset/delete 一律以「用 `panel_user_id` 去远端 search」为准。

6. **同步类调用空响应不要清表**。`syncModelsFromPanel` 在 backends 为空时跳过 UPSERT 与软删，
   防止「鉴权通过但临时空响应」导致全量误下架。新加的 sync 必须沿用这个保守语义。

7. **网关抽象层（V2）**：`system_config.gateway_provider = '1panel'（默认）| 'ai-gateway'`，
   环境变量 `GATEWAY_PROVIDER` 仅作兜底初值（**DB 优先**）。
   - 取适配器：`await getGateway(pool)` → `gw.listModels() / gw.getUsageStatistics(...)`
   - 后台保存配置后：`await reloadGateway(pool)` 热重载
   - **路由分流必须用 `await resolveProviderName(pool)`，不要用 `currentProviderName()`**。
     后者读进程内缓存，缓存未建立时回落环境变量/`1panel`，会让「DB 里已是 ai-gateway」的实例
     误走 1Panel 分支 → 502 → 前端误报「尚未配置」。
   - **现状（2026-11）**：仅 `routes/admin.js` 的统计口径分流迁到了 `resolveProviderName`。
     `portal.js`、`gateway-sync.js`、`permission.js`、`admin-groups.js`、`admin-gateway.js`
     仍有约 15 处按 `currentProviderName()` 分流——它们依赖 `getGateway()` 已把缓存建起来，
     属于历史遗留。**新写的分流一律用 `resolveProviderName`**；改到这些位置时顺手迁移。
   - 契约与迁移清单：`server/lib/gateway/contract.js`；provider 实现：`gateway/providers/{1panel,ai-gateway}.js`。

8. **路由没有 `/api/portal/*` 前缀**。`routes/portal.js` 直接挂 `/api/auth/*`、`/api/models*`、`/api/keys*`。
   `app.js` 里挂载 7 个模块：`admin`、`admin-gateway`、`admin-groups`、`marketplace`、`portal`、`oauth`、`mcp`。
   API 前缀分布：`/api/admin`(最多)、`/api/auth`、`/api/skills`、`/api/keys`、`/api/my`、`/api/models`、
   `/api/skillctl-token`、`/api/mcp`、`/api/site`、`/api/usage`、`/api/tags`、`/api/health`。

9. **RBAC**：权限判定走 `server/lib/permission.js`（`getUserPermissions` / `hasPermission` /
   `hasAdminEntry` / `canUserAccessSkill`），管理接口用 `requirePermission('xxx:yyy')`。
   清单见 `docs/rbac-permissions-checklist.md`。

## 前端约定

- **两条独立鉴权守卫，不要串**：普通用户 `localStorage.token`；管理员 `localStorage.admin_token`。
  路由 `meta`：`public` / `requiresLogin` / `requiresUserAuth`。
- **BASE_PATH**：前端用相对路径（`vite.config.js` 里 `base: './'`），`portal/index.html` 里
  `<base href="__BASE_PATH__">` 与 `window.__APP_BASE__` 由后端启动时替换注入
  （`server/app.js`）。前端拼接口地址一律走 `__APP_BASE__ + '/api'`。改完必须重启容器。
- **设计规范：1Panel 蓝白主题，纯亮色。已移除暗黑模式，不要再加回来。**
  - 背景 `#f5f5f7`、卡片 `#fff`、正文 `#1D2129`
  - 导航毛玻璃：`white/80` + `backdrop-blur`
  - 主按钮蓝底白字 `accent = rgba(0,94,235,1)`，hover `rgba(0,58,150,1)`
  - 文字层级：`text.DEFAULT #1D2129` / `text.secondary #475569` / `text.tertiary #94a3b8`
  - 图标：lucide-vue-next，`fill="none" stroke="currentColor" viewBox="0 0 24 24"` 描边风格
- **站点品牌**：站名/Logo/favicon 存在 `system_config`，首屏由 `portal/index.html` 的
  `window.__SITE_BRANDING__` 注入（占位符 `__SITE_BRANDING_JSON__`，后端替换）避免闪烁，
  运行时 `GET /api/site/branding` 更新（`composables/useSiteBranding.js`），默认 logo `/1panel-logo.svg`。

## 排查手册

**先要日志，不要猜。** 后端每次 1Panel 调用都打一行 `[panel-call]`：

```
[panel-call] POST /api/v2/... → ✅ HTTP=200 code=0 12ms
[panel-call] POST /api/v2/... → ❌ business HTTP=200 code=400 "user already has..." 43ms
[panel-call] POST /api/v2/... → ❌ unreachable ECONNREFUSED 3ms
[panel-call] POST /api/v2/... → ❌ timeout 10000ms 10001ms
```

```bash
docker logs aiportal | grep '\[panel-call\]'
```

> 容器名是 `aiportal`（见 `docker-compose.yml` 的 `container_name`），不是 `ai-portal-app`。

- **统计页 502 先区分成因**：`GATEWAY_CONFIG_MISSING` 才是「未配置」；`UNREACHABLE` 是网络；
  `GATEWAY_STATS_FAILED` 是接口报错。前端 `AdminStatsView.vue` 的 `buildStatsError()` 按 `code` 分流，
  不要把 502 一律当「未配置」。
- **ai-gateway 管理域有全局限流**，超限返回 `503 {"code":"management_api_busy"}`（也可能 429）。
  一次页面加载会并发「主汇总 + 排行升序 + 逐日趋势」多路调用，撞限流是常态。
  **所有直调 `gw.getUsageStatistics` 的地方必须包 `withBusyRetry`**（`server/lib/gateway/busy-retry.js`），
  否则会被打成 502。
- **逐日趋势有总时限**（`usage-trend.js`，默认 15s），超时/失败的天补零，保证折线连续、
  绝不让统计接口整体超时。注意其中 `Promise.race` 的超时定时器**不能 `unref`**，
  否则事件循环空闲时超时不触发、整批 await 永久挂起。

## 错误码（前端按需展示）

| code | 含义 |
|---|---|
| `PANEL_UNREACHABLE` | 1Panel 网络不可达（DNS/连接失败/超时） |
| `PANEL_CONFIG_MISSING` | 1Panel 未配置（`PANEL_BASE_URL` 缺失） |
| `PANEL_REJECTED` | 1Panel HTTP 非 2xx 或业务 `code>=400`（`reason` 带原始 message） |
| `PANEL_PURGE_FAILED` | reset 清理旧 key 阶段失败，新 key 未创建，可重试 |
| `PANEL_SKILL_APPROVE_FAILED` / `REJECT_FAILED` / `PUBLISH_FAILED` / `DISABLE_FAILED` / `DELETE_FAILED` | 审核/上下架/删除时 1Panel 失败，本地状态不回写 |
| `PANSL_SYNC_UNVERIFIED` | create 既没返回 id 也没在 search 中找到。**字符串带 typo，与历史告警兼容，不要修正** |
| `GATEWAY_UNREACHABLE` | 独立网关不可达 |
| `GATEWAY_CONFIG_MISSING` | 独立网关配置缺失 |
| `GATEWAY_STATS_FAILED` | 网关统计接口报错 |
| `PANEL_SKILLCTL_TOKEN_FAILED` | 生成 skillctl token 时 1Panel 未返回 token，本地不写库 |
| `PANEL_SKILL_UPLOAD_FAILED` | 上传 1Panel Skills Hub 失败（事务回滚，不写 `skill_submissions`） |

## 修改前对照清单

- 改 `routes/portal.js` 的 reset/create 段：**业务码校验、purge、search 翻页都要保留**，
  每条都对应一个真实踩过的坑。
- 加 1Panel 调用：先看 `panel.js` 有无同名封装；没有再加，加了就走 `panel.post` 并判断 `body.code`。
- 加迁移：`server/migrations/` 放 `NNN_xxx.sql`，顺序命名，**必须幂等**
  （`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`）。
- 改 `BASE_PATH`：前端保持相对路径，占位符由后端注入，改完重启容器。
- 改用户 / API Key 逻辑：注意「网关侧自动生成唯一 ASCII 用户名，按 `gateway_user_id` 关联」，
  门户用户名允许中文，不要用用户名当唯一键。
- 提交技能路径必须 **fail-closed**：1Panel 上传失败返回 `PANEL_SKILL_UPLOAD_FAILED`，
  **不得**写本地 `skill_submissions`；1Panel 上传成功后**不得**再走 COS/local `storage.upload`，
  只记 `panel_skill_id`，下载走 1Panel。

## 硬禁止

- 不要引入暗黑模式，不要用 `zinc-950` 一类深色方案（那是 `D:\claude-code\CLAUDE.md` 里另一个项目的规范）。
- 不要提交 `.env`（含真实凭证）；新增变量同步更新 `.env.example`。
- 不要新增一次性 `.cjs` 脚本到仓库；临时脚本用完即删。
- 不要绕过 `1panel-api.js` / `gateway` 抽象层直连外部服务。
- 不要把 `.workbuddy/` 删掉或纳入构建产物（项目记忆目录）。
