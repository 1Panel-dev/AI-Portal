// server/routes/admin-groups.js
// 资源组 CRUD + 1Panel 组同步 + 资源类型接口（薄路由范式）
// 守卫 + 参数校验 + 调 lib + 返回 JSON, 不写业务逻辑
const express = require('express');
const { verifyAdmin } = require('../auth');
const { syncPanelGroups } = require('../panel');
const { getResourceType, getAllResourceTypes } = require('../lib/resource-types');

const router = express.Router();
const pool = () => global.pool;

// ---- 资源类型 ----
router.get('/api/admin/resource-types', verifyAdmin, async (req, res) => {
  res.json({ data: getAllResourceTypes() });
});

// ---- 资源组 CRUD ----
router.get('/api/admin/groups', verifyAdmin, async (req, res) => {
  const r = await pool().query(`
    SELECT g.*,
      (SELECT count(*) FROM resource_group_members m WHERE m.group_id = g.id) AS member_count,
      (SELECT json_agg(json_build_object(rt.key, cnt.cnt))
       FROM (SELECT resource_type, count(*) cnt FROM resource_group_items WHERE group_id = g.id GROUP BY resource_type) cnt
       LEFT JOIN resource_types rt ON rt.key = cnt.resource_type) AS resource_counts
    FROM resource_groups g ORDER BY g.created_at DESC
  `);
  res.json({ data: r.rows });
});

router.post('/api/admin/groups', verifyAdmin, async (req, res) => {
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

router.get('/api/admin/groups/:id', verifyAdmin, async (req, res) => {
  const id = Number(req.params.id);
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
});

router.put('/api/admin/groups/:id', verifyAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, description } = req.body;
  // partial update: COALESCE 保留原值, 前端可只改 name 或 description 单字段。
  // 注: description 清空语义不被支持——传 null 时 COALESCE(null, description) 会保留原值而非清空。
  // Phase1 不需要清空 description, 如需清空得走显式 patch 路径。
  const r = await pool().query(
    'UPDATE resource_groups SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
    [name?.trim() ?? null, description ?? null, id]
  );
  if (!r.rowCount) return res.status(404).json({ error: '资源组不存在' });
  res.json({ data: r.rows[0] });
});

router.delete('/api/admin/groups/:id', verifyAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await pool().query('DELETE FROM resource_groups WHERE id = $1', [id]);
  res.json({ ok: true });
});

// 全量覆盖资源（事务）
router.put('/api/admin/groups/:id/items', verifyAdmin, async (req, res) => {
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
router.put('/api/admin/groups/:id/members', verifyAdmin, async (req, res) => {
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
router.get('/api/admin/panel-groups', verifyAdmin, async (req, res) => {
  const userGroups = await pool().query('SELECT * FROM panel_user_groups ORDER BY name');
  const modelGroups = await pool().query('SELECT * FROM panel_model_groups ORDER BY name');
  res.json({ data: { userGroups: userGroups.rows, modelGroups: modelGroups.rows } });
});

router.post('/api/admin/panel-groups/sync', verifyAdmin, async (req, res) => {
  try {
    const result = await syncPanelGroups();
    res.json({ data: result });
  } catch (e) {
    res.status(502).json({ error: 'PANEL_REJECTED', reason: e.message });
  }
});

module.exports = router;
