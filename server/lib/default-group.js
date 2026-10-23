/**
 * 默认资源组管理
 *
 * 设计:
 *   - 默认资源组 (resource_groups.is_default = TRUE) 全表唯一(部分索引保证)
 *   - 种子: migration 045 创建"默认资源组"并把现有用户全部入组(开箱即全量可见,管理员可编辑收敛)
 *   - 新用户注册时自动加入(portal.js / oauth.js 调 autoJoinDefaultGroup)
 *   - 资源同步后自动把新增资源追加到默认组 items(保持"默认全量"语义,管理员删掉的不复活——只 INSERT 不 DELETE)
 *
 * resource_id 语义(对齐 resource-types.js 适配器,勿改):
 *   - model: portal_models.id (主键,字符串存储;isVisibleToUser 内部 id->model_name 再与网关允许列表取交集)
 *   - skill: skills.slug
 *   - mcp:   portal_mcps.id (主键,字符串存储)
 *
 * 对抗场景:
 *   - 默认组不存在 → autoJoinDefaultGroup 静默跳过,不阻断注册; syncDefaultGroupItems 返回 0
 *   - 用户已在默认组 / 资源已勾选 → 主键(group_id,resource_type,resource_id)幂等
 *   - 模型下架/技能停用 → 只追加不过滤: 勾选项指向已停用资源时适配器查询自带 is_active 条件,不会泄漏
 *   - 事务内调用 → 支持传入 client 复用同一连接(创建默认组时同事务填充)
 */

/**
 * 获取默认资源组 id,不存在返回 null
 * @param {object} db - pg Pool 或 Client
 */
async function getDefaultGroupId(db) {
  const r = await db.query(
    'SELECT id FROM resource_groups WHERE is_default = TRUE LIMIT 1'
  );
  return r.rows[0]?.id ?? null;
}

/**
 * 用户加入默认资源组(幂等)
 * @param {object} db - pg Pool
 * @param {number} userId - portal_users.id
 * @returns {Promise<boolean>} 是否存在默认组(加入动作用 ON CONFLICT 幂等)
 */
async function autoJoinDefaultGroup(db, userId) {
  const groupId = await getDefaultGroupId(db);
  if (!groupId) return false;
  await db.query(
    `INSERT INTO resource_group_members (group_id, user_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [groupId, userId]
  );
  return true;
}

/**
 * 把当前所有活跃资源(model/skill/mcp)追加到默认组 items(幂等,只增不删)
 * 尊重组的 auto_sync_items 开关: false = 管理员已接管编辑,同步不再放大白名单
 * @param {object} db - pg Pool 或 Client(事务内传 client)
 * @param {number} [groupId] - 指定组 id(创建组时同事务调用);缺省取当前默认组
 * @returns {Promise<{added:number, total:number, skipped?:boolean}>}
 */
async function syncDefaultGroupItems(db, groupId) {
  let gid = groupId;
  if (!gid) {
    const g = await db.query(
      'SELECT id, auto_sync_items FROM resource_groups WHERE is_default = TRUE LIMIT 1'
    );
    const row = g.rows[0];
    if (!row) return { added: 0, total: 0 };
    if (!row.auto_sync_items) {
      // 管理员接管模式: 只返回当前总数,不追加
      const t = await db.query('SELECT count(*) c FROM resource_group_items WHERE group_id = $1', [row.id]);
      return { added: 0, total: parseInt(t.rows[0].c), skipped: true };
    }
    gid = row.id;
  }

  // 三类型并行追加;任一类型失败不阻断其他类型(资源表可能为空/结构差异)
  const stmts = [
    // model: 主键 id (字符串存储,对齐适配器 isVisibleToUser 的 int[] 转换)
    `INSERT INTO resource_group_items (group_id, resource_type, resource_id)
     SELECT $1, 'model', id::text FROM portal_models WHERE is_active = TRUE
     ON CONFLICT DO NOTHING`,
    // skill: slug
    `INSERT INTO resource_group_items (group_id, resource_type, resource_id)
     SELECT $1, 'skill', slug FROM skills WHERE is_active = TRUE
     ON CONFLICT DO NOTHING`,
    // mcp: 主键 id
    `INSERT INTO resource_group_items (group_id, resource_type, resource_id)
     SELECT $1, 'mcp', id::text FROM portal_mcps WHERE is_active = TRUE
     ON CONFLICT DO NOTHING`,
  ];
  let added = 0;
  for (const sql of stmts) {
    try {
      const r = await db.query(sql, [gid]);
      added += r.rowCount;
    } catch (e) {
      // 单类型失败(如表不存在)不阻断其余类型
      console.error('[default-group] 追加资源类型失败(不阻断):', e.message);
    }
  }
  const total = await db.query(
    'SELECT count(*) c FROM resource_group_items WHERE group_id = $1',
    [gid]
  );
  return { added, total: parseInt(total.rows[0].c) };
}

/**
 * 把现有全部用户加入默认组(种子用,幂等;新用户走 autoJoinDefaultGroup)
 * @param {object} db - pg Pool 或 Client
 * @returns {Promise<number>} 本次新加入人数
 */
async function addAllUsersToDefaultGroup(db) {
  const groupId = await getDefaultGroupId(db);
  if (!groupId) return 0;
  const r = await db.query(
    `INSERT INTO resource_group_members (group_id, user_id)
     SELECT $1, id FROM portal_users
     ON CONFLICT DO NOTHING`,
    [groupId]
  );
  return r.rowCount;
}

module.exports = {
  getDefaultGroupId,
  autoJoinDefaultGroup,
  syncDefaultGroupItems,
  addAllUsersToDefaultGroup,
};
