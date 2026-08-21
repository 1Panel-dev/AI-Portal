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
 * 用户是否后台角色(持有任一 menu:admin-* 菜单权限)。
 * 后台角色用户是管理者, 不受资源组白名单限制(广场/资源看全量)。
 */
async function isAdminRoleUser(userId) {
  const r = await pool().query(`
    SELECT 1 FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    JOIN user_roles ur ON ur.role_id = rp.role_id
    WHERE ur.user_id = $1 AND p.key LIKE 'menu:admin-%'
    LIMIT 1
  `, [userId]);
  return r.rowCount > 0;
}

// 管理类权限位清单(与前端 usePermissions.js 的 ADMIN_PERMS 保持一致)——
// 用于判断登录后是否应直接进后台: 超管 / 后台角色(menu:admin-*) / 持有任一管理操作权限。
const ADMIN_PERMS = [
  'role:view','role:create','role:edit','role:delete',
  'group:view','group:create','group:edit','group:delete',
  'user:view','user:edit','user:create','user:delete','user:password','user:batch-password','user:assign',
  'skill:edit','skill:delete','skill:publish','skill:review','group:panel-sync','system:config',
  'tag:view','tag:create','tag:edit','tag:delete',
  'model:view','model:edit',
  'invocation_format:view','invocation_format:create','invocation_format:edit','invocation_format:delete',
];

/**
 * 用户是否有后台入口(等价前端 showAdminEntry): 超管 / 有 menu:admin-* / 有任一管理权限位。
 * 供登录接口返回, 让前端登录后一次跳到正确页面, 避免先落 /profile 再闪跳后台。
 */
async function hasAdminEntry(userId) {
  const { permissions, is_portal_admin } = await getUserPermissions(userId);
  if (is_portal_admin) return true;
  return permissions.some(k => k.startsWith('menu:admin-'))
    || ADMIN_PERMS.some(k => permissions.includes(k));
}

/**
 * 某用户能否访问某技能（下载/详情）。
 * 超管/后台角色 -> 放行; 普通用户 -> 必须其资源组勾选了该技能 slug。
 * 用于下载/详情接口, 防绕过广场列表白名单直接获取未授权技能。
 */
async function canUserAccessSkill(userId, slug) {
  const user = await getPortalUser(userId);
  if (!user) return false;
  if (user.is_portal_admin) return true;
  if (await isAdminRoleUser(userId)) return true;
  const r = await pool().query(`
    SELECT 1 FROM resource_group_items i
    JOIN resource_group_members m ON m.group_id = i.group_id
    WHERE m.user_id = $1 AND i.resource_type = 'skill' AND i.resource_id = $2
    LIMIT 1
  `, [userId, slug]);
  return r.rowCount > 0;
}

/**
 * 用户可见资源（资源组勾选 = 严格白名单；模型再取模型组交集）。
 * 兜底链: 用户不存在/超管/后台角色 -> 全量; 非超管不在任何资源组 -> 各类型空数组;
 *         某类型未勾选 -> 该类型空数组（不再全公开）。
 * shape 一致性: 返回全类型 key; 已授权类型返回勾选结果（字符串数组）, 未授权/未勾选返回空数组。
 * 延迟 require resource-types.js 打破循环依赖。
 */
async function getVisibleResourcesForUser(userId) {
  const { getAllResourceTypes, getResourceType } = require('./resource-types');
  const portalUser = await getPortalUser(userId);
  if (!portalUser || portalUser.is_portal_admin) return getAllResources();
  // 后台角色用户是管理者, 看全量(不受资源组白名单限制)
  if (await isAdminRoleUser(userId)) return getAllResources();

  const items = await pool().query(`
    SELECT resource_type, resource_id FROM resource_group_items
    WHERE group_id IN (SELECT group_id FROM resource_group_members WHERE user_id = $1)
  `, [userId]);

  // 非超管用户不在任何资源组 -> 各类型空数组（严格白名单, 不返回全量）
  if (items.rowCount === 0) {
    const empty = {};
    for (const type of getAllResourceTypes()) empty[type.key] = [];
    return empty;
  }

  const byType = {};
  for (const r of items.rows) (byType[r.resource_type] ??= []).push(r.resource_id);

  const result = {};
  for (const type of getAllResourceTypes()) {
    const ids = byType[type.key];
    const adapter = getResourceType(type.key);
    if (!ids || !ids.length) {
      // 该类型未勾选 = 空（严格白名单）
      result[type.key] = [];
    } else if (adapter?.isVisibleToUser) {
      result[type.key] = await adapter.isVisibleToUser(userId, ids);
    }
  }
  return result;
}

module.exports = {
  getPortalUser, getUserPermissions, hasPermission, isAdminRoleUser, hasAdminEntry, canUserAccessSkill,
  getVisibleResourcesForUser, getAllResources, getUserAllowedModels,
};
