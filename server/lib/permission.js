// server/lib/permission.js
// 权限查询 + 资源可见性纯函数。零 HTTP 依赖, 可单测。
//
// 注意: 与 resource-types.js 存在循环依赖 -- resource-types.js 的 model 适配器
// 调本文件的 getPortalUser/getUserAllowedModels, 本文件调 resource-types.js 的
// getResourceType/getAllResourceTypes。为打破循环, 这里对 resource-types.js
// 采用「延迟 require」(在函数内部 require), 文件顶部不 require resource-types.js。
const { listAllPanelKeys } = require('./panel-biz');

const pool = () => global.pool;

/** 取 portal_users 行（含 is_portal_admin / panel_user_id） */
async function getPortalUser(userId) {
  const r = await pool().query(
    'SELECT id, panel_user_id, username, name, role, status, is_portal_admin FROM portal_users WHERE id = $1',
    [userId]
  );
  return r.rowCount ? r.rows[0] : null;
}

/** 用户权限原子列表 + is_portal_admin + 角色名 */
async function getUserPermissions(userId) {
  const user = await getPortalUser(userId);
  if (!user) return { permissions: [], is_portal_admin: false, roles: [] };
  if (user.is_portal_admin) {
    const all = await pool().query('SELECT key FROM permissions');
    return { permissions: all.rows.map(r => r.key), is_portal_admin: true, roles: ['admin'] };
  }
  const r = await pool().query(`
    SELECT DISTINCT p.key FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    JOIN user_roles ur ON ur.role_id = rp.role_id
    WHERE ur.user_id = $1
  `, [userId]);
  const roles = await pool().query(`
    SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1
  `, [userId]);
  return {
    permissions: r.rows.map(row => row.key),
    is_portal_admin: false,
    roles: roles.rows.map(row => row.name),
  };
}

/** 单权限检查 */
async function hasPermission(userId, permissionKey) {
  const { permissions, is_portal_admin } = await getUserPermissions(userId);
  return is_portal_admin || permissions.includes(permissionKey);
}

/**
 * 取某用户 1Panel key 的 allowedModels（模型可见性上限）。
 * @param panelUserId - portal_users.panel_user_id（1Panel 用户 id）, 非主键 id
 * 复用 listAllPanelKeys 一次翻页, 内存按 userId 过滤, 避免重复 1Panel 请求。
 */
async function getUserAllowedModels(panelUserId) {
  const allKeys = await listAllPanelKeys();
  const userKeys = allKeys.filter(k => k.userId === panelUserId);
  if (!userKeys.length) return null;
  const allowed = new Set();
  for (const k of userKeys) {
    const am = k.allowedModels;
    if (Array.isArray(am)) am.forEach(m => allowed.add(m));
  }
  return [...allowed];
}

/**
 * 全量资源（调每个注册适配器 listAll, 合并）。
 * 延迟 require resource-types.js 打破循环依赖。
 */
async function getAllResources() {
  const { getAllResourceTypes, getResourceType } = require('./resource-types');
  const result = {};
  for (const type of getAllResourceTypes()) {
    const adapter = getResourceType(type.key);
    if (adapter?.listAll) result[type.key] = await adapter.listAll();
  }
  return result;
}

/**
 * 用户可见资源（资源组勾选, 模型再取交集）。
 * 兜底: 用户未被任何资源组授权 -> 全公开（getAllResources）。
 * is_portal_admin -> 全量。
 * 延迟 require resource-types.js 打破循环依赖。
 */
async function getVisibleResourcesForUser(userId) {
  const { getResourceType } = require('./resource-types');
  const portalUser = await getPortalUser(userId);
  if (!portalUser) return getAllResources();
  if (portalUser.is_portal_admin) return getAllResources();

  const items = await pool().query(`
    SELECT resource_type, resource_id FROM resource_group_items
    WHERE group_id IN (SELECT group_id FROM resource_group_members WHERE user_id = $1)
  `, [userId]);

  if (items.rowCount === 0) return getAllResources();

  const byType = {};
  for (const r of items.rows) (byType[r.resource_type] ??= []).push(r.resource_id);

  const result = {};
  for (const [type, ids] of Object.entries(byType)) {
    const adapter = getResourceType(type);
    if (adapter?.isVisibleToUser) result[type] = await adapter.isVisibleToUser(userId, ids);
  }
  return result;
}

module.exports = {
  getPortalUser, getUserPermissions, hasPermission,
  getVisibleResourcesForUser, getAllResources, getUserAllowedModels,
};
