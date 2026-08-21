# 模型广场（Model Plaza）设计文档

> 日期：2026-08-18
> 状态：待评审
> 关联原型：`docs/prototypes/2026-08-18-model-plaza-prototype.html`（v5）

## 1. 背景与目标

当前「模型广场」（`portal/src/views/ModelsView.vue`）只是按 provider 分组的简单列表，没有运营能力、没有详情、没有按类型的准确调用方式。

本次改造目标（**在现状基础上微调，不推翻重构**）：

1. **可运营**：管理员同步 1Panel 后，人工决定「哪些模型对外展示」，并打标签（推荐/多模态/文本…）。
2. **卡片展示**：模型以卡片呈现（复用 Skill/MCP 卡片样式），左右结构——左栏「标签 + 供应商」筛选，右侧卡片块。
3. **详情页**：模型介绍 + 模型能力 + 调用方式（REST）。
4. **对接方式**：识别 `apiType`，给出准确的 REST 调用示例。

## 2. 现状（已核实）

- **同步**（`server/panel.js::syncModelsFromPanel`）：从 1Panel `/ai-proxy/backends/search` 翻全页拉 backend，展平成 `portal_models`。`is_active` 由同步自动维护。
- **`portal_models` 列**：`panel_backend_id / group_name / model_name / provider / base_url / model_type(=apiType) / raw_data / is_active / timestamps`。唯一键 `(group_name, model_name)`。
- **`/api/models`**（`routes/portal.js`）：`WHERE is_active=TRUE` + RBAC 资源组过滤。
- **资源组授权**：model 适配器 `server/lib/resource-types.js::listAll()` 负责列模型（`WHERE is_active`），供资源组授权界面勾选。
- **后台**：`AdminModelsView.vue` 已是空壳，路由 `/admin/models` + 菜单 `menu:admin-models` 已就位。

## 3. 关键决策汇总

| 决策点 | 结论 |
|---|---|
| 元数据来源 | **混合**：provider/apiType/baseUrl/modelMap 来自 1Panel；描述/能力/标签/是否展示 由管理员维护 |
| 标签与展示 | **分类标签 + 独立「对外展示」开关**，分离 |
| 标签体系 | **预设标签库**（名称 + 颜色 + 排序），统一管理 |
| 标签库范围 | **统一标签库**：全局 `tags` 表 + 每类资源一张关联表（本次 `model_tags`），skill/mcp 后续复用 |
| 新模型默认 | **默认隐藏**（`is_public=false`） |
| 卡片样式 | 对齐 `SkillCard` / `McpCard` |
| 筛选 | 左右结构：左栏**标签 + 供应商**；**去掉「类型」维度** |
| 供应商 | 同步 `provider` 直接展示，后台不维护 |
| 调用方式 | **固定 5 种客户端格式枚举 + 每模型勾选**：openai/response/anthropic/embeddings/rerank，代码常量；每模型 `invocation_formats TEXT[]` 列，可用集合按 apiType 区分，配置在后台模型卡片上（见 §4.3） |
| 卡片展示名 | **真实名**（`api_model_name`） |
| 标签库权限 | **独立权限** `tag:edit` |
| 详情页形式 | **右侧抽屉（Drawer）** |
| 资源组授权 | **只列出 `is_public=TRUE` 的模型**（见 §5.3） |
| 设计原则 | **微调为主，复用现有组件/表结构，不引入新抽象** |

### 3.1 真实数据核验（2026-08-18）

1Panel `backends/search` 返回 16 个 backend，字段：
`id, accountId, accountName, provider, apiType, baseUrl, modelMap, priority, weight, enabled, healthStatus, failureCount, lastError, lastCheckedAt, disabledUntil, createdAt, updatedAt`

- **`apiType`**：16/16 全部 `openai-completions`（对接协议，非模型类型）。
- **`provider`**：`custom`×10、`vllm`×3、`deepseek`×2、`ark-coding-plan`×1。
- **`modelMap`**：`{显示名: 真实名}`，如 `{"dq-direct-deepseek-v4-flash":"deepseek-v4-flash"}`。**当前存的是显示名（key），真正调 API 用真实名（value）。**
- **无**「多模态/缓存/上下文」字段 → 能力元数据需后台维护。

## 4. 数据模型

新增迁移 `043_model_plaza.sql`。

### 4.1 `portal_models` 增加人工维护列

```sql
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS context_window INTEGER;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS max_output_tokens INTEGER;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS cache_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS multimodal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS curated_at TIMESTAMP;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS api_model_name VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS invocation_formats TEXT[] NOT NULL DEFAULT '{}';
```

- `is_public`：对外展示开关（默认 false=隐藏）。**与 `is_active` 严格区分**。
- `api_model_name`：`modelMap` 的 value（真实名），用于「复制模型名」与调用示例（见 §7）。
- `invocation_formats`：该模型对外暴露的调用格式数组（见 §4.3）。同步 INSERT 时按 apiType 落默认值，**同步更新永不覆盖**。

### 4.2 统一标签库（全局库 + 模型关联）

```sql
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  color VARCHAR(20) NOT NULL DEFAULT '#005eeb',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS model_tags (
  model_id INTEGER NOT NULL REFERENCES portal_models(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (model_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_model_tags_tag ON model_tags(tag_id);
```

- `tags` 是全局标签库（统一管理名称/颜色/排序）；`model_tags` 是模型↔标签关联（真外键）。
- 未来 skill/mcp 加标签时，新增 `skill_tags`/`mcp_tags` 复用同一 `tags` 库即可，无需再造标签功能。
- 种子默认标签：推荐 / 多模态 / 文本 / Embedding / 重排。
- 标签库的**增删改查是独立权限 `tag:edit`**（见 §8）。

### 4.3 调用方式（固定格式枚举 + 每模型勾选）

「调用方式」= **客户端如何调用该模型**。AI 网关统一对接后支持多种客户端格式，**不同模型可暴露的格式不同**，管理员在**后台每个模型的卡片/编辑里勾选**要暴露哪几种。

**5 种固定格式（代码常量，curl 预设，类似 new-api 的「类型」，不建表）：**

| format | 端点 |
|---|---|
| `openai` | `POST {base_url}/chat/completions` |
| `response` | `POST {base_url}/v1/responses`（OpenAI Responses API） |
| `anthropic` | `POST {base_url}/v1/messages` |
| `embeddings` | `POST {base_url}/embeddings` |
| `rerank` | `POST {base_url}/rerank` |

**每模型存储：** `portal_models.invocation_formats TEXT[]`（§4.1），存该模型对外暴露的格式。

**可用集合按 `apiType` 区分**（每个模型能勾选的选项不同）：

| apiType | 可配置格式 |
|---|---|
| `openai-completions` / `anthropic` / `response`（对话类） | `openai`、`response`、`anthropic` |
| `embeddings` | `embeddings` |
| `rerank` | `rerank` |

**默认**（同步 INSERT 时 seed）：对话类 → `['openai','anthropic']`；embeddings → `['embeddings']`；rerank → `['rerank']`。**`ON CONFLICT DO UPDATE` 不触碰该列**，管理员改动永不被覆盖。

- 后台模型卡片/编辑里用**复选框**勾选（选项 = 可用集合，已选 = `invocation_formats`）。
- 详情抽屉按该模型 `invocation_formats` 渲染对应 curl。
- 占位符沿用现有约定：`{{base_url}} {{model_name}} {{api_key}}`；调用/复制用 `api_model_name`。

## 5. 后端改动

### 5.1 同步（`server/panel.js`）

1. **`parseModelMap` 返回真实名**：同时返回 key→value，把 **value 写入 `api_model_name`**，**key 仍写 `model_name`**（保持唯一键与历史兼容）。
2. **UPSERT 列集**：`ON CONFLICT DO UPDATE` 增加 `api_model_name = EXCLUDED.api_model_name`。**不触碰任何人工列**（`is_public/description/...` 不在 UPDATE 列表）。
3. **新模型默认隐藏**：`is_public` 列默认 FALSE，INSERT 无需显式赋值。
4. **软删语义不变**：仍按「本轮存活集合」软删 `is_active=false`，不动 `is_public`。
5. **调用方式默认**：同步 **INSERT** 时按 `apiType` 写入 `invocation_formats` 默认值（见 §4.3）；**`ON CONFLICT DO UPDATE` 不触碰该列**（管理员改动永不被覆盖，只在首次插入时 seed）。

### 5.2 门户接口（`routes/portal.js`）

- **`GET /api/models`**（改造）：`WHERE is_active=TRUE AND is_public=TRUE`，返回 `id/group_name/model_name/api_model_name/provider/base_url/model_type/is_public + tags[] + 能力字段`。**保留 RBAC 资源组过滤**。前端本地分页/筛选（标签、供应商）。
- **`GET /api/models/:id`**（新增）：单个公开模型详情（含 meta + tags[] + apiType/base_url/api_model_name）。调用示例由前端按 apiType 渲染。
- **`GET /api/models/example`**：保留。

### 5.3 资源组授权过滤（`server/lib/resource-types.js`）

model 适配器 `listAll()` 增加 `is_public` 过滤：

```sql
-- 原：SELECT model_name, group_name, provider FROM portal_models WHERE is_active ...
-- 改：
SELECT model_name, group_name, provider FROM portal_models WHERE is_active AND is_public ORDER BY group_name, model_name
```

效果：资源组授权界面**只能勾选「已对外展示」的模型**；超管/后台角色的「全公开兜底」也自然只含公开模型。管理员要上架模型，先在「模型管理」打开 `is_public`，再在资源组授权里勾选。

### 5.4 管理接口（`routes/admin.js`）

- **`GET /api/admin/models`**（新增）：返回**全部**模型（含未展示），带 meta + tags，供管理表格。支持分页 + 筛选（搜索/`is_public`/标签/供应商）。
- **`PATCH /api/admin/models/:id`**（新增）：更新 `is_public/description/context_window/max_output_tokens/cache_enabled/multimodal/sort_order/tags[]`。权限 `model:edit`。
- **标签库 CRUD**：`GET/POST/PATCH/DELETE /api/admin/tags`，权限 `tag:edit`。
- **调用方式**：`invocation_formats` 随 `PATCH /api/admin/models/:id` 更新；5 种格式是前端代码常量，无需模板接口。

## 6. 前端

- **`ModelsView.vue`（重构）**：居中 hero + 左右结构（左栏标签/供应商，右侧卡片网格）。只请求 `is_public` 模型。点击卡片 → **右侧抽屉**展开详情。
- **`ModelCard.vue`（新增）**：对齐 `SkillCard`（`p-6` + 首字母头像 + 标题 + 副标题 + 标签溢出「+N」+ `border-t` footer 能力 meta）。右上角「复制模型名」。
- **`ModelDetailDrawer.vue`（新增）**：点击卡片后**右侧抽屉（Drawer）**展开。介绍 → 调用地址（Base URL / 模型名，复制）→ 能力（上下文/输出/多模态/缓存/对接方式/供应商）→ 调用方式（按 `invocation_formats` 渲染对应格式的 curl，tab 切换 + 复制）。
- **`AdminModelsView.vue`（填充空壳）**：管理表格（模型名/供应商/标签/对外展示开关/编辑）+ 编辑弹窗（描述、上下文、输出、缓存、多模态、标签多选、对外展示）+ 「统一标签库」弹窗。
- **弹框**：统一用 `AppDialog`，禁用 `window.confirm/alert`。

## 7. 模型名映射（关键坑）

`modelMap` 是 `{显示名: 真实名}`。约定：
- `model_name` = 显示名（key），保持现状（唯一键 + 历史兼容）。
- `api_model_name` = 真实名（value），**「复制模型名」和调用示例一律用 `api_model_name`**。

> 已确认：卡片/详情/复制一律用**真实名 `api_model_name`**；`model_name`（显示名）仅作内部唯一键。

## 8. RBAC

- `menu:admin-models`（已有）控制后台入口。
- 新增权限原子 **`model:edit`**（「模型编辑」），种子授予 admin。`PATCH /api/admin/models/:id` 用 `requirePermission('model:edit')`。
- 新增权限原子 **`tag:edit`**（「标签管理」），种子授予 admin。标签库 CRUD 用 `requirePermission('tag:edit')`（独立权限）。
- ⚠️ **必须同步加入后台准入清单**：前端 `AdminLayout.vue` 的 `hasAnyAdminPerm` 与后端 `permission.js::ADMIN_PERMS` 都是硬编码清单；新增的 `model:edit` / `tag:edit` 必须加进这两处，否则只授这两个权限 + `menu:admin-models` 的角色会被踢回首页。
- 门户 `/api/models` 保持 `requirePermissionOrAdminRole('model:view')` 不变。

## 9. 边界与坑

1. **`is_active` ≠ `is_public`**：同步只管 `is_active`，绝不动 `is_public` 及人工列。
2. **同步空响应不清表**（铁律 6）。
3. **1Panel 业务码**（铁律 1/2）。
4. **模型名映射**：`api_model_name` 取 `modelMap` 的 value，value 缺失兜底 key。
5. **标签删除级联**：删标签 `ON DELETE CASCADE` 清关联，模型本体不动。
6. **资源组过滤叠加**：`is_public` 过滤（全局）+ 资源组过滤（用户级）同时生效。

**已知风险（实现时注意）：**

7. **人工数据漂移**：`is_public/description/tags/invocation_formats` 挂在 `(group_name, model_name)` 上，而 `group_name`=accountName 可被 1Panel 修改。账户改名 / 模型 key 变更 → 老行软删、新行重建 → 人工数据清零。**已知风险**，上线后留意；必要时按 `panel_backend_id` 做关联迁移。
8. **重名模型**：`api_model_name` 跨 backend 可能重复（真实数据已见 #28/#27 同名）。卡片副标题需带账户/供应商区分，或后续支持去重。
9. **`PATCH /api/admin/models/:id` 多表写入**：标量 + `tags[]` + `invocation_formats` 需在同一事务；`tag_id` 必须校验存在（否则 FK 报错）。
10. **迁移副作用**：`ADD COLUMN is_public DEFAULT FALSE` 上线后所有已同步模型瞬间从广场消失，管理员需逐个上架。上线时需批量上架工具或明确告知。
11. **`sort_order` 排序规则**：广场卡片按 `sort_order → provider → name` 排序，需在实现时固定。

## 10. 测试

- 同步不覆盖人工数据（`is_public/description/tags` 保持不变）。
- 新模型默认 `is_public=false`。
- `modelMap` key≠value 时 `api_model_name`=value，复制的是 value。
- 标签 CRUD + 关联 + 删除级联。
- 资源组授权列出的模型只含 `is_public=TRUE`。
- 权限：非授权用户 `PATCH /api/admin/models/:id` 403；普通用户 `/api/models` 只看到 `is_public` 且命中资源组的模型。

## 11. 设计原则（回应「勿臆想重构」）

- **复用现有组件**：卡片对齐 `SkillCard`/`McpCard`，弹框用 `AppDialog`，筛选用 `FilterItem` 下拉风格。
- **复用现有表结构**：`portal_models` 加列（而非新建元数据表）；配置走 `system_config`；标签用「库表 + 关联表」常规范式。
- **不引入新抽象**：不用多态关联，不建调用方式表，不重构同步/资源组核心逻辑，只做定点增列 + 新增两个接口 + 前端视图改造。

## 12. 已确认项

1. ✅ **卡片展示名**：真实名 `api_model_name`。
2. ✅ **标签库权限**：独立权限 `tag:edit`。
3. ✅ **详情页形式**：右侧抽屉（Drawer）。
4. ✅ **调用方式**：固定 5 种格式枚举（openai/response/anthropic/embeddings/rerank）+ 每模型 `invocation_formats` 勾选，默认 OpenAI + Anthropic。

---

## 附：临时原型文件（评审后清理）

- `portal/src/views/ModelPlazaPrototype.vue` + `main.js` 里 `/models-prototype` 临时路由 —— 实现时删除。
- `docs/prototypes/2026-08-18-model-plaza-prototype.html` —— 保留作参考。
