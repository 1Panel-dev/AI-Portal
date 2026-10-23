/**
 * 默认资源组管理
 *
 * 设计:
 *   - 默认资源组 (resource_groups.is_default = TRUE) 全表唯一
 *   - 新用户注册时自动加入默认组
 *   - 默认组创建时自动把当前活跃模型加入 items
 *   - 模型同步后自动把新模型追加到默认组 items(保持"全量"语义)
 *   - 管理员可编辑默认组 items 收敛授权
 *
 * 对抗场景:
 *   - 默认组不存在 → autoJoinDefaultGroup 静默跳过,不阻断注册
 *   - 用户已在默认组 → ON CONFLICT DO NOTHING 幂等
 *   - 模型已下架 → 追加时过滤 is_active = TRUE
 */

const DEFAULT_RESOURCE_TYPE_MODEL = 'model';

/**
 * 获取默认资源组 id,不存在返回 null
 */
async function getDefaultGroupId(pool) {
  const r = await pool.query(
    'SELECT id FROM resource_groups WHERE is_default = TRUE LIMIT 1'
  );
  return r.rows[0]?.id ?? null;
}

/**
 * 用户加入默认资源组(幂等)
 * @param {object} pool - pg Pool
 * @param {number} userId - portal_users.id
 * @returns {Promise<boolean>} 是否执行了加入操作
 */
async function autoJoinDefaultGroup(pool, userId) {
  const groupId = await getDefaultGroupId(pool);
  if (!groupId) return false;
  await pool.query(
    `INSERT INTO resource_group_members (group_id, user_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [groupId, userId]
  );
  return true;
}

/**
 * 把当前所有活跃模型同步到默认组 items(幂等, ON CONFLICT DO NOTHING)
 * 调用时机: 创建默认组后 / 模型同步后
 * @param {object} pool - pg Pool
 * @returns {Promise<{added:number, total:number}>}
 */
async function syncDefaultGroupItems(pool) {
  const groupId = await getDefaultGroupId(pool);
  if (!groupId) return { added: 0, total: 0 };

  // 用 model_name 作为 resource_id (对齐 permission.js 的 getUserAllowedModels 查询维度)
  const r = await pool.query(
    `INSERT INTO resource_group_items (group_id, resource_type, resource_id)
     SELECT $1, $2, model_name FROM portal_models WHERE is_active = TRUE
     ON CONFLICT DO NOTHING`,
    [groupId, DEFAULT_RESOURCE_TYPE_MODEL]
  );
  const total = await pool.query(
    'SELECT count(*) c FROM resource_group_items WHERE group_id = $1 AND resource_type = $2',
    [groupId, DEFAULT_RESOURCE_TYPE_MODEL]
  );
  return { added: r.rowCount, total: parseInt(total.rows[0].c) };
}

module.exports = {
  getDefaultGroupId,
  autoJoinDefaultGroup,
  syncDefaultGroupItems,
};
