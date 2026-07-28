// server/lib/resource-types.js
// 资源类型注册机制 + model/skill/mcp 三适配器
// 加新类型 = INSERT resource_types + registerResourceType, 不动核心循环

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

// ---- mcp 适配器（从本地 portal_mcps 表读，同步调度器定期刷新）----
registerResourceType('mcp', {
  name: 'MCP',
  async listAll() {
    const r = await global.pool.query(
      'SELECT id, panel_mcp_id, name, type FROM portal_mcps WHERE is_active ORDER BY name'
    );
    return r.rows;
  },
  async isVisibleToUser(_userId, ids) {
    // mcp 不取交集
    return ids;
  },
});

module.exports = { registerResourceType, getResourceType, getAllResourceTypes };
