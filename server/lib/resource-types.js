// server/lib/resource-types.js
// 资源类型注册机制 + model/skill/mcp 三适配器
// 加新类型 = INSERT resource_types + registerResourceType, 不动核心循环
const { panel, getPanelItems } = require('../panel');
const { inspectPanelBiz } = require('./panel-biz');

const registry = new Map();

function registerResourceType(key, adapter) { registry.set(key, adapter); }
function getResourceType(key) { return registry.get(key) || null; }
function getAllResourceTypes() {
  // 同步函数无法 await DB; 返回已注册适配器的 key 列表（启动时已注册 model/skill/mcp）。
  // 资源类型表 resource_types 的种子与注册一一对应, 故以 registry 为准。
  return [...registry.keys()].map(k => ({ key: k, name: registry.get(k)?.name || k }));
}

// ---- model 适配器 ----
registerResourceType('model', {
  name: '模型',
  async listAll() {
    const r = await global.pool.query(
      'SELECT model_name, group_name, provider FROM portal_models WHERE is_active ORDER BY group_name, model_name'
    );
    return r.rows;
  },
  async isVisibleToUser(userId, modelNames) {
    // 延迟 require 打破循环
    const { getPortalUser, getUserAllowedModels } = require('./permission');
    const portalUser = await getPortalUser(userId);
    if (!portalUser) return [];
    if (portalUser.is_portal_admin) {
      const all = await this.listAll();
      return all.map(m => m.model_name);
    }
    const allowed = await getUserAllowedModels(portalUser.panel_user_id);
    if (!allowed) return [];
    const allowedSet = new Set(allowed);
    return modelNames.filter(m => allowedSet.has(m));
  },
});

// ---- skill 适配器 ----
registerResourceType('skill', {
  name: 'Skill',
  async listAll() {
    const r = await global.pool.query('SELECT slug, title FROM skills WHERE is_active ORDER BY slug');
    return r.rows;
  },
  async isVisibleToUser(_userId, ids) {
    // skill 不取交集, 资源组勾选即对成员可见
    return ids;
  },
});

// ---- mcp 适配器 ----
registerResourceType('mcp', {
  name: 'MCP',
  async listAll() {
    // MCP 无本地表, 实时调 1Panel mcp search 翻全页
    const PAGE_SIZE = 100;
    const out = [];
    let page = 1;
    while (page <= 50) {
      const res = await panel.post('/api/v2/ai/mcp/search', { page, pageSize: PAGE_SIZE, name: '' });
      if (res.status < 200 || res.status >= 300) throw new Error(`1Panel mcp/search HTTP ${res.status}`);
      const biz = inspectPanelBiz(res);
      if (!biz.ok) throw new Error(`1Panel mcp/search 业务错误: ${biz.message}`);
      const items = getPanelItems(res.data);
      out.push(...items);
      if (items.length < PAGE_SIZE) break;
      page++;
    }
    return out;
  },
  async isVisibleToUser(_userId, ids) {
    // mcp 不取交集
    return ids;
  },
});

module.exports = { registerResourceType, getResourceType, getAllResourceTypes };
