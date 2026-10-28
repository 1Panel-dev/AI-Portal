/**
 * GatewayAdapter —— AI-Gateway（独立网关）实现（V2 骨架）
 *
 * 对接契约：AI-Gateway 仓库 internal/openapidoc/openapi.yaml（Management API v1）。
 *   - 前缀 /api/v1/admin/*，认证 Bearer agw_at_...（网关「系统设置→Open API」签发，
 *     acts as owner administrator；凭证有有效期，默认 90 天 / 最长 365 天，需轮换）；
 *   - 网关用标准 HTTP 状态码表达错误，body = { code, message }（稳定业务码，
 *     如 username_conflict / user_limit_reached / api_key_limit_reached / busy），
 *     没有 1Panel 那种「HTTP 200 + body.code」模式；
 *   - 503 busy = 管理面容量临时耗尽，调用方退避重试（同步调度器已有该语义）；
 *   - Key 明文只在 createUserKey 响应中出现一次，调用方必须落库。
 *
 * 与 1Panel 的关键语义差异（见 contract.js）：
 *   - 用户直接归属唯一用户组（CreateUserRequest.userGroupId 必填），
 *     Key 继承用户授权 → GatewayUserRow.groupId 恒有值（无组用户为 null）；
 *   - Key 由网关生成，门户不能再自造明文推送（createUserKey 忽略 opts.apiKey）；
 *   - 无 revealKey（明文一次性），调用方回退读本地 api_key_cipher。
 */

'use strict';

const crypto = require('crypto');
const https = require('https');
const http = require('http');

// ============ 配置（运行时可变，镜像 1panel-api 的模式） ============

let currentConfig = {
  baseUrl: process.env.GATEWAY_BASE_URL || '',
  apiKey: process.env.GATEWAY_API_KEY || '',
  defaultUserGroupId: parseInt(process.env.GATEWAY_DEFAULT_USER_GROUP_ID || '0', 10) || null,
  timeout: parseInt(process.env.GATEWAY_API_TIMEOUT || '10000', 10),
};

const changeListeners = new Set();

function onConfigChange(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

async function loadConfig(pool) {
  try {
    const result = await pool.query("SELECT key, value FROM system_config WHERE key LIKE 'gateway_%'");
    const map = {};
    for (const row of result.rows) map[row.key] = row.value;
    if (map.gateway_base_url) currentConfig.baseUrl = map.gateway_base_url;
    if (map.gateway_api_key) currentConfig.apiKey = map.gateway_api_key;
    if (map.gateway_default_user_group_id) {
      const id = parseInt(map.gateway_default_user_group_id, 10);
      currentConfig.defaultUserGroupId = Number.isFinite(id) && id > 0 ? id : null;
    }
    if (map.gateway_api_timeout) {
      const t = parseInt(map.gateway_api_timeout, 10);
      if (!Number.isNaN(t) && t > 0) currentConfig.timeout = t;
    }
  } catch {
    // 表可能不存在（首次启动迁移之前），忽略
  }
}

async function init(pool) { await loadConfig(pool); }

async function reload(pool) {
  await loadConfig(pool);
  for (const fn of changeListeners) {
    try { fn(); } catch (e) { console.error('[ai-gateway] 配置变更回调异常:', e.message); }
  }
}

function getConfig() {
  const key = currentConfig.apiKey;
  return {
    baseUrl: currentConfig.baseUrl,
    apiKey: key ? (key.length > 8 ? key.slice(0, 8) + '****' : '****') : '',
    apiKeyConfigured: !!key,
    defaultUserGroupId: currentConfig.defaultUserGroupId,
    timeout: currentConfig.timeout,
  };
}

// ============ HTTP ============

function err(message, status, code) {
  const e = new Error(message);
  e.provider = 'ai-gateway';
  if (status !== undefined) e.status = status;
  if (code !== undefined) e.code = code;
  return e;
}

function logCall(method, path, status, ms) {
  const ok = status >= 200 && status < 300;
  (ok ? console.log : console.error)(
    `[gateway-call] ${method} ${path} → ${ok ? '✅' : '❌'} HTTP=${status} ${ms}ms`
  );
}

/**
 * Management API 统一请求。path 形如 '/admin/users'（自动拼 /api/v1 前缀）。
 * AI-Gateway 用标准 HTTP 状态码，>=400 即失败并携带稳定业务码。
 * override: { baseUrl, apiKey, timeout } —— 「测试连接」用表单未保存值临时覆盖（不落库）。
 */
function request(method, path, { query, body, override = {} } = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const baseUrl = override.baseUrl || currentConfig.baseUrl;
    const apiKey = override.apiKey || currentConfig.apiKey;
    const timeout = override.timeout || currentConfig.timeout;
    if (!apiKey) {
      return reject(err('请配置 GATEWAY_API_KEY（管理后台 → 系统配置 → 独立网关）', undefined, 'config_missing'));
    }
    if (!baseUrl) {
      return reject(err('请配置 GATEWAY_BASE_URL（管理后台 → 系统配置 → 独立网关）', undefined, 'config_missing'));
    }
    let url;
    try {
      url = new URL(baseUrl.replace(/\/+$/, '') + '/api/v1' + path);
      if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
    } catch (e) {
      return reject(err(`GATEWAY_BASE_URL 无效: ${e.message}`, undefined, 'config_invalid'));
    }
    const bodyBuffer = body !== undefined ? Buffer.from(JSON.stringify(body), 'utf-8') : null;
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          ...(bodyBuffer ? { 'Content-Type': 'application/json', 'Content-Length': bodyBuffer.length } : {}),
        },
        timeout,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const ms = Date.now() - startedAt;
          logCall(method, path, res.statusCode, ms);
          const raw = Buffer.concat(chunks).toString('utf-8');
          let data = null;
          try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const code = data && typeof data === 'object' ? data.code : undefined;
            const message = data && typeof data === 'object' ? (data.message || '') : String(raw).slice(0, 200);
            return reject(err(`AI-Gateway ${method} ${path} 失败 HTTP ${res.statusCode}${message ? `: ${message}` : ''}`, res.statusCode, code));
          }
          resolve(data);
        });
      }
    );
    req.on('error', (e) => reject(err(`AI-Gateway 请求失败: ${e.message}`, undefined, 'unreachable')));
    req.on('timeout', () => { req.destroy(); reject(err(`AI-Gateway 请求超时 (${currentConfig.timeout}ms): ${method} ${path}`, undefined, 'timeout')); });
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

/** 分页拉全量（AI-Gateway Page 形状：{ items, total, page, pageSize }，pageSize 上限 100） */
async function listAll(path, query = {}) {
  const out = [];
  let page = 1;
  while (page <= 200) {
    const data = await request('GET', path, { query: { ...query, page, pageSize: 100 } });
    const items = Array.isArray(data?.items) ? data.items : [];
    out.push(...items);
    if (items.length < 100) break;
    page++;
  }
  return out;
}

// ============ 模型域 ============

/** 上游账号 → ModelRow[]（V2 中 portal_models 的数据源；无 1Panel modelMap 脏数据问题） */
async function listModels() {
  const accounts = await listAll('/admin/upstream-accounts');
  const rows = [];
  for (const account of accounts) {
    const groupName = account.name || account.provider || `Account ${account.id}`;
    for (const m of (account.models || [])) {
      if (!m?.requestModelName) continue;
      rows.push({
        accountId: account.id ?? null,
        groupName,
        modelName: m.requestModelName,
        provider: account.provider || '',
        baseUrl: account.serviceBaseURL || '',
        modelType: account.protocolType || '',
        enabled: account.enabled !== false,
        raw: account,
      });
    }
  }
  return rows;
}

/**
 * 用户域 OpenAI 兼容接口:GET {baseUrl}/v1/models
 * 与管理域 request() 不同:无 /api/v1 前缀,凭证是用户级 API Key(sk-...),admin token 会被 401。
 * 返回 "该 Key 授权可见" 的模型数组(OpenAI 形状:{id, object, created, owned_by?})。
 */
function listModelsViaUserKey(userApiKey) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const baseUrl = currentConfig.baseUrl;
    const timeout = currentConfig.timeout;
    if (!baseUrl) {
      return reject(err('请配置 GATEWAY_BASE_URL（管理后台 → 系统配置 → 独立网关）', undefined, 'config_missing'));
    }
    let url;
    try {
      url = new URL(baseUrl.replace(/\/+$/, '') + '/v1/models');
    } catch (e) {
      return reject(err(`GATEWAY_BASE_URL 无效: ${e.message}`, undefined, 'config_invalid'));
    }
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      { method: 'GET', headers: { Authorization: `Bearer ${userApiKey}`, Accept: 'application/json' }, timeout },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const ms = Date.now() - startedAt;
          logCall('GET', '/v1/models(user-key)', res.statusCode, ms);
          const raw = Buffer.concat(chunks).toString('utf-8');
          let data = null;
          try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const message = data && typeof data === 'object'
              ? ((data.error && data.error.message) || data.message || '')
              : String(raw).slice(0, 200);
            return reject(err(`AI-Gateway GET /v1/models 失败 HTTP ${res.statusCode}${message ? `: ${message}` : ''}`, res.statusCode));
          }
          resolve(Array.isArray(data?.data) ? data.data : []);
        });
      }
    );
    req.on('error', (e) => reject(err(`AI-Gateway 请求失败: ${e.message}`, undefined, 'unreachable')));
    req.on('timeout', () => { req.destroy(); reject(err('AI-Gateway 请求超时: GET /v1/models', undefined, 'timeout')); });
    req.end();
  });
}

// ============ 授权域（只读） ============

/** UserGroupDetail.modelGroups[] 是对象数组（{id,name,protocolType,modelCount}），取 id 列表 */
async function listUserGroups() {
  const items = await listAll('/admin/user-groups');
  return items.map(g => ({
    groupId: g.id,
    name: g.name,
    enabled: g.enabled !== false,
    isDefault: !!g.isDefault,
    modelGroupIds: (g.modelGroups || []).map(mg => mg.id).filter(id => Number.isFinite(id)),
    maxConcurrency: g.maxConcurrency || 0,
    apiKeyMaxConcurrency: g.apiKeyMaxConcurrency || 0,
    tokenPlanId: g.tokenPlanId ?? null,
    raw: g,
  }));
}

async function listModelGroups() {
  const items = await listAll('/admin/model-groups');
  return items.map(g => ({
    groupId: g.id,
    name: g.name,
    protocolType: g.protocolType || null,
    models: (g.models || []).map(String),
    raw: g,
  }));
}

/**
 * 用户组下拉选项（配置页「默认用户组」选择用）。
 * 网关 GET /admin/user-groups/options：最多 1000 条，含 enabled/isDefault 标记。
 * opts: { baseUrl, apiKey, timeout } 表单值覆盖（未保存先拉）。
 */
async function listUserGroupOptions(opts = {}) {
  const data = await request('GET', '/admin/user-groups/options', {
    query: {},
    override: opts,
  });
  return (data?.items || []).map(g => ({
    id: g.id,
    name: g.name || `Group ${g.id}`,
    enabled: g.enabled !== false,
    isDefault: !!g.isDefault,
  }));
}

async function listUsers() {
  const items = await listAll('/admin/users');
  return items.map(u => ({
    userId: u.id,
    username: u.username || '',
    enabled: u.enabled !== false,
    groupId: u.userGroup?.id ?? null,   // 用户直接归属唯一用户组（与 1Panel 的本质差异）
    raw: u,
  }));
}

// ============ 用户域 ============

/**
 * 网关 username 强校验：^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$（CreateUserRequest）。
 * 门户侧（企微注册等）生成 username 前必须过这里，非法字符替换 + 截断。
 */
function normalizeUsername(raw) {
  let s = String(raw || '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, 63);
  if (!/^[A-Za-z0-9]/.test(s)) s = 'u' + s;
  while (s.length < 3) s += '0';
  return s;
}

async function findUser(username) {
  const items = await request('GET', '/admin/users', {
    query: { keyword: String(username || '').slice(0, 64), pageSize: 100 },
  });
  const found = (items?.items || []).find(u => u.username === String(username));
  if (!found) return null;
  return {
    userId: found.id,
    username: found.username,
    enabled: found.enabled !== false,
    groupId: found.userGroup?.id ?? null,
    raw: found,
  };
}

async function createUser({ username, password, name }) {
  if (!currentConfig.defaultUserGroupId) {
    throw err('未配置 gateway_default_user_group_id，无法代建网关用户（AI-Gateway 创建用户必须指定用户组）', undefined, 'config_missing');
  }
  const data = await request('POST', '/admin/users', {
    body: {
      username,
      password,
      userGroupId: currentConfig.defaultUserGroupId,
      note: `通过AI门户创建：${name || username}`,
    },
  });
  // 201 → UserView。极端情况下响应缺 id 时由调用方 findUser 兜底。
  return { userId: data?.id ?? null, groupId: currentConfig.defaultUserGroupId ?? null };
}

async function setUserEnabled(userId, enabled) {
  await request('POST', `/admin/users/${userId}/${enabled ? 'enable' : 'disable'}`);
}

async function enableUser(userId) { await setUserEnabled(userId, true); }
async function disableUser(userId) { await setUserEnabled(userId, false); }   // 网关会同时吊销其会话

async function deleteUser(userId) {
  await request('DELETE', `/admin/users/${userId}`);
}

// ============ Key 域 ============

async function listKeysOfUser(userId) {
  const data = await request('GET', `/admin/users/${userId}/api-keys`, { query: { pageSize: 100 } });
  return (data?.items || []).map(k => ({
    keyId: k.id,
    name: k.name || '',
    mask: k.mask || '',
    enabled: k.enabled !== false,
    raw: k,
  }));
}

/**
 * AI-Gateway 的 Key 由网关生成，明文 apiKey 「仅此一次」返回 —— 调用方必须落库。
 * opts.apiKey 被忽略（与 1Panel 的「门户自造明文」模式相反，见契约）。
 * 409 api_key_limit_reached → err.code 原样抛出，门户入口做差异化提示。
 */
async function createUserKey(userId, { name } = {}) {
  const data = await request('POST', `/admin/users/${userId}/api-keys`, {
    body: { name: String(name || 'portal-key').slice(0, 64) },
  });
  const keyId = data?.item?.id ?? null;
  const apiKey = data?.apiKey || '';
  if (!apiKey) {
    // 明文丢失不可恢复：契约要求「写操作结果未知时用 list 对账，绝不自动重试写」
    throw err('AI-Gateway 创建 Key 成功但未返回明文，请对该用户 listKeysOfUser 对账后删除重建', undefined, 'key_secret_missing');
  }
  return { keyId, apiKey };
}

async function deleteUserKey(userId, keyId) {
  await request('DELETE', `/admin/users/${userId}/api-keys/${keyId}`);
}

/** AI-Gateway 无 reveal（明文一次性）。调用方捕获 not_supported 后回退读本地 api_key_cipher。 */
async function revealKey() {
  throw err('AI-Gateway 不支持反查 Key 明文（仅在创建时返回一次）', undefined, 'not_supported');
}

// ============ 统计域 ============

/**
 * GET /admin/usage-statistics —— 汇总 + 六维分布（每维最多 top 20）。
 * 所有计数为十进制字符串；from/to 为 RFC3339，不传 = 网关默认范围（受 retentionDays 限制）。
 */
async function getUsageStatistics({ from, to, userId } = {}) {
  const query = {};
  if (from) query.from = from;
  if (to) query.to = to;
  if (userId) query.userId = userId;
  return request('GET', '/admin/usage-statistics', { query });
}

/**
 * GET /admin/overview/token-trend —— 滚动窗口趋势（24h|7d|30d，不能指定 from/to）。
 * timezoneOffsetMinutes 决定按天分桶的边界；北京时区传 480。
 */
async function getTokenTrend({ range = '30d', timezoneOffsetMinutes = 480 } = {}) {
  return request('GET', '/admin/overview/token-trend', {
    query: { range, timezoneOffsetMinutes },
  });
}

// ============ 元信息 / 连接校验 ============

async function verifyConnection(opts = {}) {
  // 最便宜的已授权端点：用户组第一页；opts 允许用表单未保存值测试
  await request('GET', '/admin/user-groups', { query: { pageSize: 1 }, override: opts });
  return { ok: true };
}

module.exports = {
  name: 'ai-gateway',
  init,
  reload,
  getConfig,
  onConfigChange,
  normalizeUsername,   // V2 用户创建链路（企微注册）使用

  listModels,
  listModelsViaUserKey,
  listUserGroups,
  listUserGroupOptions,
  listModelGroups,
  listUsers,
  findUser,
  createUser,
  enableUser,
  disableUser,
  deleteUser,
  listKeysOfUser,
  createUserKey,
  deleteUserKey,
  revealKey,
  verifyConnection,
  getUsageStatistics,
  getTokenTrend,
};
