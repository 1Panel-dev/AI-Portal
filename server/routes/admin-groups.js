// server/routes/admin-groups.js
// 资源组 CRUD + 1Panel 组同步 + 资源类型接口（薄路由范式）
// 守卫 + 参数校验 + 调 lib + 返回 JSON, 不写业务逻辑
const express = require('express');
const { verifyUser, requirePermission } = require('../auth');
const { syncPanelGroups } = require('../panel');
const { getResourceType, getAllResourceTypes } = require('../lib/resource-types');

const router = express.Router();
const pool = () => global.pool;

// ---- 资源类型 ----
router.get('/api/admin/resource-types', verifyUser, requirePermission('group:view'), async (req, res) => {
  try {
    res.json({ data: getAllResourceTypes() });
  } catch (e) {
    res.status(500).json({ error: '获取资源类型失败', reason: e.message });
  }
});

// ---- 资源组 CRUD ----
router.get('/api/admin/groups', verifyUser, requirePermission('group:view'), async (req, res) => {
  try {
    const r = await pool().query(`
      SELECT g.*,
        (SELECT count(*) FROM resource_group_members m WHERE m.group_id = g.id) AS member_count,
        (SELECT json_agg(json_build_object(rt.key, cnt.cnt))
         FROM (SELECT resource_type, count(*) cnt FROM resource_group_items WHERE group_id = g.id GROUP BY resource_type) cnt
         LEFT JOIN resource_types rt ON rt.key = cnt.resource_type) AS resource_counts
      FROM resource_groups g ORDER BY g.created_at DESC
    `);
    res.json({ data: r.rows });
  } catch (e) {
    res.status(500).json({ error: '获取资源组失败', reason: e.message });
  }
});

router.post('/api/admin/groups', verifyUser, requirePermission('group:create'), async (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '资源组名称不能为空' });
  try {
    const r = await pool().query(
      'INSERT INTO resource_groups (name, description) VALUES ($1, $2) RETURNING *',
      [name.trim(), description || null]
    );
    res.json({ data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: '创建失败', reason: e.message });
  }
});

router.get('/api/admin/groups/:id', verifyUser, requirePermission('group:view'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const g = await pool().query('SELECT * FROM resource_groups WHERE id = $1', [id]);
    if (!g.rowCount) return res.status(404).json({ error: '资源组不存在' });
    const members = await pool().query(`
      SELECT u.id, u.username, u.name FROM resource_group_members m
      JOIN portal_users u ON u.id = m.user_id WHERE m.group_id = $1
    `, [id]);
    const items = await pool().query(
      'SELECT resource_type, resource_id FROM resource_group_items WHERE group_id = $1', [id]
    );
    res.json({ data: { ...g.rows[0], members: members.rows, items: items.rows } });
  } catch (e) {
    res.status(500).json({ error: '获取资源组详情失败', reason: e.message });
  }
});

router.put('/api/admin/groups/:id', verifyUser, requirePermission('group:edit'), async (req, res) => {
  const id = Number(req.params.id);
  const { name, description } = req.body;
  // partial update: COALESCE 保留原值, 前端可只改 name 或 description 单字段。
  // 注: description 清空语义不被支持——传 null 时 COALESCE(null, description) 会保留原值而非清空。
  // Phase1 不需要清空 description, 如需清空得走显式 patch 路径。
  try {
    const r = await pool().query(
      'UPDATE resource_groups SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [name?.trim() ?? null, description ?? null, id]
    );
    if (!r.rowCount) return res.status(404).json({ error: '资源组不存在' });
    res.json({ data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: '更新资源组失败', reason: e.message });
  }
});

router.delete('/api/admin/groups/:id', verifyUser, requirePermission('group:delete'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await pool().query('DELETE FROM resource_groups WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '删除资源组失败', reason: e.message });
  }
});

// 全量覆盖资源（事务）
router.put('/api/admin/groups/:id/items', verifyUser, requirePermission('group:edit'), async (req, res) => {
  const id = Number(req.params.id);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM resource_group_items WHERE group_id = $1', [id]);
    for (const it of items) {
      if (!it.resource_type || !it.resource_id) continue;
      await client.query(
        `INSERT INTO resource_group_items (group_id, resource_type, resource_id) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING`,
        [id, it.resource_type, String(it.resource_id)]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: '更新失败', reason: e.message });
  } finally {
    client.release();
  }
});

// 全量覆盖成员（事务）
router.put('/api/admin/groups/:id/members', verifyUser, requirePermission('group:edit'), async (req, res) => {
  const id = Number(req.params.id);
  const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM resource_group_members WHERE group_id = $1', [id]);
    for (const uid of userIds) {
      await client.query(
        `INSERT INTO resource_group_members (group_id, user_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [id, Number(uid)]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: '更新失败', reason: e.message });
  } finally {
    client.release();
  }
});

// ---- 1Panel 组同步 ----
router.get('/api/admin/panel-groups', verifyUser, requirePermission('group:view'), async (req, res) => {
  try {
    const userGroups = await pool().query('SELECT * FROM panel_user_groups ORDER BY name');
    const modelGroups = await pool().query('SELECT * FROM panel_model_groups ORDER BY name');
    res.json({ data: { userGroups: userGroups.rows, modelGroups: modelGroups.rows } });
  } catch (e) {
    res.status(500).json({ error: '获取 1Panel 组失败', reason: e.message });
  }
});

router.post('/api/admin/panel-groups/sync', verifyUser, requirePermission('group:edit'), async (req, res) => {
  try {
    const result = await syncPanelGroups();
    res.json({ data: result });
  } catch (e) {
    res.status(502).json({ error: 'PANEL_REJECTED', reason: e.message });
  }
});

// ---- 角色列表（供角色分配区动态拉, 为后续自定义角色铺路）----
// 返回全部角色（含 is_system 标记）, 前端按 name !== 'admin' 排除超管标记角色不可分配
router.get('/api/admin/roles', verifyUser, requirePermission('role:view'), async (req, res) => {
  try {
    const r = await pool().query(
      'SELECT id, name, description, is_system FROM roles ORDER BY id'
    );
    res.json({ data: r.rows });
  } catch (e) {
    res.status(500).json({ error: '获取角色列表失败', reason: e.message });
  }
});

// ---- 用户角色分配（spec 盲区1: 没有它管理角色无法赋予用户）----

// 查某用户已分配的角色
router.get('/api/admin/users/:id/roles', verifyUser, requirePermission('user:edit'), async (req, res) => {
  const userId = Number(req.params.id);
  try {
    const r = await pool().query(`
      SELECT r.id, r.name, r.is_system FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = $1 ORDER BY r.id
    `, [userId]);
    res.json({ data: r.rows });
  } catch (e) {
    res.status(500).json({ error: '获取用户角色失败', reason: e.message });
  }
});

// 全量覆盖某用户的角色（事务, 跟 items/members 一个范式）
router.put('/api/admin/users/:id/roles', verifyUser, requirePermission('user:edit'), async (req, res) => {
  const userId = Number(req.params.id);
  const roleIds = Array.isArray(req.body.roleIds) ? req.body.roleIds.map(Number) : [];
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    for (const rid of roleIds) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, rid]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: '更新用户角色失败', reason: e.message });
  } finally {
    client.release();
  }
});

// ---- 组内资源预览（某资源组包含的资源清单，带标题，按类型聚合）----
// 供「资源授权」页组列表行的「预览」用：看这个组授权了哪些模型/技能/MCP（组内 items，不含成员交集）。
router.get('/api/admin/groups/:id/resources-preview', verifyUser, requirePermission('group:view'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '无效的资源组 id' });
  try {
    // 组不存在 -> 404
    const g = await pool().query('SELECT id FROM resource_groups WHERE id = $1', [id]);
    if (!g.rowCount) return res.status(404).json({ error: '资源组不存在' });
    // 该组 items，按类型分组
    const items = await pool().query(
      'SELECT resource_type, resource_id FROM resource_group_items WHERE group_id = $1', [id]
    );
    const byType = {};
    for (const it of items.rows) {
      (byType[it.resource_type] ??= new Set()).add(String(it.resource_id));
    }
    // 每类型拿全量带标题，再按组 items 过滤
    const data = {};
    for (const type of getAllResourceTypes()) {
      const adapter = getResourceType(type.key);
      const allWithTitle = await mapAllWithType(type.key, adapter);
      const idSet = byType[type.key];
      data[type.key] = idSet
        ? allWithTitle.filter(r => idSet.has(String(r.id)))
        : [];
    }
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: '获取组资源预览失败', reason: e.message });
  }
});

// 各资源类型 listAll -> 统一 {id, title, subtitle} 映射
async function mapAllWithType(key, adapter) {
  if (!adapter?.listAll) return [];
  const rows = await adapter.listAll();
  if (key === 'model') return rows.map(r => ({ id: r.model_name, title: r.model_name, subtitle: `${r.group_name || ''} · ${r.provider || ''}`.trim() }));
  if (key === 'skill') return rows.map(r => ({ id: r.slug, title: r.title, subtitle: r.slug }));
  if (key === 'mcp') return rows.map(r => ({ id: String(r.id), title: r.name || '未命名', subtitle: r.type || '' }));
  return rows.map(r => ({ id: String(r.id ?? ''), title: String(r.title ?? r.name ?? r.id ?? ''), subtitle: '' }));
}

module.exports = router;