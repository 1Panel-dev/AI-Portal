# CLAUDE.md

本仓库专属的 Claude Code 项目指引。本文件优先级高于上一级目录的任何 `CLAUDE.md`——上级目录里那份描述的是另一个项目（MaxPal/Tauri），跟本仓库无关。

## 项目身份

**AI-Portal** — 面向 1Panel 生态的 AI 门户与技能市场。Vue 3 + Vite 前端，Express + PostgreSQL 后端，Docker 多阶段一体镜像，对接 **1Panel 企业版 AI 网关**（用户/模型/API Key/Skills Hub 同步）。

仓库根：`D:\claude-code\AI-Portal`（生产部署在 `swr.cn-north-4.myhuaweicloud.com/maxkb/ai-portal:latest-arm64`，对外端口 3000）。

## 目录边界（绝对不要画错）

```
AI-Portal/
├── portal/               ← 前端 (Vue 3, ESM, vite)
│   ├── views/            ← 页面;ModelsView/HomeView/ProfileView/SubmitSkillView/Admin*
│   ├── components/
│   ├── composables/
│   └── lib/              ← 前端工具函数(注意:不是后端 lib)
├── server/               ← 后端 (Express, CommonJS, require())
│   ├── app.js            ← 中间件 + 路由挂载 + SPA fallback + BASE_PATH 注入
│   ├── index.js          ← 启动入口(包含迁移)
│   ├── auth.js           ← JWT、verifyUser/verifyAdmin、限流
│   ├── db.js             ← pg Pool + 启动时自动跑 migrations
│   ├── panel.js          ← 1Panel 远端接口高层封装(getPanelPayload/getPanelItems/sync*)
│   ├── lib/1panel-api.js ← 1Panel 底层 HTTP 客户端(token 生成 + 统一日志 logPanelCall)
│   ├── routes/
│   │   ├── portal.js     ← 用户/认证/模型/API Key (/api/auth/*, /api/models, /api/keys*)
│   │   ├── marketplace.js← 技能市场 (/api/skills*, /api/my/skills, /api/health)
│   │   └── admin.js      ← 管理后台 (/api/admin/*)
│   └── migrations/*.sql  ← 启动时按文件名顺序执行,执行过的会记录在 migrations 表
├── fithub-cli/           ← f2chub / f2c 安装工具
├── skills/               ← 单个 Skill 资源
├── skills-packages/      ← Skill Package 资源
├── docs/
│   └── 1panel-api-gotchas.md  ← 1Panel 调用必读
├── Dockerfile              ← all-in-one 版(内嵌 PostgreSQL,默认)
├── Dockerfile.separate     ← 分离版(app 镜像,需外部 PG)
├── docker-compose.yml      ← all-in-one 版(默认)
├── docker-compose.separate.yml  ← 分离版(app + db 双容器)
```

**ESM/CJS 分裂注意**：
- 根 `package.json` 是 `"type": "module"`（前端走 ESM，Vite 打包）。
- `server/package.json` **没有** `"type": "module"`，是 CommonJS。后端文件保持 `.js + require()`，**不要** import/export。新增后端模块前先看相邻文件的写法。
- 临时调试脚本不要落到仓库；用完即删，不要新增 `.cjs`。

## 关键架构边界

1. **1Panel 调用一律走 `server/lib/1panel-api.js` 的 `panel`** —— 别绕过它直接 `https.request`。它做了 token（`md5('1panel' + apiKey + timestamp)`）、超时、二进制响应识别、统一日志 `logPanelCall` 等。
2. **1Panel 业务失败不在 HTTP 层**。1Panel 习惯返 HTTP 200 + `body.code` 表达业务状态，常见 401 / 403 / 400 / 500。任何**新加的 1Panel 调用路径都必须**判断 `body.code >= 400` 视为失败——这是 reset/create 路径上踩过的坑（详见 `docs/1panel-api-gotchas.md`）。`portal.js` 已经把这个抽成了 `inspectPanelBiz()`，复用它。
3. **panel search 必须翻全页**。pageSize 上限 100，不要写 `pageSize: 100, page: 1` 就当作完整列表。`portal.js` 已抽 `listPanelKeysOfUser(panelUserId)` 作为分页+过滤的范式。
4. **1Panel 一人一 API Key**。reset 流程必须先把 panel 端属于该用户的所有 key 清干净（`purgePanelKeysOfUser`）再 create，否则会以 `code=400 "user already has an ai proxy api key"` 失败。
5. **本地 DB 字段 ≠ 远端真值**。`portal_api_keys.panel_key_id` 可能因为以前的半失败 reset 漂移；reset/delete 要以"用 `panel_user_id` 去远端 search"为准，不要相信本地缓存的 `panel_key_id`。
6. **同步类调用空响应不要清表**。`syncModelsFromPanel` 在 backends 为空时跳过 UPSERT 与软删（防鉴权通过但临时空响应导致全量误下架）。新加的 sync 必须沿用这个保守语义。
7. **路由没有 `/api/portal/*` 前缀**。`portal.js` 直接挂 `/api/auth/*` `/api/models*` `/api/keys*`。不要被 README 里曾经的旧表迷惑。

## 命令

- https://github.com/1Panel-dev/AI-Portal
```

## 调试 1Panel 调用

后端每次 `panel.post/get` 都会打一行 `[panel-call]`：

```
[panel-call] POST /api/v2/... → ✅ HTTP=200 code=0 12ms
[panel-call] POST /api/v2/... → ❌ business HTTP=200 code=400 "user already has..." 43ms
[panel-call] POST /api/v2/... → ❌ unreachable ECONNREFUSED 3ms
[panel-call] POST /api/v2/... → ❌ timeout 10000ms 10001ms
```

排查"页面没数据 / 重置失败"先 `docker logs ai-portal-app | grep '\[panel-call\]'`，能直接区分网络问题 / 业务码失败 / 配置缺失。**回答用户"reset 502 是什么意思"前，先要日志，不要猜**。

## API Key 错误码（前端按需展示）

| code | 含义 |
|---|---|
| `PANEL_UNREACHABLE` | 1Panel 网络不可达(DNS/连接失败/超时) |
| `PANEL_REJECTED` | 1Panel HTTP 非 2xx 或 业务 code≥400(reason 字段带原始 message) |
| `PANEL_PURGE_FAILED` | reset 时清理旧 key 阶段失败,新 key 还没创建,前端可重试 |
| `PANEL_SKILL_APPROVE_FAILED` | 管理员审核通过时 1Panel status approve 失败,本地不改 approved |
| `PANEL_SKILL_REJECT_FAILED` | 管理员审核驳回时 1Panel status reject 失败,本地不改 rejected |
| `PANEL_SKILL_PUBLISH_FAILED` | 管理员上架时 1Panel status publish 失败,本地不改 is_active |
| `PANEL_SKILL_DISABLE_FAILED` | 管理员下架时 1Panel status disable 失败,本地不改 is_active |
| `PANEL_SKILL_DELETE_FAILED` | 管理员删除技能时 1Panel delete 失败,本地不删除 |
| `PANSL_SYNC_UNVERIFIED` | create 既没返回 id 也没在 search 里找到(罕见;字符串带 typo,与历史告警保持兼容,**不要修正**) |
| `SKILL_SUBMIT_DISABLED` | 用户提交技能时 `portal_skill_submit_enabled=false`;`/api/skills/upload` 入口 fail-closed 返回 403,不调 1Panel,不写 `skill_submissions` |

## 修改要点（写代码前对照一遍）

- 改 `routes/portal.js` 的 reset/create 段：业务码校验、purge、search 翻页这些**都要保留**——它们各自对应一个曾经踩过的真实坑。
- 加新的 1Panel 调用：先看 `panel.js` 是否已有同名封装；没有再加，加了就走 `panel.post`。
- 加迁移：在 `server/migrations/` 放新 SQL 文件，用 `NNN_xxx.sql` 顺序命名；幂等（`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`）。
- 改 `BASE_PATH` 相关：前端用相对路径（`vite.config.js` 里 `base: './'`），`<base href>` 由后端启动时注入到 `index.html` 占位符 `__BASE_PATH__`。改完必须重启容器。
- 前端鉴权 token：普通用户 `localStorage.token`；管理员 `localStorage.admin_token`。两条独立守卫，别串。
- 用户提交技能默认只进本地审核；当 `system_config.panel_skill_upload_enabled=true` 时，`/api/skills/upload` 会先上传到 1Panel Skills Hub。这个路径必须保持 fail-closed：1Panel 上传失败就返回 `PANEL_SKILL_UPLOAD_FAILED`，**不得**写入本地 `skill_submissions`；1Panel 上传成功后也**不得**再走 COS/local `storage.upload`，只记录 `panel_skill_id` 并让下载走 1Panel。

## 设计规范（不要回退到深色）

苹果极简纯亮色：背景 `#f5f5f7`、卡片 `#fff`、文字 `#1d1d1f`，导航毛玻璃（white/80 + backdrop-blur），主按钮黑底白字。**已移除暗黑模式，不要再加回来**——上一级 `D:\claude-code\CLAUDE.md` 里的 `zinc-950` 深色规范是 MaxPal 项目的，与本仓库无关。

## 与 AGENTS.md 的关系

`AGENTS.md` 是给 Codex 的，写得偏概览。`CLAUDE.md`（本文件）偏"踩坑沉淀 + 边界约束"，两者会有重叠但不矛盾——出现冲突时**以本文件为准**，因为它会跟随后端代码持续维护。
