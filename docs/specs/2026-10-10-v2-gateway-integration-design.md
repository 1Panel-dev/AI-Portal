# V2 网关对接设计方案（v2 修订稿：门户为主）

| 项 | 内容 |
|------|------|
| 状态 | **v2 修订 / 讨论中**（2026-10-14 方向调整，旧「方案 B」作废，见 §0） |
| 分支 | `v2` |
| 创建 | 2026-10-10 / 修订 2026-10-14 |
| 网关契约 | AI-Gateway Management API（`openapi.yaml` v1.0.0，Bearer `agw_at_`） |
| 关联代码 | `server/lib/gateway/`（适配器骨架已落地，契约比对无需返工，见 §7） |

---

## 0. 方案修订说明（2026-10-14）

**旧方案（方案 B，已作废）**：独立网关作为模型授权「真相源」，门户资源组对模型降级为只读展示。

**新方案（本稿，门户为主）**：由于独立网关后续会增加大量新功能，当前阶段以**兼容为主、门户为主**：

> 门户保留全部现有交互、授权逻辑与组织架构；独立网关仅替换四个「后端数据源 / 执行点」：

| # | 域 | 门户现状 | v2 改造 |
|---|-----|----------|---------|
| 1 | 模型同步 | 1Panel `backends/search` + modelMap | 切网关 `GET /admin/upstream-accounts` |
| 2 | 用户组/模型组同步 | 1Panel `ai-proxy/groups/search` 等 | 切网关 `GET /admin/user-groups` + `GET /admin/model-groups`（**仅换数据源，缓存表结构与授权逻辑保持**） |
| 3 | API Key | 门户自生成明文推送 1Panel | 切网关 `POST /admin/users/{id}/api-keys`（网关签发，明文仅返回一次） |
| 4 | 用户同步 | 企微注册建 1Panel 用户 | **保留 1Panel 同步** + 追加同步到独立网关（`POST /admin/users`） |

**不动的部分**：企微扫码登录流程（门户主导）、用户管理全部操作、组织架构（资源组/RBAC/用户组管理）、模型可见性授权公式（资源组 ∩ 用户组模型组）、skill 与 MCP 同步（继续 1Panel）、1Panel 用户链路（保留，作为用户/组织域的继续载体）。

---

## 1. 接口评估结论（对照门户现有逻辑）

### 1.1 满足度矩阵

| 门户现有逻辑 | 现用 1Panel 接口 | 新网关接口 | 满足度 | 说明 |
|---|---|---|---|---|
| 模型同步 `syncModelsFromPanel` | `POST /ai-proxy/backends/search`（modelMap 脏数据需 parseModelMap） | `GET /admin/upstream-accounts`（分页，`models[].requestModelName` 结构化） | ✅ 满足 | portal_models 写入骨架（UPSERT/软删/空响应不清表）不变 |
| 用户组同步 | `POST /ai-proxy/groups/search` | `GET /admin/user-groups`（UserGroupDetail 含 `modelGroups[]`） | ✅ 满足 | 字段映射见 §1.2，两个次要字段无对应置空 |
| 模型组同步 | `POST /ai-proxy/model-groups/search` | `GET /admin/model-groups`（ModelGroupView 含 `models[]`） | ✅ 满足 | 同上 |
| Key 按组归属回填（`portal_api_keys.group_id`） | api-keys search 返回 `groupId` | **无对应**（网关 Key 不挂组，Key 继承用户授权） | ⚠️ 逻辑替换 | 第三路同步改为「同步用户 → 用户组归属」（见 §3.2），这是本方案唯一的授权链改造点 |
| 企微注册同步建用户 | `POST /core/enterprise/users` | `POST /admin/users`（必填 `userGroupId`） | ✅ 满足 | 需配置网关默认用户组；username 需过 `normalizeUsername()`（网关强校验 `^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$`） |
| 用户禁用/删除联动 | `users/del` | `POST /admin/users/{id}/disable`、`DELETE /admin/users/{id}` | ✅ 满足 | 在现有 1Panel 联动基础上**追加**网关联动，失败不阻断 |
| Key 创建 | 门户自生成明文 `api-keys/create` 推送 | `POST /admin/users/{id}/api-keys` {name}，明文 `apiKey` **仅此一次返回** | ✅ 满足 | 门户改为落库网关返回的明文（`api_key_cipher` 已有） |
| Key 重置/删除 | `api-keys/delete` + create | `DELETE /admin/users/{id}/api-keys/{keyId}` + create | ✅ 满足 | 重置语义 = 删旧建新，保持门户现有交互 |
| Key 明文反查（reveal） | `api-keys/reveal` | **无对应** | ⚠️ 回退 | reveal 接口回退读本地 `api_key_cipher`（门户本就落库明文，无功能损失） |
| 使用统计 | `POST /ai-proxy/usage/statistics` | `GET /admin/usage-statistics`（另有 call-logs、token-trend 更细粒度） | ✅ 已拍板切换（D-13） | 参数形态 POST body → GET query、返回结构不同，需字段映射（见 §3.8） |
| skill / MCP 同步 | `skills-hub/*`、`ai/mcp/search` | — | ✅ 不动 | 继续同步 1Panel |

### 1.2 用户组字段映射（缓存表对齐）

| panel_user_groups 列 | 1Panel 来源 | 网关来源 | 说明 |
|---|---|---|---|
| panel_group_id | group.id | userGroup.id | |
| name / qps_limit / token_limit | group.name / qpsLimit / tokenLimit | name / maxConcurrency / apiKeyMaxConcurrency | 语义对应 |
| model_group_ids | group.modelGroupIds | `modelGroups[].id`（detail 是对象数组，取 id） | |
| api_key_count | group.apiKeyCount | **无** → 置 0 | 网关不返回 |
| panel_model_groups.models / selection_strategy | modelGroup.models / selectionStrategy | models / **无** → 置 null | 网关模型组另有 `protocolType`（text/image/embedding/rerank），新增列 |

### 1.3 评估总结

**6 条需求全部可满足**。两个逻辑差异点的处理已含在方案内：
1. **Key 不挂组**（1Panel 特有）→ 授权链第一层从 `portal_api_keys.group_id` 换成 `portal_users.gateway_user_group_id`（由用户同步回填）
2. **无 reveal** → 门户读本地密文（门户本来就落库明文，无功能损失）

---

## 2. 目标架构

```
┌────────────────────── 门户为主（控制面，交互全部不变）──────────────────────┐
│                                                                          │
│  企微扫码 ──→ 门户 OAuth ──→ 门户用户 ──┬→ 同步 1Panel 用户（现状保留）        │
│                                        └→ 同步独立网关用户（追加，POST /admin/users）│
│                                                                          │
│  管理员操作（用户/资源组/RBAC/上架）—— 全部不变，仍以门户为唯一入口            │
│                                                                          │
│  门户定时同步（provider 开关路由）:                                          │
│   [模型]  gateway upstream-accounts → portal_models（is_public/软删逻辑不变） │
│   [组]    gateway user-groups/model-groups → gateway_* 缓存表                │
│   [归属]  gateway users → portal_users.gateway_user_id / gateway_user_group_id│
│                                                                          │
│  用户申请 Key ──→ POST /admin/users/{id}/api-keys（网关签发 sk-，明文落门户）  │
└──────────────────────────────────────────────────────────────────────────┘
┌────────────────────── 数据面（推理流）────────────────────────────────────┐
│  客户端 ──门户展示的 sk- Key──→ 独立网关推理（按网关用户组→模型组鉴权）        │
└──────────────────────────────────────────────────────────────────────────┘
skill / MCP ──→ 1Panel（完全不变）
```

**模型可见性公式（与现状同构，仅数据源换网关）**：

```
可见 = portal_models.is_public（门户上架）
     ∩ 门户资源组勾选（resource_group_items，完全不变）
     ∩ 用户组→模型组（1Panel 模式: key.group_id 三层 JOIN / 网关模式: gateway_user_group_id 两层 JOIN）
```

---

## 3. 分域设计

### 3.1 模型同步（替换数据源）

- `adapter.listModels()`：网关 = `GET /admin/upstream-accounts` 分页拉全量，映射 `accountId ← id`、`groupName ← account.name`、`modelName ← models[].requestModelName`、`modelType ← protocolType`、`enabled`。
- portal_models 批量 UPSERT + 反向 NOT EXISTS 软删 + **空响应不清表** + sync_log，骨架原样复用。
- 附带收益：`parseModelMap` 脏数据清洗在网关模式下退役。

### 3.2 用户组 / 模型组同步（`syncPanelGroups` → `syncGatewayGroups`）

- 新缓存表 `gateway_user_groups` / `gateway_model_groups`（结构对齐 panel_* 表，字段映射见 §1.2；不直接写 panel_* 表，避免 1Panel/网关组 id 空间冲突与切换互相覆盖）。
- **第三路同步改为「归属回填」**（替换 1Panel 版的 api-keys groupId 回填）：
  - `GET /admin/users` 分页拉全量 → 按 username 匹配门户用户 → 回填 `portal_users.gateway_user_id` 与 `gateway_user_group_id`
- 空响应不清表 / 软删语义与现有范式一致。

### 3.3 授权链（`getUserAllowedModels` 按 provider 分支）

```
provider = '1panel'（默认，完全不动）:
  portal_api_keys.group_id → panel_user_groups.model_group_ids → panel_model_groups.models

provider = 'ai-gateway':
  portal_users.gateway_user_group_id → gateway_user_groups.model_group_ids → gateway_model_groups.models
```

- 兜底语义保持：任一层为空 → null → 全公开（存量兼容）。
- **门户资源组对模型的授权（resource_group_items）完全不动**，两层闸门交集逻辑照旧。
- 资源组编辑页 **不需要** 做只读降级（旧方案 B 的 UI 改动取消）。

### 3.4 用户同步（企微登录 + 用户操作联动）

- 企微注册（`oauth.js` bind/skip）：现有 1Panel 同步**保留**；追加网关代建：
  `POST /admin/users { username: normalizeUsername(...), password: 随机, userGroupId: gateway_default_user_group_id }` → 回填 `gateway_user_id`。失败不阻断（对齐现有容错）。
- 用户禁用/删除：现有 1Panel 联动**保留**；追加网关 `disable` / `delete`（失败不阻断，记日志）。
- 网关侧用户组归属：由网关管理员配置（门户只读回填），门户不做改组操作。
- 约束处理：`user_limit_reached`（License 409）、`username_conflict`（409）→ 企微注册路径差异化提示；503 busy 退避。

### 3.5 API Key（网关签发）

- 创建：`POST /admin/users/{id}/api-keys` { name } → 明文 `apiKey` 仅此一次 → 门户落库 `api_key_cipher` + mask；`keyId` 落 `gateway_key_id`（M5 前沿用 panel_key_id 列）。
- 重置 = 删旧（`DELETE .../api-keys/{keyId}`）建新；门户一人一 Key 规则不变。
- reveal：网关不支持 → 回退读本地密文（适配器抛 `not_supported`，调用方 catch 后走本地）。
- 错误码差异化提示：`api_key_limit_reached`（409）、busy（503 退避）。

### 3.6 skill / MCP

完全不动，继续同步 1Panel（`skillsSync.js` / `mcpSync.js` / `panel.js` 相关函数原样）。

### 3.7 数据统计（D-13 已拍板，M6 ✅ 已完成）

- 现状：[admin.js](../../../server/routes/admin.js) 数据统计接口 `POST /ai-proxy/usage/statistics`（1Panel），前端 AdminStatsView 消费。
- 切换：跟随 `gateway_provider` 开关——`ai-gateway` 模式下改调网关 `GET /admin/usage-statistics`。
- **参数形态差异**：1Panel 是 POST body，网关是 GET query（`from/to/userId/...`）。
- **返回结构差异**：网关返回 `{range, summary, providers[], models[], modelGroups[], upstreamAccounts[], userGroups[], users[]}`（UsageDistributionItem = id/key/name/deleted + 聚合计数，计数为**十进制字符串**），需做字段映射适配 AdminStatsView 的现有消费结构。
- **适配器扩展**：ai-gateway provider 新增 `getUsageStatistics(params)` / `getTokenTrend(params)` 域方法（contract.js 已同步）。

**M6 实施结果（2026-10-21）**：

- **共享映射器** [usage-mapper.js](../../../server/lib/gateway/usage-mapper.js)：`toNum`（十进制字符串→数值）/ `mapSummary` / `mapDistribution` / `mapTrends`；命名对齐 1Panel 口径（`inputTokens→promptTokens`、`outputTokens→completionTokens`），分布维度 `accounts←upstreamAccounts`、`groups←userGroups`；网关无失败请求维度 → `failedRequests=0`。
- **管理端**（admin.js `gatewayUsageStatisticsHandler`）：排行无专用端点 → 用 `users[]` 分布组装 `rankUsers`，JOIN portal_users 回填门户用户 id（`panel_user_id ?? id`，红榜 tooltip 显示中文名）；desc/asc 双请求与 1Panel 口径一致；`userId` 钻取先翻译门户 id → `gateway_user_id`（panel 优先，未同步用户返回空数据不报错）。
- **个人中心**（portal.js `GET /api/usage/statistics`）：同步切网关（按 `gateway_user_id` 查询，30s 内存缓存保留），ProfileView 前端零改动。
- **趋势图**：网关无按天分桶 → 用 `token-trend?range=30d`（按天、北京时区分桶），响应附 `trendsMeta.note`，AdminStatsView 趋势标题旁展示提示；趋势桶无请求数 → `requestCount=0`（请求数线为 0）。
- **30 天保留窗口（实测发现）**：网关 usage-statistics 的 `from/to` 超出 `retentionDays=30` 直接 400 invalid_request → 后端钳制到保留窗口内；所选月份完全在窗口外时返回空数据（趋势仍展示）。前端提示文案统一为「网关数据仅保留最近 30 天」。
- **验证**：真实调用（m4test Key 调 /v1/chat/completions）后逐字段比对网关原始响应——summary/providers/models/accounts/groups/rankUsers/trends 全部一致；ascending/钻取/窗口外月份/当月四个场景通过；1Panel 模式分支未动（回归面为零）。
- **数据连续性**：跟随开关切换，切换点之前的历史明细留在 1Panel（见 D-13）。

### 3.8 配置项（system_config）

| 键 | 说明 |
|---|---|
| `gateway_provider` | `'1panel'`（默认）\| `'ai-gateway'`，模型/组/Key 域的路由开关 |
| `gateway_base_url` / `gateway_api_key` | 网关地址 + Bearer 凭证（凭证 365 天有效期，需轮换） |
| `gateway_default_user_group_id` | 企微注册代建用户的默认网关用户组 |
| `gateway_api_timeout` | 超时 ms（默认 10000） |
| `gateway_api_key_updated_at` | （D-07）门户自存凭证写入日期，配置页算剩余天数 + 401 告警 |

---

## 4. 数据模型变更（migrations 041-043）

```sql
-- 041_gateway_tables.sql
CREATE TABLE gateway_user_groups (
  gateway_group_id        INT PRIMARY KEY,
  name                    TEXT NOT NULL,
  enabled                 BOOLEAN DEFAULT TRUE,
  is_default              BOOLEAN DEFAULT FALSE,
  model_group_ids         JSONB DEFAULT '[]',
  max_concurrency         INT DEFAULT 0,
  api_key_max_concurrency INT DEFAULT 0,
  token_plan_id           INT,
  synced_at               TIMESTAMPTZ
);
CREATE TABLE gateway_model_groups (
  gateway_group_id INT PRIMARY KEY,
  name             TEXT NOT NULL,
  protocol_type    TEXT,          -- text | image | embedding | rerank
  models           JSONB DEFAULT '[]',
  synced_at        TIMESTAMPTZ
);

-- 042_gateway_user_columns.sql（M3 实施修正: 1Panel 用户链路保留, panel_user_id 不复用不改名——
--     网关身份用独立新列, 两套 id 并存互不干扰）
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS gateway_user_id INT;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS gateway_user_group_id INT;

-- 043_gateway_config.sql
INSERT INTO system_config (key, value) VALUES ('gateway_provider', '1panel');  -- 默认安全
```

M5 收敛（实施修正）：**列改名取消**——M3/M4 实施后 `gateway_user_id`、`gateway_key_id` 已作为独立新列与 `panel_user_id`、`panel_key_id` 并存（1Panel 链路保留，两套 id 各归各链路），改名反而破坏语义；`portal_models.panel_backend_id` 为双链共表列（双语义），保持原名并以注释说明。M5 剩余 = 存量迁移脚本。

---

## 5. 适配器骨架现状（已落地，无需返工）

`server/lib/gateway/`：contract.js + providers/1panel.js + providers/ai-gateway.js + index.js（`getGateway()` 注册中心 + `gateway_provider` 开关 + 热重载）。

**契约比对结论**：用户提供的 Downloads 版 openapi.yaml 与网关仓库版逐段一致（仅 `CallLogAttempt.errorDetail` 字段与 decision-service 测试描述的小增量），适配器实现与契约吻合，**无需改动**。

新方案下适配器使用方式的变化：
- `listUsers()` 的用途从「只读展示」变为「归属回填」（§3.2），已在契约内。
- 资源组 UI 不再需要只读模式，M3 前端改动取消。

---

## 6. 里程碑计划

| 里程碑 | 范围 | 验收标准 |
|--------|------|----------|
| **M1 配置层** | gateway-config API + 管理后台「独立网关」配置页 + 测试连接 | 保存热生效；对网关真实实例 verifyConnection 通过 |
| **M2 模型同步** | gateway-sync.js 模型路 + modelSync provider 分支 | 网关模式下 portal_models 与 upstream-accounts 一致；is_public 不丢；空响应不清表 |
| **M3 组同步 + 授权链** | gateway_* 表 + syncGatewayGroups（含归属回填）+ getUserAllowedModels 双分支 | 资源组 ∩ 网关模型组交集正确；1Panel 链路回归不变。**过渡期注意（M2 后 M3 前的已知状态）**：模型数据已来自网关但授权交集仍走 1Panel 组缓存——管理员上架的模型名必须在 1Panel 模型组配置中存在，否则普通用户可见集为空；M3 上线后此约束解除 |
| **M4 用户 / Key** | 企微注册追加网关代建 + 用户禁用/删除联动 + Key 路由切网关 | 新用户网关侧自动建档入默认组；Key 创建/重置/删除/reveal 回退全通过 |
| **M5 存量迁移** | `scripts/migrate-to-gateway.js`（存量用户批量代建，幂等，支持 --dry-run） | 全量活跃用户在网关有对应记录并回填 id；可重跑；网关管理员同名校验告警 |
| **M6 统计切换** ✅ | ai-gateway adapter 加 `getUsageStatistics()`/`getTokenTrend()` + 统计接口按 provider 分支 + usage-mapper 字段映射 + token-trend 趋势图 | 网关模式下统计页/个人用量数据与 `GET /admin/usage-statistics` 一致（已真实验证）；1Panel 模式回归不变 |

---

## 7. 切换 Runbook

```
1. 网关侧：建用户组/模型组 → Open API 签发 agw_at 凭证（365 天 + 源 IP 白名单）
2. 门户侧：系统配置 → 独立网关 → 填地址/凭证/默认组 → 测试连接 ✅
3. 跑 scripts/migrate-to-gateway.js：存量用户批量代建（provider 仍为 1panel，不影响线上）
4. 验证 gateway_* 组同步 + 授权 JOIN 出正确模型集
5. 通知全员：Key 切换截止时间（给足过渡期）
6. 切 gateway_provider = 'ai-gateway' → 模型/组/Key 走新网关
7. 全员重建 Key → 观察一个同步周期 → 完成切换
```

回滚：切回 `'1panel'`。用户/组织域始终走 1Panel，与开关无关，回滚面只剩模型/Key 域。

---

## 8. 风险清单

| # | 风险 | 缓解 |
|---|------|------|
| R1 | 管理凭证有效期（默认 90 天/最长 365） | 设 365 天；`gateway_api_key_updated_at` 剩余天数展示 + 401 告警 |
| R2 | 换网关 = 全员 Key 重建（`sk-` 网关签发，物理不可迁移） | Runbook 过渡期 + 公告 |
| R3 | 双写用户（1Panel + 网关都要建）一致性 | 网关建用户失败不阻断，归属同步（listUsers）每 10 分钟对账补齐 |
| R4 | 双身份（网关原生企微登录产生第二个账号） | 运维约定：网关原生企业登录仅限管理员 |
| R5 | License 用户数上限（`user_limit_reached` 409） | 注册路径差异化提示；代建脚本断点续跑 |
| R6 | 503 busy 拖垮同步/注册 | 调度器已有容错；注册路径退避提示 |
| R7 | 网关用户组未配置默认组 → 代建失败 | M1 配置页强校验 `gateway_default_user_group_id` 必填（切 ai-gateway 时） |
| R8 | `getPortalUser` SELECT 缺网关列 → 网关授权层恒全公开（两层 JOIN 断链，`_gatewayAllowedModels` 收到 null 误判兜底） | **已修复（620d07c）**：auth.js SELECT 补 `gateway_user_id` / `gateway_user_group_id` |

> R8 是 V2 最严重隐忧：M3 授权链改造时，portal.js / admin.js 调 `getPortalUser` 只查了 1Panel 相关列，网关新增两列隐没，导致资源组成员访问模型广场时 `userAllowedMap` 恒 null，所有上架模型对所有资源组「无条件可见」。修复方式简单（补 SELECT 两列），但必须作为回归检查项固化：**任何依赖 `req.portalUser` 的端点必须确认 auth.js SELECT 包含 provider 相关列**。

---

## 9. 待讨论问题

> 旧 D-06~D-12 中：D-09（资源组模型 tab 只读）**随方案 B 作废**；其余保留。新增：

### D-13 数据统计切换到网关统计接口 ✅ 已拍板（2026-10-14）

门户数据统计页从 1Panel `ai-proxy/usage/statistics` 切换到网关 `GET /admin/usage-statistics`。
实现要点见 §3.8，纳入里程碑 **M6**（可与 M2-M4 并行开发，但上线跟随 provider 切换）。

**注意（数据连续性）**：统计数据跟随 `gateway_provider` 开关——切到网关后，统计页只能看到切换之后的调用记录，历史调用明细仍留在 1Panel 侧且不再展示。运营上建议在流量低谷期切换。

### D-14 网关 Key 的一人一 Key 与命名
网关支持每用户多 Key（有上限 409 `api_key_limit_reached`），门户现强制一人一 Key。
- 选项 A：维持一人一 Key（推荐，V2 最小变更）
- 选项 B：放开多 Key
- 建议维持 A；Key name 由门户固定生成（如 `portal-{username}`）。

### D-15 存量 1Panel Key 与网关 Key 的过渡期并存展示？
切换后旧 Key（1Panel 签发）仍在 portal_api_keys 表里但已失效于新网关。
- 选项 A：切换时清空/归档旧 Key 记录，用户重建（干净）
- 选项 B：保留展示并标注「已失效」（温柔但易困惑）
- **建议 A**：切换瞬间归档 `archived_at` 标记，Key 页只显示网关 Key。

### D-16 存量密码注册用户（沿用 D-06，方案 B 时未拍板）
- 建议迁移脚本全量代建（幂等），而非懒创建。

---

## 10. 变更记录

| 日期 | 变更 | 决策 |
|------|------|------|
| 2026-10-10 | 初稿：方案 B（网关为授权真相源）+ 适配器骨架 + M1-M5 + D-06~D-12 | D-01~D-05 |
| 2026-10-14 | **方向调整（门户为主）**：网关仅替换模型同步/组同步数据源/Key 签发/用户同步四个点；资源组与组织架构不动；skill/MCP 不动；接口评估结论满足度全绿；D-09 作废；新增 D-13~D-16 | D-13（门户为主，覆盖 D-01 的「网关真相源」与 D-02 的资源组降级） |
| 2026-10-14 | D-13 拍板：数据统计切网关 `GET /admin/usage-statistics`，新增 §3.7 统计域设计与里程碑 M6；M1 配置层开发完成（adde7d3 + 09b3201） | D-13 ✅ |
| 2026-10-21 | **V2 里程碑 M2-M6 全部完成**：M2 模型同步、M3 组同步+授权链（两列并存方案）、M4 用户/Key 切网关、M5 存量迁移脚本、M6 统计切换（usage-mapper + 30 天窗口钳制 + token-trend 趋势 + 个人用量同步切换）。真实环境逐项验证通过 | M2 ✅ M3 ✅ M4 ✅ M5 ✅ M6 ✅ |
| 2026-10-23 | **M7 收官走查 + 两个 bug 修复**（均在 v2 分支）：① getPortalUser 缺网关列导致网关授权层失效（两层 JOIN 恒全公开兜底，620d07c 修复）；② 个人中心月度 Token 趋势图恒空（usage-mapper.mapTrends 未补 totalTokens，a80a757 修复）。1Panel 模式回归验证 provider 分支正确（syncModels/syncGroups 正确路由到 V1 链路）；Skill/MCP 广场路由零波及；前端 vite build 无错误；后端 node --check 通过。已知限制：网关统计 30 天窗口、趋势无请求数列、PanelGroupsView 网关模式空表（预期，低优先级 UX） | R8 ✅ / M7 走查收官 ✅ |
