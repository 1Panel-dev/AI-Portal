/**
 * GatewayAdapter 接口契约 —— AI-Portal V2 网关抽象层
 *
 * 方案（v2 修订，2026-10-14，门户为主）：
 *   - 门户保留全部现有交互、授权逻辑与组织架构；独立网关仅替换四个
 *     「后端数据源 / 执行点」：① 模型同步数据源（upstream-accounts）
 *     ② 用户组/模型组同步数据源（user-groups / model-groups，仅换数据源，
 *     授权公式与资源组交互不变）③ API Key 签发（网关签发，明文仅返回一次）
 *     ④ 用户同步目标（企微注册/用户操作联动，1Panel 同步保留）。
 *   - 模型可见性公式不变：is_public ∩ 门户资源组 ∩ 用户组→模型组；
 *     仅网关模式下授权链第一层从 key.group_id 换成用户组归属（见下）。
 *   - skill / MCP 不在本契约范围内：它们继续走 1Panel（skills-hub / mcp），
 *     与网关切换正交，永不切换。
 *
 * 本文件只定义契约（数据形状 + 方法签名 + 错误约定），
 * 实现在 providers/1panel.js 与 providers/ai-gateway.js。
 * V2 迁移时，调用方（panel.js 的 sync 编排、portal.js/admin.js 的用户与 Key 路由）
 * 改为从 ./gateway 的 getGateway() 取适配器调用，不再直接调 1panel-api。
 *
 * ============ 归一化数据结构 ============
 *
 * ModelRow            —— 模型同步数据源（V2 中替代 1Panel backends）
 *   { accountId, groupName, modelName, provider, baseUrl, modelType, enabled, raw }
 *
 * UserGroupRow        —— 用户组（授权只读同步）
 *   { groupId, name, enabled, isDefault, modelGroupIds:number[],
 *     maxConcurrency, apiKeyMaxConcurrency, tokenPlanId, raw }
 *
 * ModelGroupRow       —— 模型组（授权只读同步）
 *   { groupId, name, protocolType, models:string[], raw }
 *
 * GatewayUserRow      —— 网关用户（用于回填 portal_users.gateway_user_group_id）
 *   { userId, username, enabled, groupId, raw }
 *   注：groupId 为用户所属用户组 id；1Panel 无「用户直接归属组」概念，恒为 null。
 *
 * GatewayKeyRow       —— 网关侧模型 Key
 *   { keyId, name, mask, enabled, raw }
 *
 * ============ 错误约定 ============
 *
 * 所有方法失败时 throw Error，并尽量附带结构化字段：
 *   err.provider = '1panel' | 'ai-gateway'
 *   err.status   = HTTP 状态码（可得时）
 *   err.code     = 稳定业务码（可得时，如 ai-gateway 的 username_conflict /
 *                  user_limit_reached / api_key_limit_reached / busy）
 * 调用方按 err.code 做差异化提示（如 409 user_limit_reached → 企微注册时提示License 到期），
 * 网关 503 busy 由调用方退避重试（同步调度器已有「失败不抛错等下一轮」语义）。
 *
 * ============ V2 计划的表/列变更（暂不建 migration，V2 动工时一并出） ============
 *
 *   portal_users.panel_user_id        → gateway_user_id
 *   portal_users 新增                   gateway_user_group_id（由用户同步回填，授权 JOIN 用）
 *   portal_api_keys.panel_key_id      → gateway_key_id（group_id 列保留给 1Panel 链路）
 *   portal_models.panel_backend_id    → gateway_account_id
 *   新表 gateway_user_groups          ← 适配器 listUserGroups()（对齐 panel_user_groups 范式）
 *   新表 gateway_model_groups         ← 适配器 listModelGroups()（对齐 panel_model_groups 范式）
 *   授权 JOIN（getUserAllowedModels）简化为两层：
 *     portal_users.gateway_user_group_id → gateway_user_groups.model_group_ids
 *                                        → gateway_model_groups.models
 *   （仅网关模式用两层 JOIN；1Panel 模式保留 key.group_id 三层 JOIN 不变——
 *    AI-Gateway 用户只属一个组，Key 继承用户授权）
 *
 * ============ 配置键约定（system_config，V2 管理后台接入） ============
 *
 *   gateway_provider            '1panel'（默认）| 'ai-gateway'
 *   gateway_base_url            AI-Gateway 地址，如 http://1.2.3.4:8080
 *   gateway_api_key             Bearer 凭证（agw_at_...，网关「系统设置→Open API」签发，
 *                               有效期默认 90 天 / 最长 365 天，过期前需轮换）
 *   gateway_default_user_group_id  门户代建用户进入的网关默认用户组
 *   gateway_api_timeout            请求超时 ms（默认 10000）
 */

'use strict';

/**
 * @typedef {Object} ModelRow
 * @property {number|string} accountId   网关侧上游账号 id（portal_models.gateway_account_id）
 * @property {string}        groupName   分组名（portal_models.group_name，唯一键之一）
 * @property {string}        modelName   模型名（portal_models.model_name，唯一键之一）
 * @property {string}        provider    供应商
 * @property {string}        baseUrl     上游地址
 * @property {string}        modelType   1Panel: apiType / AI-Gateway: protocolType(text|image|embedding|rerank)
 * @property {boolean}       enabled     网关侧是否启用
 * @property {*}             raw         网关原始对象（portal_models.raw_data）
 *
 * @typedef {Object} UserGroupRow
 * @property {number}   groupId
 * @property {string}   name
 * @property {boolean}  enabled
 * @property {boolean}  isDefault
 * @property {number[]} modelGroupIds
 * @property {number}   maxConcurrency       1Panel: qpsLimit / AI-Gateway: maxConcurrency
 * @property {number}   apiKeyMaxConcurrency 1Panel: tokenLimit / AI-Gateway: apiKeyMaxConcurrency
 * @property {number|null} tokenPlanId       AI-Gateway Token 套餐；1Panel 恒 null
 * @property {*}        raw
 *
 * @typedef {Object} ModelGroupRow
 * @property {number}     groupId
 * @property {string}     name
 * @property {string|null} protocolType     text|image|embedding|rerank；1Panel 恒 null
 * @property {string[]}   models
 * @property {*}          raw
 *
 * @typedef {Object} GatewayUserRow
 * @property {number}      userId
 * @property {string}      username
 * @property {boolean}     enabled
 * @property {number|null} groupId   所属用户组 id；1Panel 恒 null
 * @property {*}           raw
 *
 * @typedef {Object} GatewayKeyRow
 * @property {number}      keyId
 * @property {string}      name
 * @property {string}      mask
 * @property {boolean}     enabled
 * @property {*}           raw
 *
 * @typedef {Object} GatewayAdapter
 *
 * // ---- 元信息 ----
 * @property {'1panel'|'ai-gateway'} name
 * @property {(pool: import('pg').Pool) => Promise<void>} init      进程启动后调用一次（加载 DB 配置）
 * @property {(pool: import('pg').Pool) => Promise<void>} reload    管理后台保存配置后调用（热重载）
 * @property {() => Object} getConfig   脱敏配置（供系统配置页展示）
 * @property {() => Promise<{ok:boolean}>} verifyConnection  连通性/凭证校验（系统配置「测试连接」用）
 *
 * // ---- 模型域（V2: syncModelsFromGateway 数据源）----
 * @property {() => Promise<ModelRow[]>} listModels
 *
 * // ---- 授权域（V2: 只读同步到 gateway_user_groups / gateway_model_groups）----
 * @property {() => Promise<UserGroupRow[]>} listUserGroups
 * @property {() => Promise<ModelGroupRow[]>} listModelGroups
 * @property {() => Promise<GatewayUserRow[]>} listUsers
 *
 * // ---- 用户域（V2: 门户代操作网关用户；企微注册/管理员禁用/删除联动）----
 * @property {(username: string) => Promise<GatewayUserRow|null>} findUser
 * @property {({username:string, password:string, name:string}) => Promise<{userId:number}>} createUser
 *   1Panel: 密码 base64 + nodeRoles；AI-Gateway: 入 gateway_default_user_group_id，首登强制改密（门户用户不登控制台，无影响）
 * @property {(userId:number) => Promise<void>} enableUser   可选：不支持时 throw err.code='not_supported'
 * @property {(userId:number) => Promise<void>} disableUser  可选：同上（门户禁用用户时联动吊销网关侧）
 * @property {(userId:number) => Promise<void>} deleteUser
 *
 * // ---- Key 域（V2: 门户创建/重置/删除 Key 的代操作）----
 * @property {(userId:number) => Promise<GatewayKeyRow[]>} listKeysOfUser
 * @property {(userId:number, opts:{name:string, apiKey?:string}) => Promise<{keyId:number, apiKey:string}>} createUserKey
 *   1Panel: 门户自生成明文传 opts.apiKey；AI-Gateway: opts.apiKey 被忽略，
 *   网关生成并「仅此一次」返回明文 —— 调用方必须落库（portal_api_keys.api_key_cipher）。
 * @property {(userId:number, keyId:number) => Promise<void>} deleteUserKey
 * @property {(keyId:number) => Promise<{apiKey:string}>} revealKey
 *   可选：1Panel 支持反查明文；AI-Gateway 不支持（明文只在 createUserKey 返回一次），
 *   实现 throw err.code='not_supported'，调用方回退读本地 api_key_cipher。
 *
 * // ---- 统计域（V2: 数据统计页数据源，按 provider 分支）----
 * @property {({from?:string, to?:string, userId?:number}) => Promise<Object>} getUsageStatistics
 *   1Panel: POST ai-proxy/usage/statistics（由调用方透传，不走本方法也可）；
 *   AI-Gateway: GET /admin/usage-statistics，返回 { range, summary, users[], userGroups[],
 *   models[], modelGroups[], upstreamAccounts[], providers[] }——所有计数为十进制字符串，
 *   summary 形如 { requestCount, inputTokens, outputTokens, totalTokens, cachedTokens,
 *   knownTokenRequestCount, missingTokenRequestCount }，分布项额外含 { id, key, name, deleted }，
 *   每个分布最多 top 20 条。注意：网关无失败请求维度、无按天 trends 分桶。
 * @property {({range?:'24h'|'7d'|'30d', timezoneOffsetMinutes?:number}) => Promise<Object>} getTokenTrend
 *   可选（仅 AI-Gateway）：GET /admin/overview/token-trend，滚动窗口趋势（不能指定 from/to），
 *   返回 { range, granularity, from, to, buckets:[{start, inputTokens, outputTokens,
 *   totalTokens, cachedTokens}] }，最长仅最近 30 天 —— 门户趋势图的数据源，调用方需向
 *   前端说明「趋势不随月份筛选变化」。
 */

module.exports = {};
