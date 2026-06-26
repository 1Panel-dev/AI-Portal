# 1Panel API 调用踩坑笔记

> 这份文档沉淀了所有跟 1Panel 企业版 API 网关交互时**真实踩过**的坑。改 `server/panel.js` / `server/routes/portal.js` / `server/routes/admin.js` 里 1Panel 相关代码前请先读完。

## 关于 1Panel API 的几条铁律

### 铁律 1：业务失败不一定是 HTTP 错误

1Panel 习惯把业务状态塞在 HTTP 200 响应的 `body.code` 字段里。常见组合：

| HTTP | body.code | body.message | 含义 |
|---|---|---|---|
| 200 | 0 | "" | 业务成功 |
| 200 | 200 | "" | 业务成功（部分接口） |
| 200 | 400 | "请求参数错误: user already has an ai proxy api key" | 业务失败 |
| 200 | 401 | "API 接口禁止访问" | 鉴权/Token 失败 |
| 200 | 500 | 各种服务端报错 | 业务失败 |
| 5xx | - | - | HTTP 层失败 |

**只判断 HTTP 状态码 = 把业务失败当成功**。这是 reset 流程曾经的根因 bug，导致前端拿到一个本地随机生成的 "key"，但 1Panel 那边根本没创建，后续所有调用都失败。

### 铁律 2：业务成功的 code 不统一

实测过 `code === 0` 和 `code === 200` 都被 1Panel 当成功（不同接口/不同版本不一致）。所以**用"黑名单"语义判断失败**，而不是"白名单"判断成功：

```js
const code = Number(body?.code)
if (Number.isFinite(code) && code >= 400) { /* 失败 */ }
// 其余一律视为业务成功
```

这条规则 `server/panel.js::syncModelsFromPanel` 和 `server/routes/portal.js::inspectPanelBiz()` 都已落实，新加的 1Panel 调用路径**直接复用 `inspectPanelBiz`**，不要再就地重写一份。

### 铁律 3：search 接口必须翻全页

所有 `*/search` 接口的 `pageSize` 上限是 100（实测）。直接 `pageSize: 100, page: 1` 当作完整列表用，会在远端记录数 > 100 时**静默漏数据**——而这种漏数据通常表现为：

- "该用户名下找不到他的 key" → 误报"未真正创建"
- "已下架的技能没被软删" → 假数据滞留

**正确做法**：循环翻页直到 `items.length < pageSize` 或拿到 `total` 字段。范式见：

- `server/routes/portal.js::listPanelKeysOfUser()` —— 按 panel `userId` 过滤拿全量 key
- `server/panel.js::syncSkillsFromPanel()` —— 按 status=published 翻全页

### 铁律 4：1Panel 端的"一人一 API Key"约束

`/api/v2/core/enterprise/ai-proxy/api-keys/create` 在用户已有 key 时会返：

```
HTTP 200 + code=400 + "请求参数错误: user already has an ai proxy api key"
```

任何"先删旧 → 再建新"的流程**必须先校验 panel 端 0 残留再创建**。光看本地 DB 的 `panel_key_id` 删一次是不够的，因为：

- 上次 reset 半失败 → 本地 `panel_key_id` 与远端实际 id 不一致
- 远端被人手工删了又新建 → 本地缓存的 id 已失效
- delete 的 catch 不阻断 → 本地以为删成功了，远端其实没动

**正确做法**：用 `panel_user_id` 去远端 search 当前所有 key，挨个删，删完再 search 一次确认 0 条，再 create。复用 `purgePanelKeysOfUser()` 即可。

### 铁律 5：删除接口失败不要静默吞掉

reset/delete 类路径的旧实现里有不少 `try { ... } catch (e) { console.error(e) /* 不阻断 */ }`，理由是"删失败也能继续往下走"。**这是 bug 模板**——删失败 + 继续创建 = 100% 触发铁律 4 的"已存在"，最终只是把锅推到下游用更模糊的方式抛出。

**正确做法**：删旧 key 失败 → 直接 502 返回，让前端给用户一个明确的"上一步失败"信号，不要尝试自动恢复。详见 `routes/portal.js` 里的 `PANEL_PURGE_FAILED`。

### 铁律 6：sync 类调用拿到空数组要"宁可不动"

如果 `panel.post('/.../search', ...)` 返回了 HTTP 200 + 空 items，**别立刻把本地表里的对应数据软删/物理删**。原因：

- 1Panel 端临时鉴权通过但内部异常 → 返空
- 1Panel 重启中 → 短暂返空
- 网关 token 过期临界点 → 偶发返空

任何"远端没有 → 本地软删"的逻辑都要先校验 `items.length > 0`，否则一次抖动会把本地 portal_models / skills 全部下架。`syncModelsFromPanel` 已经按这条策略实现（参考它）。

### 铁律 7：二进制响应（zip）走 Buffer，不要 toString

`/api/v2/core/enterprise/skills-hub/download` 返回 `application/zip`，`server/lib/1panel-api.js` 已经识别 `content-type` 自动转 Buffer。新加二进制端点时如果 mime 是别的（octet-stream / x-zip 等），更新 `1panel-api.js::request` 里的 `isBinary` 判断，不要在调用方 toString 再 base64 转码。

### 铁律 8：Skills Hub 上传必须走 multipart/form-data

`/api/v2/core/enterprise/skills-hub/upload` 不接受 JSON + base64，会返回：

```
HTTP 200 + code=400 + "request Content-Type isn't multipart/form-data"
```

上传 zip 必须走 `server/lib/1panel-api.js::postMultipart()`，文件字段名当前使用 `file`，普通字段放 `fields`。不要把 zip 转 base64 放 JSON。

## 错误码与文案对照表

`server/routes/portal.js` 在 reset/create 失败时统一返 502 + 一个稳定的 `code` 字段，前端按 code 决定文案与是否允许重试：

| code | HTTP | 触发条件 | 前端建议 |
|---|---|---|---|
| `PANEL_UNREACHABLE` | 502 | `panel.post` 抛异常（DNS/连接拒绝/超时/TLS） | 告诉用户 1Panel 不可达，可重试 |
| `PANEL_REJECTED` | 502 | HTTP 非 2xx **或** 业务 code≥400 | 显示 `reason` 字段（含 1Panel 原文 message） |
| `PANEL_PURGE_FAILED` | 502 | reset 清理旧 key 阶段失败 | 提示"清理旧 key 失败"，可重试 |
| `PANEL_SKILL_APPROVE_FAILED` | 502 | 管理员审核通过时调用 1Panel `/skills-hub/status` 失败 | 本地审核状态不改变；显示 `reason` |
| `PANEL_SKILL_REJECT_FAILED` | 502 | 管理员审核驳回时调用 1Panel `/skills-hub/status` 失败 | 本地审核状态不改变；显示 `reason` |
| `PANEL_SKILL_PUBLISH_FAILED` | 502 | 管理员上架技能时调用 1Panel `/skills-hub/status` 失败 | 本地 `is_active` 不改变；显示 `reason` |
| `PANEL_SKILL_DISABLE_FAILED` | 502 | 管理员下架技能时调用 1Panel `/skills-hub/status` 失败 | 本地 `is_active` 不改变；显示 `reason` |
| `PANEL_SKILL_DELETE_FAILED` | 502 | 管理员删除本地技能时调用 1Panel `/skills-hub/delete` 失败 | 本地技能不删除；显示 `reason` |
| `PANEL_SKILL_UPLOAD_FAILED` | 502 | 用户提交技能时同步上传 1Panel Skills Hub 失败 | 显示 `reason` 字段；本地待审核记录不会写入；成功时不再上传 COS/local storage |
| `PANSL_SYNC_UNVERIFIED` | 502 | create 既没返 id，search 翻全页也找不到 | 提示让管理员检查；**注意 typo `PANSL` 是历史拼写,不要修正**——已用于运维告警匹配 |

## 调试步骤

页面报"重置 API Key 失败"或类似 502，**第一步永远是看后端日志**：

```bash
docker logs ai-portal-app --tail 300 2>&1 \
  | grep -E '\[panel-call\]|\[reset\]|\[create-key\]'
```

`[panel-call]` 行末尾告诉你是哪一类失败：

- `✅ HTTP=200 code=0` —— 这步成功
- `❌ business HTTP=200 code=400 "..."` —— 业务失败（最常见，看 message）
- `❌ http HTTP=5xx` —— 1Panel 服务端炸了
- `❌ unreachable <errcode>` —— 网络不可达
- `❌ timeout <ms>` —— 超时（默认 10s，可在管理后台调）

把这几行连同 `[reset]` / `[create-key]` 自己打的诊断日志一起看，根因 90% 能直接定位。

## 历史 incident 索引

| 时间 | 现象 | 根因 | 修复 commit / 段落 |
|---|---|---|---|
| ~ 6 月 | reset 502 "1Panel 似乎未真正创建 API Key" | reset 漏判业务码 + delete 静默失败 + search 不翻页三连 | `routes/portal.js` 引入 `inspectPanelBiz` / `listPanelKeysOfUser` / `purgePanelKeysOfUser` |
| `fbe2090` | 1Panel 调用错误识别不准 + 偶发误删本地缓存 | 缺统一日志 + sync 拿空数组就清表 | `panel.js` 加业务码黑名单 + 空响应跳过软删 |

## 给未来改这块代码的人

1. 增加 1Panel 调用 → 复用 `panel.post`，复用 `inspectPanelBiz`，复用 `listPanelKeysOfUser` 这种翻页范式。
2. 失败处理优先返明确的 `code: 'PANEL_*'`，不要在 502 里只丢一句 message。
3. 改完跑一遍：删 1Panel 端用户残留 key → 申请 → 重置 → 重置（连点两次）→ 删本地 user → 检查 1Panel 端 user/key 都被清掉。这条路径覆盖了所有铁律。
