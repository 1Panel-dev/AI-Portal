// server/lib/permission.js
// 权限查询 + 资源可见性纯函数。零 HTTP 依赖, 可单测。
//
// 注意: 与 resource-types.js 存在循环依赖 -- resource-types.js 的 model 适配器
// 调本文件的 getPortalUser/getUserAllowedModels, 本文件调 resource-types.js 的
// getResourceType/getAllResourceTypes。为打破循环, 这里对 resource-types.js
// 采用「延迟 require」(在函数内部 require), 文件顶部不 require resource-types.js。

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
 * 取某用户可见模型（本地三层 JOIN: key.group_id -> user_group.model_group_ids -> model_group.models）。
 * @param panelUserId - portal_users.panel_user_id（1Panel 用户 id）, 非主键 id
 * @returns string[] | null - null 表示全公开兜底（任一层空, 存量兼容关键）
 *
 * 三层 JOIN 任一层空返 null: 现有 155 个 key group_id=1(Default 组无模型组) -> 第二层空 -> null -> 全公开。
 */
async function getUserAllowedModels(panelUserId) {
  // 1. 该用户所有 key 的 group_id
  const keys = await pool().query(
    'SELECT DISTINCT group_id FROM portal_api_keys WHERE panel_user_id = $1 AND group_id IS NOT NULL',
    [panelUserId]
  );
  if (!keys.rowCount) return null;  // 无 key -> null（上层全公开兜底）
  const groupIds = keys.rows.map(r => r.group_id);

  // 2. 这些用户组的 model_group_ids
  const groups = await pool().query(
    'SELECT model_group_ids FROM panel_user_groups WHERE panel_group_id = ANY($1) AND is_active = TRUE',
    [groupIds]
  );
  const mgIds = new Set();
  for (const g of groups.rows) {
    for (const id of (g.model_group_ids || [])) mgIds.add(id);
  }
  if (!mgIds.size) return null;  // 用户组没配模型组 -> null（上层全公开兜底）

  // 3. 这些模型组的 models
  const mgs = await pool().query(
    'SELECT models FROM panel_model_groups WHERE panel_group_id = ANY($1) AND is_active = TRUE',
    [Array.from(mgIds)]
  );
  const models = new Set();
  for (const mg of mgs.rows) {
    for (const m of (mg.models || [])) models.add(m);
  }
  return models.size ? Array.from(models) : null;  // 空 -> null（全公开兜底）
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
 * 兜底链: 用户不存在/超管 -> 全量; 未被任何资源组授权 -> 全公开; 某类型未配资源组 -> 该类型全公开。
 * shape 一致性: 返回全类型 key, 未授权类型返全量（与兜底语义一致, 不缺 key）。
 * 延迟 require resource-types.js 打破循环依赖。
 */
async function getVisibleResourcesForUser(userId) {
  const { getAllResourceTypes, getResourceType } = require('./resource-types');
  const portalUser = await getPortalUser(userId);
  if (!portalUser || portalUser.is_portal_admin) return getAllResources();

  const items = await pool().query(`
    SELECT resource_type, resource_id FROM resource_group_items
    WHERE group_id IN (SELECT group_id FROM resource_group_members WHERE user_id = $1)
  `, [userId]);

  if (items.rowCount === 0) return getAllResources();

  const byType = {};
  for (const r of items.rows) (byType[r.resource_type] ??= []).push(r.resource_id);

  const result = {};
  for (const type of getAllResourceTypes()) {
    const ids = byType[type.key];
    const adapter = getResourceType(type.key);
    if (!ids || !ids.length) {
      // 该类型未配资源组 = 全公开
      result[type.key] = adapter?.listAll ? await adapter.listAll() : [];
    } else if (adapter?.isVisibleToUser) {
      result[type.key] = await adapter.isVisibleToUser(userId, ids);
    }
  }
  return result;
}

module.exports = {
  getPortalUser, getUserPermissions, hasPermission,
  getVisibleResourcesForUser, getAllResources, getUserAllowedModels,
};
