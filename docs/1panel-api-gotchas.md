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

### 铁律 9：证书续期后报 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` = 服务端只发了裸叶子证书

PANEL_BASE_URL 是 https 时，2026-09 在 sh.fit2cloud.cn 真实踩过：1Panel 证书续期后，AI-Portal 所有 `[panel-call]` 全变 `❌ unreachable UNABLE_TO_VERIFY_LEAF_SIGNATURE`，而浏览器/curl 访问面板一切正常。

**两个报错码要分清**：

| 报错码 | 含义 | 典型原因 |
|---|---|---|
| `CERT_HAS_EXPIRED`（"certificate has expired"） | 证书过期了 | 真到期，续期即可 |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE`（"unable to verify the first certificate"） | Node 在服务端发来的链里**找不到签发者** | 只部署了叶子证书，缺中间证书链 |

**为什么浏览器正常但容器报错**：Chrome 会自动补中间证书（AIA fetching + 本地缓存），Windows curl 走 schannel 也会补；Node 不补链，服务端发什么验什么。**浏览器能打开 ≠ 链完整**——别被"我浏览器访问没问题"带偏。

**诊断**（容器内 node 即可，不用装 openssl）：

```bash
docker exec 1Panel-ai-portal-HkcY node -e '
const tls = require("tls");
tls.connect({ host: "sh.fit2cloud.cn", port: 33846, servername: "sh.fit2cloud.cn", rejectUnauthorized: false }, function () {
  let c = this.getPeerCertificate(true), i = 0;
  while (c && c.subject && i < 10) {
    console.log(`#${i+1}`, c.subject.CN, "<-", c.issuer.CN, "| 到期:", c.valid_to);
    if (!c.issuerCertificate || c.issuerCertificate === c) break;
    c = c.issuerCertificate; i++;
  }
  console.log("共", i+1, "张证书");
  this.end();
}).on("error", e => console.error(e.message));
'
```

- 只打出 **1 张**（且有效期是新的）→ 缺中间链，`UNABLE_TO_VERIFY_LEAF_SIGNATURE` 即由此来
- 有效期还是旧的 → 续期没作用到这个端口，找真正终结 TLS 的那层
- SAN 检查顺带做：`this.getPeerCertificate().subjectaltname` 必须含访问用的域名（通配符 `*.fit2cloud.cn` 也算）

**修复**：证书栏贴 **fullchain**（叶子 + 中间 CA 两段，`grep -c 'BEGIN CERTIFICATE'` 必须 ≥ 2），不是 `certificate.cer`（裸叶子）也不是 `ca_bundle.cer`（只有中间链）。私钥不动。如果手头没有 fullchain 文件：叶子从线上抓（`openssl s_client -connect host:port | openssl x509`），中间证书从叶子证书 AIA 字段里的 `CA Issuers - URI` 官方地址下载，拼起来即可——拼完先 `openssl verify -CAfile 根.pem -untrusted 中间.pem 叶子.pem` 验一遍再贴。

修复是纯 TLS 层操作，改完**立即生效，不用重启 AI-Portal 容器**。

### 铁律 10：Skills Hub 开版本管理后，"技能"与"版本"是两层身份

**现象**（2026-09 线上三连）：审核通过后 1Panel 已 published，10 分钟后自动同步把本地技能下架（1Panel 端没动）；卡片版本号不更新；管理员点上架报 `code=400 "only approved or disabled skills can be published"`。

**根因**：开了版本管理后，**同一技能每个版本是独立记录（id 独立）**，`search` 只返回各技能当前最新版本的 id。任何"本地存一个 panel_skill_id 当永久身份"的假设都会在版本迭代时碎掉：

| 误区 | 后果 |
|---|---|
| 软删只按 `panel_skill_id ∉ search 返回 id 列表` 判断 | 新版本 pending 时整条记录从 published search 消失 → 误判"远端已删" → 本地下架（1Panel 无感知） |
| `versions` 里取 `isLatest=true` 当"线上版本" | `isLatest` 是**全版本最新（含 pending）**，审核通过后把 pending 版本的 id/版本号写进 skills 表 |
| 对存量 id 直接发 publish | pending 版本不接受 publish（1Panel 状态机只接受 approved/disabled）→ 400 |

**正确做法**（均已落实）：

1. **软删按"技能身份"判断**：`panel_skill_id` 不在 published id 列表 **且** 技能名（slug 去 `1panel-` 前缀）不在远端全量 name 集合，才下架。见 `syncSkillsFromPanel`。
2. **展示版本只取已发布**：`versions` 里优先 `isLatestPublished=true` / `status='published'` 的版本（`getLatestPanelVersion`），不要用 `isLatest`。
3. **上下架前先看远端版本状态**（`resolveToggleTarget`）：远端已有 published 版本 → 本地只翻 `is_active`（noop，把 panel_skill_id 对齐到最新发布版本）；publish 对最新 approved 版本发；disable 对最新 published 版本发；全部 pending → 提前报错。
4. **sync 的 dup-skip 分支要回写版本**：本地 local 行跳过 UPSERT 时，同步远端 version/panel_skill_id/panel_status，且 `panel_skill_id` 换 id 时必须**同步搬移 `resource_tags`**（skill 标签以 panel_skill_id 为关联键），回写要带占用守卫防撞 `idx_skills_panel_unique`。

**怎么快速分辨这类问题**：`docker logs <容器> | grep '\[syncSkills\]'`，看下架前最后一轮 `published=X` 与 `软删除 N 个` 的差值；再拿本地 `panel_skill_id` 对比 1Panel search 返回的 id——对不上且名字还在远端，就是版本 id 漂移，不是真下架。

### 铁律 11：审核通过写入 skills 表前，先按"技能身份"找原行做版本迭代

**现象**（2026-09 线上）：用户给已有技能上传新版本，管理员审核通过后原技能没变；点同步后原技能被下架，顶上来一个同名"新"技能（版本是最新版），下载量/标签/版本历史全断。

**根因**：审核通过的写入是 `INSERT INTO skills (id=技能名...) ON CONFLICT (id) DO UPDATE`。`ON CONFLICT (id)` 只能命中 **id=技能名** 的行（此前也走门户审批上架的技能）。若原技能最初是 **1Panel 同步来的**（`source='panel'`，行是 `id='1panel-<远端id>'`、`slug='1panel-<技能名>'`），INSERT 匹配不到它 → 新建一个同名本地行；下一轮 sync 的 dupDeactivation 发现有本地同名 slug，又把原 panel 行当"重复"下架。两个 bug 叠加，看起来就像"同步把原技能顶掉了"。

**正确做法**（已落实，`routes/admin.js` 审核通过）：

1. **先按技能身份找原行**：`id=技能名 OR slug=技能名 OR slug='1panel-'||技能名 OR panel_skill_id=本次远端记录id` 四种形态都认，命中就在原行上 UPDATE 迭代版本（下载量/标签/版本历史/资源组授权全部保住），都未命中才 INSERT。
2. **panel 行转为本地托管**：命中 panel 行时 `source='local'`、slug 去 `1panel-` 前缀、install_url 按新 slug 派生；行 **id 不改**（主键被 skill_versions/download_stats FK 引用且无 ON UPDATE CASCADE）。此后 sync 走 dup-skip 回写分支持续迭代版本（铁律 10 第 4 条）。
3. **版本历史挂真实行 id**：`skill_versions.skill_id` 外键指向 `skills.id`，写入用查到的原行 id，不要想当然用提交记录的 `skill_id`（panel 行转换后两者不相等，写错直接 FK 违例）。
4. **panel_skill_id 换 id 时搬 resource_tags**：与 sync dup-skip 分支同款（先删新 id 上的冲突标签再搬），审核时就搬，别等下一轮 sync（那时两边 id 已相等，sync 不会再搬）。

**关联修复**：`/api/my/skills` 的 `LEFT JOIN skills live ON live.id = s.skill_id` 补 `OR live.slug = s.skill_id`，否则转换后的行在"我的技能"里查不到 live 状态，显示成已下架。

## 错误码与文案对照表

`server/routes/portal.js` 在 reset/create 失败时统一返 502 + 一个稳定的 `code` 字段，前端按 code 决定文案与是否允许重试：

| code | HTTP | 触发条件 | 前端建议 |
|---|---|---|---|
| `PANEL_UNREACHABLE` | 502 | `panel.post` 抛异常（DNS/连接拒绝/超时/TLS） | 告诉用户 1Panel 不可达，可重试 |
| `PANEL_REJECTED` | 502 | HTTP 非 2xx **或** 业务 code≥400 | 显示 `reason` 字段（含 1Panel 原文 message） |
| `PANEL_PURGE_FAILED` | 502 | reset 清理旧 key 阶段失败 | 提示"清理旧 key 失败"，可重试 |
| `PANEL_SKILL_APPROVE_FAILED` | 502 | 管理员审核通过时调用 1Panel `/skills-hub/status` 失败 | 本地审核状态不改变；显示 `reason` |
| `PANEL_SKILL_REJECT_FAILED` | 502 | 管理员审核驳回时调用 1Panel `/skills-hub/status` 失败 | 本地审核状态不改变；显示 `reason` |
| `PANEL_SKILL_PUBLISH_FAILED` | 502 | 管理员上架技能时：远端无 published/approved 版本（全部 pending），或 `/skills-hub/status` 调用失败 | 本地 `is_active` 不改变；显示 `reason` |
| `PANEL_SKILL_DISABLE_FAILED` | 502 | 管理员下架技能时 `/skills-hub/status` 失败 | 本地 `is_active` 不改变；显示 `reason` |
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
| 2026-09 | 证书续期后所有 panel-call 报 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`，浏览器正常 | 续期只贴了裸叶子证书，缺中间链；Node 不补链 | 铁律 9：证书栏必须贴 fullchain（2 段 `BEGIN CERTIFICATE`） |
| 2026-09 | 审核通过后 sync 误下架 + 卡片版本不更新 + 上架报 400 | 版本管理下每版本独立 id：软删只认 id / `isLatest` 混入 pending / 盲发 publish | 铁律 10：身份按名字判断 + 只取 isLatestPublished + `resolveToggleTarget` 先探测后操作 |
| 2026-09 | 审核通过新版本后原技能没更新，同步后原技能被下架、顶上来同名新技能 | `ON CONFLICT (id)` 只命中 id=技能名的行，panel 同步行匹配不到 → 新建同名行 + sync dupDeactivation 下架原行 | 铁律 11：审核写入前按技能身份找原行迭代版本，panel 行转本地托管，版本历史挂真实行 id |

## 给未来改这块代码的人

1. 增加 1Panel 调用 → 复用 `panel.post`，复用 `inspectPanelBiz`，复用 `listPanelKeysOfUser` 这种翻页范式。
2. 失败处理优先返明确的 `code: 'PANEL_*'`，不要在 502 里只丢一句 message。
3. 改完跑一遍：删 1Panel 端用户残留 key → 申请 → 重置 → 重置（连点两次）→ 删本地 user → 检查 1Panel 端 user/key 都被清掉。这条路径覆盖了所有铁律。
