/**
 * GatewayAdapter —— 1Panel 实现（V2 骨架）
 *
 * 定位：把 portal 现有散落在 panel.js / portal.js / admin.js 里的
 * 1Panel「模型 / 用户组 / 用户 / API Key」调用收敛到适配器接口。
 * skill / MCP 域不属于本适配器（永远直连 1Panel，见 contract.js 头注释）。
 *
 * 原则：
 *   - 复用 server/panel.js 已导出的函数（findPanelUser / createPanelUser /
 *     parseModelMap / getPanelItems / getPanelPayload），不复制逻辑；
 *   - 配置（PANEL_BASE_URL / PANEL_API_KEY）沿用 1panel-api 的 DB 热重载机制，
 *     init/reload 直接委托，保证 V2 切换前行为与现状完全一致；
 *   - 1Panel 用户与用户组无直接归属（组挂在 Key 上），GatewayUserRow.groupId 恒 null。
 */

'use strict';

const {
  panel, getPanelItems, getPanelPayload, parseModelMap, findPanelUser, createPanelUser,
} = require('../../../panel');
const { inspectPanelBiz, listPanelKeysOfUser } = require('../../panel-biz');

const PAGE_SIZE = 100;

function err(provider, message, status, code) {
  const e = new Error(message);
  e.provider = provider;
  if (status !== undefined) e.status = status;
  if (code !== undefined) e.code = code;
  return e;
}

/** 1Panel 分页 search 通用封装：翻全量 + 业务码校验（黑名单语义，code>=400 失败） */
async function searchAll(path, body = {}) {
  const out = [];
  let page = 1;
  while (page < 50) {
    const res = await panel.post(path, { page, pageSize: PAGE_SIZE, ...body });
    if (res.status < 200 || res.status >= 300) {
      throw err('1panel', `1Panel ${path} HTTP ${res.status}`, res.status);
    }
    const biz = inspectPanelBiz(res);
    if (!biz.ok) {
      throw err('1panel', `1Panel ${path} 业务错误 code=${biz.code}: ${biz.message}`, res.status, String(biz.code));
    }
    const items = getPanelItems(res.data);
    out.push(...items);
    if (items.length < PAGE_SIZE) break;
    page++;
  }
  return out;
}

/** modelGroupIds / models 这类字段可能是数组或 JSON 字符串，统一成数组（保持元素原类型） */
function toArrayish(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string' || !v.trim()) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// 与 routes/portal.js 的 maskApiKey 保持一致（V2 时可抽到共享 lib）
function maskApiKey(key) {
  if (!key || key.length <= 8) return key || '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

// ============ 模型域 ============

/** 1Panel backends → ModelRow[]（V2 中替代 _syncModelsFromPanel 的拉取+解析段） */
async function listModels() {
  const backends = await searchAll('/api/v2/core/enterprise/ai-proxy/backends/search', { info: '' });
  const rows = [];
  for (const backend of backends) {
    const groupName = backend.accountName || backend.provider || `Backend ${backend.id}`;
    let modelNames = [];
    try {
      modelNames = parseModelMap(backend.modelMap);
    } catch (e) {
      // 单个 backend 解析失败跳过，不拖垮整轮同步（与现有 _syncModelsFromPanel 行为一致）
      console.error(`[gateway:1panel] backend ${backend.id} modelMap 解析失败:`, e.message);
      continue;
    }
    for (const modelName of modelNames) {
      rows.push({
        accountId: backend.id ?? null,
        groupName,
        modelName,
        provider: backend.provider || '',
        baseUrl: backend.baseUrl || '',
        modelType: backend.apiType || '',
        enabled: backend.enabled !== false,
        raw: backend,
      });
    }
  }
  return rows;
}

// ============ 授权域（只读） ============

async function listUserGroups() {
  const items = await searchAll('/api/v2/core/enterprise/ai-proxy/groups/search');
  return items.map(g => ({
    groupId: g.id,
    name: g.name,
    enabled: true,                                   // 1Panel 用户组无 enabled 概念
    isDefault: false,
    modelGroupIds: toArrayish(g.modelGroupIds),
    maxConcurrency: g.qpsLimit || 0,
    apiKeyMaxConcurrency: g.tokenLimit || 0,
    tokenPlanId: null,
    raw: g,
  }));
}

async function listModelGroups() {
  const items = await searchAll('/api/v2/core/enterprise/ai-proxy/model-groups/search');
  return items.map(g => ({
    groupId: g.id,
    name: g.name,
    protocolType: null,                              // 1Panel 模型组无协议维度
    models: toArrayish(g.models).map(String),
    raw: g,
  }));
}

async function listUsers() {
  const items = await searchAll('/api/v2/core/enterprise/users/search', { info: '' });
  return items.map(u => ({
    userId: u.id,
    username: u.name || u.username || '',
    enabled: true,                                   // 1Panel 用户状态字段版本差异大，V2 接入时按 raw 判定
    groupId: null,                                   // 1Panel 用户不直接归属组（组挂在 Key 上）
    raw: u,
  }));
}

// ============ 用户域 ============

/** 归一化：1Panel 用户对象 → GatewayUserRow */
async function findUser(username) {
  const u = await findPanelUser(username);
  if (!u) return null;
  return {
    userId: u.id,
    username: u.name || u.username || '',
    enabled: true,
    groupId: null,                                   // 1Panel 用户不直接归属组
    raw: u,
  };
}

async function createUser({ username, password, name }) {
  const payload = await createPanelUser({ username, password, name });
  const userId = payload?.id ?? null;
  if (!userId) {
    // create 可能返回 data:null（既有行为），由调用方走 findUser 兜底（oauth.js 既有范式）
    return { userId: null };
  }
  return { userId };
}

async function deleteUser(userId) {
  const res = await panel.post('/api/v2/core/enterprise/users/del', { ids: [userId] });
  if (res.status < 200 || res.status >= 300) {
    throw err('1panel', `1Panel 用户删除失败 HTTP ${res.status}`, res.status);
  }
  const biz = inspectPanelBiz(res);
  if (!biz.ok) {
    throw err('1panel', `1Panel 用户删除业务失败 code=${biz.code}: ${biz.message}`, res.status, String(biz.code));
  }
}

function notSupported(op) {
  return err('1panel', `1Panel 适配器不支持 ${op}（现有门户未对该能力代操作，V2 如需接入请先确认 1Panel 端点）`, undefined, 'not_supported');
}

async function enableUser() { throw notSupported('enableUser'); }
async function disableUser() { throw notSupported('disableUser'); }

// ============ Key 域 ============

async function listKeysOfUser(userId) {
  const keys = await listPanelKeysOfUser(userId);
  return keys.map(k => ({
    keyId: k.id,
    name: k.remark || '',
    mask: k.apiKeyMask || '',
    enabled: (k.status || 'Enable') === 'Enable',
    raw: k,
  }));
}

/**
 * 1Panel 的 Key 由门户自生成明文后推送（与 portal.js 现状一致）。
 * opts.apiKey 必传；groupId 固定 1（Default 组，现状语义）。
 */
async function createUserKey(userId, { name, apiKey } = {}) {
  if (!apiKey) {
    throw err('1panel', '1Panel 创建 Key 需要门户自生成明文 apiKey（与现有 portal.js 行为一致）', undefined, 'invalid_request');
  }
  const res = await panel.post('/api/v2/core/enterprise/ai-proxy/api-keys/create', {
    userId,
    groupId: 1,
    apiKey,
    apiKeyMask: maskApiKey(apiKey),
    status: 'Enable',
    remark: String(name || '').slice(0, 200),
    tokenLimit: 0,
  });
  if (res.status < 200 || res.status >= 300) {
    throw err('1panel', `1Panel 创建 Key 失败 HTTP ${res.status}`, res.status);
  }
  const biz = inspectPanelBiz(res);
  if (!biz.ok) {
    throw err('1panel', `1Panel 创建 Key 业务失败 code=${biz.code}: ${biz.message}`, res.status, String(biz.code));
  }
  const payload = getPanelPayload(res.data) || {};
  // data:null 时由调用方翻 listKeysOfUser 兜底拿 keyId（portal.js 既有范式）
  return { keyId: payload.id ?? null, apiKey: payload.apiKey || apiKey };
}

async function deleteUserKey(userId, keyId) {
  const res = await panel.post('/api/v2/core/enterprise/ai-proxy/api-keys/delete', { id: keyId });
  if (res.status < 200 || res.status >= 300) {
    throw err('1panel', `1Panel 删除 Key 失败 HTTP ${res.status}`, res.status);
  }
  const biz = inspectPanelBiz(res);
  if (!biz.ok) {
    throw err('1panel', `1Panel 删除 Key 业务失败 code=${biz.code}: ${biz.message}`, res.status, String(biz.code));
  }
}

async function revealKey(keyId) {
  const res = await panel.post('/api/v2/core/enterprise/ai-proxy/api-keys/reveal', { id: keyId });
  if (res.status < 200 || res.status >= 300) {
    throw err('1panel', `1Panel reveal 失败 HTTP ${res.status}`, res.status);
  }
  const biz = inspectPanelBiz(res);
  if (!biz.ok) {
    throw err('1panel', `1Panel reveal 业务失败 code=${biz.code}: ${biz.message}`, res.status, String(biz.code));
  }
  const payload = getPanelPayload(res.data) || {};
  if (!payload.apiKey) {
    throw err('1panel', '1Panel reveal 未返回 apiKey', res.status, 'reveal_empty');
  }
  return { apiKey: payload.apiKey };
}

// ============ 元信息 / 连接校验 ============

async function verifyConnection(opts = {}) {
  // opts: { baseUrl, apiKey, timeout } —— 「测试连接」用表单未保存值临时覆盖（1panel-api request 原生支持 options）
  const reqOpts = {};
  if (opts.baseUrl) reqOpts.baseUrl = opts.baseUrl;
  if (opts.apiKey) reqOpts.apiKey = opts.apiKey;
  if (opts.timeout) reqOpts.timeout = opts.timeout;
  const res = await panel.post('/api/v2/core/enterprise/users/search', { page: 1, pageSize: 1, info: '' }, reqOpts);
  if (res.status < 200 || res.status >= 300) {
    throw err('1panel', `1Panel 不可达 HTTP ${res.status}`, res.status);
  }
  const biz = inspectPanelBiz(res);
  if (!biz.ok) {
    throw err('1panel', `1Panel 凭证校验失败 code=${biz.code}: ${biz.message}`, res.status, String(biz.code));
  }
  return { ok: true };
}

module.exports = {
  name: '1panel',
  // 配置沿用 1panel-api 的 init/reload（DB panel_* 键热重载，admin 保存后自动触发）
  init: (pool) => panel.init(pool),
  reload: (pool) => panel.reload(pool),
  getConfig: () => panel.getConfig(),

  listModels,
  listUserGroups,
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
};
