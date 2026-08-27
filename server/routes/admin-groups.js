// server/routes/admin-groups.js
// 资源组 CRUD + 1Panel 组同步 + 资源类型接口（薄路由范式）
// 守卫 + 参数校验 + 调 lib + 返回 JSON, 不写业务逻辑
const express = require('express');
const { verifyUser, requirePermission } = require('../auth');
const { syncPanelGroups } = require('../panel');
const { getResourceType, getAllResourceTypes } = require('../lib/resource-types');

const router = express.Router();
const pool = () => global.pool;

// ---- 标签库 ----
const TAG_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

async function getTagRows() {
  const r = await pool().query(`
    SELECT t.id, t.name, t.color, t.sort_order, t.is_active, t.created_at, t.updated_at,
      COALESCE(array_agg(tr.resource_type ORDER BY tr.resource_type)
        FILTER (WHERE tr.resource_type IS NOT NULL), '{}') AS resource_types
    FROM tags t
    LEFT JOIN tag_resource_types tr ON tr.tag_id = t.id
    GROUP BY t.id
    ORDER BY t.sort_order, t.id
  `);
  return r.rows;
}

async function validateTagResourceTypes(resourceTypes) {
  const values = Array.isArray(resourceTypes) ? [...new Set(resourceTypes.map(String))] : [];
  if (!values.length) return { values: [], error: '至少选择一种适用资源类型' };
  const valid = await pool().query('SELECT key FROM resource_types WHERE key = ANY($1)', [values]);
  const validSet = new Set(valid.rows.map(r => r.key));
  const invalid = values.filter(v => !validSet.has(v));
  return invalid.length ? { values, error: `未知资源类型: ${invalid.join(', ')}` } : { values };
}

router.get('/api/admin/tags', verifyUser, requirePermission('tag:view'), async (req, res) => {
  try {
    res.json({ data: await getTagRows() });
  } catch (e) {
    res.status(500).json({ error: '获取标签失败', reason: e.message });
  }
});

router.post('/api/admin/tags', verifyUser, requirePermission('tag:create'), async (req, res) => {
  const name = String(req.body.name || '').trim();
  const color = String(req.body.color || '#005eeb').trim();
  const sortOrder = Number.isFinite(Number(req.body.sort_order)) ? Number(req.body.sort_order) : 0;
  if (!name) return res.status(400).json({ error: '标签名称不能为空' });
  if (name.length > 50) return res.status(400).json({ error: '标签名称不能超过50个字符' });
  if (!TAG_COLOR_RE.test(color)) return res.status(400).json({ error: '颜色格式无效，请使用 #RRGGBB' });
  const typeResult = await validateTagResourceTypes(req.body.resource_types);
  if (typeResult.error) return res.status(400).json({ error: typeResult.error });
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      'INSERT INTO tags (name, color, sort_order) VALUES ($1, $2, $3) RETURNING id',
      [name, color, sortOrder]
    );
    for (const type of typeResult.values) {
      await client.query('INSERT INTO tag_resource_types (tag_id, resource_type) VALUES ($1, $2)', [r.rows[0].id, type]);
    }
    await client.query('COMMIT');
    res.status(201).json({ data: (await getTagRows()).find(tag => tag.id === r.rows[0].id) });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: '标签名称已存在' });
    res.status(500).json({ error: '创建标签失败', reason: e.message });
  } finally {
    client.release();
  }
});

router.patch('/api/admin/tags/:id', verifyUser, requirePermission('tag:edit'), async (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body.name || '').trim();
  const color = String(req.body.color || '#005eeb').trim();
  const sortOrder = Number.isFinite(Number(req.body.sort_order)) ? Number(req.body.sort_order) : 0;
  // 仅当显式传 is_active 时更新状态;否则保留原状,避免编辑名称/颜色把停用标签改回启用
  const isActive = req.body.is_active !== undefined ? !!req.body.is_active : null;
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '标签 ID 无效' });
  if (!name) return res.status(400).json({ error: '标签名称不能为空' });
  if (name.length > 50) return res.status(400).json({ error: '标签名称不能超过50个字符' });
  if (!TAG_COLOR_RE.test(color)) return res.status(400).json({ error: '颜色格式无效，请使用 #RRGGBB' });
  const typeResult = await validateTagResourceTypes(req.body.resource_types);
  if (typeResult.error) return res.status(400).json({ error: typeResult.error });
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE tags SET name = $1, color = $2, sort_order = $3, is_active = COALESCE($4, is_active),
       updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING id`,
      [name, color, sortOrder, isActive, id]
    );
    if (!r.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '标签不存在' });
    }
    await client.query('DELETE FROM tag_resource_types WHERE tag_id = $1', [id]);
    for (const type of typeResult.values) {
      await client.query('INSERT INTO tag_resource_types (tag_id, resource_type) VALUES ($1, $2)', [id, type]);
    }
    await client.query('COMMIT');
    res.json({ data: (await getTagRows()).find(tag => tag.id === id) });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: '标签名称已存在' });
    res.status(500).json({ error: '更新标签失败', reason: e.message });
  } finally {
    client.release();
  }
});

router.delete('/api/admin/tags/:id', verifyUser, requirePermission('tag:delete'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '标签 ID 无效' });
  try {
    const r = await pool().query('DELETE FROM tags WHERE id = $1 RETURNING id', [id]);
    if (!r.rowCount) return res.status(404).json({ error: '标签不存在' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '删除标签失败', reason: e.message });
  }
});

// ---- 标签启用/停用快捷切换 ----
router.patch('/api/admin/tags/:id/toggle-active', verifyUser, requirePermission('tag:edit'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '标签 ID 无效' });
  try {
    const r = await pool().query(
      `UPDATE tags SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!r.rowCount) return res.status(404).json({ error: '标签不存在' });
    res.json({ data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: '切换状态失败', reason: e.message });
  }
});

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

// 全量覆盖成员（事务）——资源组授权:管理「授权给谁」。独立 group:assign 权限, 与资源组管理(group:edit)解耦
router.put('/api/admin/groups/:id/members', verifyUser, requirePermission('group:assign'), async (req, res) => {
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

router.post('/api/admin/panel-groups/sync', verifyUser, requirePermission('group:panel-sync'), async (req, res) => {
  try {
    const result = await syncPanelGroups();
    res.json({ data: result });
  } catch (e) {
    res.status(502).json({ error: 'PANEL_REJECTED', reason: e.message });
  }
});

// ---- 角色 CRUD + 权限配置 ----

// 返回全部角色（含 is_system 标记 + 权限位列表 + 用户数）
router.get('/api/admin/roles', verifyUser, requirePermission('role:view'), async (req, res) => {
  try {
    const r = await pool().query(`
      SELECT r.id, r.name, r.description, r.is_system, r.inherit_from,
        COALESCE(
          (SELECT json_agg(p.key ORDER BY p.key)
           FROM role_permissions rp
           JOIN permissions p ON p.id = rp.permission_id
           WHERE rp.role_id = r.id),
          '[]'::json
        ) AS permissions,
        (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id)::int AS user_count
      FROM roles r
      ORDER BY r.id
    `);
    res.json({ data: r.rows });
  } catch (e) {
    res.status(500).json({ error: '获取角色列表失败', reason: e.message });
  }
});

// 全部权限位清单（供前端勾选树渲染）
router.get('/api/admin/permissions', verifyUser, requirePermission('role:view'), async (req, res) => {
  try {
    const r = await pool().query('SELECT id, module, action, key, name FROM permissions ORDER BY module, action');
    res.json({ data: r.rows });
  } catch (e) {
    res.status(500).json({ error: '获取权限位列表失败', reason: e.message });
  }
});

// 新建角色（含 name 唯一校验 + 保留名 admin/user 禁用）
router.post('/api/admin/roles', verifyUser, requirePermission('role:create'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const keys = Array.isArray(req.body.keys) ? req.body.keys : [];
    const inheritFrom = req.body.inherit_from || 'custom';

    if (!name) return res.status(400).json({ error: '角色名不能为空' });
    if (name.length > 50) return res.status(400).json({ error: '角色名不能超过50个字符' });
    if (description.length > 200) return res.status(400).json({ error: '描述不能超过200个字符' });
    // 保留名禁用
    if (name === 'admin' || name === 'user') {
      return res.status(400).json({ error: `角色名「${name}」为系统保留名，不可创建` });
    }

    // 校验 keys 全存在
    if (keys.length > 0) {
      const valid = await pool().query('SELECT key FROM permissions WHERE key = ANY($1)', [keys]);
      const validSet = new Set(valid.rows.map(r => r.key));
      const invalid = keys.filter(k => !validSet.has(k));
      if (invalid.length) return res.status(400).json({ error: `未知权限位: ${invalid.join(', ')}` });
    }

    // 非超管校验 keys ⊆ 操作者持有（C2）
    if (!req.portalUser.is_portal_admin) {
      const { getUserPermissions } = require('../lib/permission');
      const { permissions: myPerms } = await getUserPermissions(req.portalUser.id);
      const mySet = new Set(myPerms);
      const exceed = keys.filter(k => !mySet.has(k));
      if (exceed.length) return res.status(403).json({ error: `无权分配超出自己持有范围的权限位: ${exceed.join(', ')}` });
    }

    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        `INSERT INTO roles (name, description, is_system, inherit_from) VALUES ($1, $2, FALSE, $3) RETURNING id, name, description, is_system, inherit_from`,
        [name, description, inheritFrom]
      );
      const role = r.rows[0];
      // 插权限关联
      for (const k of keys) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE key = $2 ON CONFLICT DO NOTHING`,
          [role.id, k]
        );
      }
      await client.query('COMMIT');
      // 返回完整角色信息（含权限位）
      const full = await pool().query(`
        SELECT r.id, r.name, r.description, r.is_system, r.inherit_from,
          COALESCE(
            (SELECT json_agg(p.key ORDER BY p.key)
             FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
             WHERE rp.role_id = r.id), '[]'::json
          ) AS permissions, 0 AS user_count
        FROM roles r WHERE r.id = $1
      `, [role.id]);
      res.status(201).json({ data: full.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505') return res.status(409).json({ error: '角色名已存在' });
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: '新建角色失败', reason: e.message });
  }
});

// 单角色详情（含权限位列表）
router.get('/api/admin/roles/:id', verifyUser, requirePermission('role:view'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '无效的角色 id' });
    const r = await pool().query(`
      SELECT r.id, r.name, r.description, r.is_system, r.inherit_from,
        COALESCE(
          (SELECT json_agg(p.key ORDER BY p.key)
           FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
           WHERE rp.role_id = r.id), '[]'::json
        ) AS permissions,
        (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id)::int AS user_count
      FROM roles r WHERE r.id = $1
    `, [id]);
    if (!r.rowCount) return res.status(404).json({ error: '角色不存在' });
    res.json({ data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: '获取角色详情失败', reason: e.message });
  }
});

// 改角色基本信息（is_system 角色禁改 name；admin 角色禁改 name+description）
router.put('/api/admin/roles/:id', verifyUser, requirePermission('role:edit'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '无效的角色 id' });
    const role = await pool().query('SELECT id, name, is_system FROM roles WHERE id = $1', [id]);
    if (!role.rowCount) return res.status(404).json({ error: '角色不存在' });

    const r = role.rows[0];
    const name = req.body.name !== undefined ? String(req.body.name).trim() : undefined;
    const description = req.body.description !== undefined ? String(req.body.description).trim() : undefined;

    // is_system 角色禁改 name
    if (r.is_system && name !== undefined) {
      return res.status(400).json({ error: '内置角色不可修改名称' });
    }
    // admin 角色禁止修改任何信息
    if (r.name === 'admin' && (name !== undefined || description !== undefined)) {
      return res.status(400).json({ error: 'admin 为系统标记角色，不可修改' });
    }

    // 校验 name 长度
    if (name !== undefined) {
      if (!name) return res.status(400).json({ error: '角色名不能为空' });
      if (name.length > 50) return res.status(400).json({ error: '角色名不能超过50个字符' });
    }
    if (description !== undefined && description.length > 200) {
      return res.status(400).json({ error: '描述不能超过200个字符' });
    }

    const sets = [];
    const vals = [];
    let idx = 1;
    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
    if (sets.length === 0) return res.status(400).json({ error: '没有需要更新的字段' });

    vals.push(id);
    try {
      await pool().query(`UPDATE roles SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx}`, vals);
      res.json({ ok: true });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: '角色名已存在' });
      throw e;
    }
  } catch (e) {
    res.status(500).json({ error: '更新角色失败', reason: e.message });
  }
});

// 删角色（is_system 禁删；有 user_roles 引用返 409）
router.delete('/api/admin/roles/:id', verifyUser, requirePermission('role:delete'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '无效的角色 id' });
    const role = await pool().query('SELECT id, name, is_system FROM roles WHERE id = $1', [id]);
    if (!role.rowCount) return res.status(404).json({ error: '角色不存在' });

    const r = role.rows[0];
    // 内置角色禁删
    if (r.is_system) return res.status(409).json({ error: '内置角色不可删除' });

    // 预检查引用（防 DB CASCADE 致用户丢权限）
    const refs = await pool().query('SELECT COUNT(*)::int AS cnt FROM user_roles WHERE role_id = $1', [id]);
    if (refs.rows[0].cnt > 0) {
      return res.status(409).json({ error: `该角色被 ${refs.rows[0].cnt} 个用户引用，请先移除或给用户换角色` });
    }

    await pool().query('DELETE FROM roles WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '删除角色失败', reason: e.message });
  }
});

// 查某角色的权限位 key 列表
router.get('/api/admin/roles/:id/permissions', verifyUser, requirePermission('role:view'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '无效的角色 id' });
    const r = await pool().query(
      `SELECT p.key FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = $1 ORDER BY p.key`, [id]
    );
    res.json({ data: r.rows.map(row => row.key) });
  } catch (e) {
    res.status(500).json({ error: '获取角色权限位失败', reason: e.message });
  }
});

// 全量覆盖角色权限位（事务：DELETE + INSERT，跟 items/members 范式一致）
router.put('/api/admin/roles/:id/permissions', verifyUser, requirePermission('role:edit'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '无效的角色 id' });
    const keys = Array.isArray(req.body.keys) ? req.body.keys : [];

    const role = await pool().query('SELECT id, name, is_system FROM roles WHERE id = $1', [id]);
    if (!role.rowCount) return res.status(404).json({ error: '角色不存在' });

    const r = role.rows[0];
    // 内置角色权限集不可改（admin 走 is_portal_admin bypass，user 影响全体用户）
    if (r.is_system) return res.status(400).json({ error: '内置角色权限集不可修改' });

    // 校验 keys 全存在（I3）
    if (keys.length > 0) {
      const valid = await pool().query('SELECT key FROM permissions WHERE key = ANY($1)', [keys]);
      const validSet = new Set(valid.rows.map(r => r.key));
      const invalid = keys.filter(k => !validSet.has(k));
      if (invalid.length) return res.status(400).json({ error: `未知权限位: ${invalid.join(', ')}` });
    }

    // 非超管校验 C2：角色已有权限位 ⊆ 操作者 且 新 keys ⊆ 操作者
    // （否则有 role:edit 的委派管理员可对含高权限位的自定义角色传 keys=[] 清空权限，横向撤销协作者访问）
    if (!req.portalUser.is_portal_admin) {
      const { getUserPermissions } = require('../lib/permission');
      const { permissions: myPerms } = await getUserPermissions(req.portalUser.id);
      const mySet = new Set(myPerms);
      // 校验角色已有权限位 ⊆ 操作者
      const existing = await pool().query(
        `SELECT p.key FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         WHERE rp.role_id = $1`, [id]
      );
      const existingKeys = existing.rows.map(r => r.key);
      const exceedExisting = existingKeys.filter(k => !mySet.has(k));
      if (exceedExisting.length) {
        return res.status(403).json({ error: `无权修改包含超出自己持有范围权限位的角色: 缺失 ${exceedExisting.join(', ')}` });
      }
      // 校验新 keys ⊆ 操作者
      const exceed = keys.filter(k => !mySet.has(k));
      if (exceed.length) return res.status(403).json({ error: `无权分配超出自己持有范围的权限位: ${exceed.join(', ')}` });
    }

    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
      for (const k of keys) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE key = $2 ON CONFLICT DO NOTHING`,
          [id, k]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: '更新角色权限位失败', reason: e.message });
  }
});

// ---- 用户角色分配（spec 盲区1: 没有它管理角色无法赋予用户）----

// 查某用户已分配的角色
router.get('/api/admin/users/:id/roles', verifyUser, requirePermission('user:assign'), async (req, res) => {
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
// 单角色限制: 每个用户只能有一个角色（数组长度≤1，传多个返 400）
router.put('/api/admin/users/:id/roles', verifyUser, requirePermission('user:assign'), async (req, res) => {
  const userId = Number(req.params.id);
  const roleIds = Array.isArray(req.body.roleIds) ? req.body.roleIds.map(Number) : [];

  // 单角色限制
  if (roleIds.length > 1) {
    return res.status(400).json({ error: '每个用户只能分配一个角色' });
  }

  // C2 校验：禁自分配（超管除外）
  if (req.portalUser.id === userId && !req.portalUser.is_portal_admin) {
    return res.status(403).json({ error: '不能修改自己的角色' });
  }
  // 禁分配 admin 角色
  if (roleIds.length > 0) {
    const adminRoles = await pool().query('SELECT id FROM roles WHERE name = $1 AND id = ANY($2)', ['admin', roleIds]);
    if (adminRoles.rowCount > 0) {
      return res.status(400).json({ error: 'admin 为超管标记角色，不可分配' });
    }
  }
  // 非超管校验分配的角色权限位 ⊆ 操作者持有（C2）
  // 空 roleIds 时也需校验:清除角色也需要操作者持有目标角色的全部权限
  if (!req.portalUser.is_portal_admin) {
    // 当 roleIds 为空(清除角色)时,验证操作者是否持有目标用户当前角色的权限
    const checkRoleIds = roleIds.length > 0 ? roleIds : await pool().query(
      'SELECT ur.role_id FROM user_roles ur WHERE ur.user_id = $1', [userId]
    ).then(r => r.rows.map(x => x.role_id));
    if (checkRoleIds.length > 0) {
      const { getUserPermissions } = require('../lib/permission');
      const { permissions: myPerms } = await getUserPermissions(req.portalUser.id);
      const rolePerms = await pool().query(`
        SELECT DISTINCT p.key FROM permissions p
        JOIN role_permissions rp ON rp.permission_id = p.id
        WHERE rp.role_id = ANY($1)
      `, [checkRoleIds]);
      const rolePermSet = new Set(rolePerms.rows.map(r => r.key));
      const mySet = new Set(myPerms);
      const exceed = [...rolePermSet].filter(k => !mySet.has(k));
      if (exceed.length > 0) {
        return res.status(403).json({ error: `无权分配超出自己持有范围权限位的角色: 缺失 ${exceed.join(', ')}` });
      }
    }
  }

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
// 供「资源授权」页组列表行的「预览」用：看这个组授权了哪些模型/技能/MCP。
// 可选 ?userId=：按成员交集预览——模型按「组内勾选 ∩ 该成员 1Panel 模型组」展示；
// 技能/MCP 不取交集（intersect_panel=FALSE），返回组内勾选。
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

    // 可选 userId：校验是该组成员，取该成员的 1Panel 模型组限制用于模型交集
    let memberModelFilter = null;   // null = 未指定成员 / 成员无模型组限制 -> 不做交集过滤
    let portalUser = null;
    if (req.query.userId) {
      const memberUserId = Number(req.query.userId);
      if (!Number.isInteger(memberUserId) || memberUserId <= 0) {
        return res.status(400).json({ error: '无效的 userId' });
      }
      const member = await pool().query(
        'SELECT 1 FROM resource_group_members WHERE group_id = $1 AND user_id = $2', [id, memberUserId]
      );
      if (!member.rowCount) return res.status(400).json({ error: '该用户不是此资源组成员' });
      const { getPortalUser, getUserAllowedModels, isAdminRoleUser } = require('../lib/permission');
      portalUser = await getPortalUser(memberUserId);
      // 后台角色成员看全量(与广场 isAdminRoleUser bypass 一致), 不做模型组交集
      if (portalUser && !portalUser.is_portal_admin && !(await isAdminRoleUser(memberUserId))) {
        const allowed = await getUserAllowedModels(portalUser.panel_user_id);
        if (allowed) memberModelFilter = new Set(allowed);
      }
    }

    // 每类型拿全量带标题，再按组 items 过滤
    const data = {};
    for (const type of getAllResourceTypes()) {
      const adapter = getResourceType(type.key);
      const allWithTitle = await mapAllWithType(type.key, adapter);
      const idSet = byType[type.key];
      const groupSelected = idSet
        ? allWithTitle.filter(r => idSet.has(String(r.id)))
        : [];
      // 模型按成员模型组取交集（仅 model 需要；技能/MCP 返回组内勾选）
      // memberModelFilter 是 1Panel 允许的 model_name 集合; mapAllWithType 的 model.id 是主键,
      // 所以按 title(model_name) 比对, 不能按 id。
      if (type.key === 'model' && memberModelFilter) {
        const visible = groupSelected.filter(r => memberModelFilter.has(r.title));
        const blocked = groupSelected.filter(r => !memberModelFilter.has(r.title));
        data.model = visible;                        // 该成员可见（交集后）
        data.model_blocked = blocked;                // 组内勾选但被 1Panel 模型组挡住
        data.model_filtered = true;                  // 标志: 当前在按成员交集过滤
      } else {
        data[type.key] = groupSelected;
      }
    }

    // 构建 1Panel 用户组归属提示: 告诉管理员交集是按哪个 1Panel 用户组/模型组算的
    if (memberModelFilter && portalUser) {
      const keysQ = await pool().query(
        'SELECT DISTINCT group_id FROM portal_api_keys WHERE panel_user_id = $1 AND group_id IS NOT NULL',
        [portalUser.panel_user_id]
      );
      if (keysQ.rowCount) {
        const grpQ = await pool().query(
          'SELECT name FROM panel_user_groups WHERE panel_group_id = ANY($1) AND is_active = TRUE',
          [keysQ.rows.map(r => r.group_id)]
        );
        if (grpQ.rows.length) {
          const grpNames = grpQ.rows.map(r => r.name).join(', ');
          const blocked = data.model_blocked || [];
          const total = (data.model || []).length + blocked.length;
          data.memberHint = grpNames + ' → 被挡 ' + blocked.length + '/' + total;
        }
      }
    }
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: '获取组资源预览失败', reason: e.message });
  }
});

// ---- 组成员模型限制概览（一屏看全组成员的 1Panel 模型组限制）----
// 供「资源授权编辑页」的「资源预览」tab 用: 不再逐个成员请求, 一次返回全组成员的可见/被挡统计。
// 每个成员返回: { userId, username, name, is_portal_admin, is_admin_role,
//   panelGroupName(1Panel 用户组名, 可能空), visibleCount, blockedCount, total, blockedModels[] }
// 超管/后台角色成员 is_admin_role=true, 不取交集(看全量), blockedCount=0。
// 性能: 单组模型勾选数 M、成员数 N -> N 次 getUserAllowedModels(每次 3 条 SQL), N 大时并发可控。
// 可选 ?q= 按用户名/姓名模糊筛选; ?onlyBlocked=true 只返回有被挡的成员。
router.get('/api/admin/groups/:id/members-preview', verifyUser, requirePermission('group:view'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '无效的资源组 id' });
  try {
    const g = await pool().query('SELECT id FROM resource_groups WHERE id = $1', [id]);
    if (!g.rowCount) return res.status(404).json({ error: '资源组不存在' });

    // 该组勾选的模型: resource_group_items 存的是 portal_models 主键 id,
    // JOIN portal_models 取 model_name(授权交集按 model_name 和 1Panel 允许列表比)
    const modelItems = await pool().query(`
      SELECT pm.id AS model_id, pm.model_name
      FROM resource_group_items i
      JOIN portal_models pm ON pm.id = i.resource_id::int
      WHERE i.group_id = $1 AND i.resource_type = 'model' AND pm.is_active = TRUE
    `, [id]);
    // groupModelIds = 勾选的主键 id 集合; groupModelNames = 对应 model_name 集合(去重)
    const groupModelIds = modelItems.rows.map(r => r.model_id);
    const groupModelNameSet = new Set(modelItems.rows.map(r => r.model_name));
    const groupModelNames = [...groupModelNameSet];
    const totalModels = groupModelIds.length;

    // 全体成员（带 portal_user 信息）
    const members = await pool().query(`
      SELECT u.id, u.username, u.name, u.is_portal_admin, u.panel_user_id
      FROM resource_group_members m
      JOIN portal_users u ON u.id = m.user_id
      WHERE m.group_id = $1 AND u.status = 'active'
      ORDER BY u.is_portal_admin DESC, u.username
    `, [id]);

    // 可选筛选
    const q = (req.query.q || '').trim().toLowerCase();
    const onlyBlocked = req.query.onlyBlocked === 'true';

    // 先按 q 过滤成员（避免对不展示的成员也做授权查询）
    const filteredMembers = members.rows.filter(m => {
      if (q && !(m.username || '').toLowerCase().includes(q) && !(m.name || '').toLowerCase().includes(q)) return false;
      return true;
    });

    // ---- 批量查询授权数据（避免 N+1：每个成员 6+ 条 SQL -> 全量 4 条）----
    // 1. 哪些成员是后台角色（持有 menu:admin-*）
    const memberIds = filteredMembers.map(m => m.id);
    let adminRoleIds = new Set();
    if (memberIds.length) {
      const arQ = await pool().query(`
        SELECT DISTINCT ur.user_id FROM user_roles ur
        JOIN role_permissions rp ON rp.role_id = ur.role_id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = ANY($1::int[]) AND p.key LIKE 'menu:admin-%'
      `, [memberIds]);
      adminRoleIds = new Set(arQ.rows.map(r => r.user_id));
    }

    // 2. 需要算授权的普通成员（非超管、非后台角色、有 panel_user_id）
    const normalMembers = filteredMembers.filter(m =>
      !m.is_portal_admin && !adminRoleIds.has(m.id) && m.panel_user_id
    );
    const normalPanelUserIds = normalMembers.map(m => m.panel_user_id);

    // 3. 这些 panel_user 的 key group_id -> panel_user_groups -> model_group_ids -> panel_model_groups.models
    //    复刻 getUserAllowedModels 的三层 JOIN，但批量查一次
    const userAllowedMap = new Map();  // panel_user_id -> Set<modelName> | null(null=无限制)
    const userGroupNameMap = new Map(); // panel_user_id -> 1Panel 用户组名
    if (normalPanelUserIds.length) {
      // 3a. keys -> group_id（按 panel_user_id 聚合）
      const keysQ = await pool().query(`
        SELECT panel_user_id, array_agg(DISTINCT group_id) AS group_ids
        FROM portal_api_keys
        WHERE panel_user_id = ANY($1::int[]) AND group_id IS NOT NULL
        GROUP BY panel_user_id
      `, [normalPanelUserIds]);
      const userToGroupIds = new Map();
      const allGroupIds = new Set();
      for (const row of keysQ.rows) {
        userToGroupIds.set(row.panel_user_id, row.group_ids);
        for (const gid of row.group_ids) allGroupIds.add(gid);
      }

      // 3b. panel_user_groups: group_id -> { name, model_group_ids }
      let groupIdToInfo = new Map();
      if (allGroupIds.size) {
        const ugQ = await pool().query(`
          SELECT panel_group_id, name, model_group_ids
          FROM panel_user_groups
          WHERE panel_group_id = ANY($1::int[]) AND is_active = TRUE
        `, [Array.from(allGroupIds)]);
        for (const row of ugQ.rows) {
          groupIdToInfo.set(row.panel_group_id, {
            name: row.name,
            modelGroupIds: row.model_group_ids || [],
          });
        }
      }

      // 3c. 聚合每个用户组涉及的 model_group_ids
      const allMgIds = new Set();
      for (const info of groupIdToInfo.values()) {
        for (const mgId of info.modelGroupIds) allMgIds.add(mgId);
      }

      // 3d. panel_model_groups: model_group_id -> models[]
      let mgIdToModels = new Map();
      if (allMgIds.size) {
        const mgQ = await pool().query(`
          SELECT panel_group_id, models
          FROM panel_model_groups
          WHERE panel_group_id = ANY($1::int[]) AND is_active = TRUE
        `, [Array.from(allMgIds)]);
        for (const row of mgQ.rows) {
          mgIdToModels.set(row.panel_group_id, row.models || []);
        }
      }

      // 3e. 每个 panel_user_id 计算授权
      for (const m of normalMembers) {
        const groupIds = userToGroupIds.get(m.panel_user_id);
        if (!groupIds || !groupIds.length) {
          // 无 key -> null(全公开兜底)
          userAllowedMap.set(m.panel_user_id, null);
          continue;
        }
        const groupNames = [];
        const mgIds = new Set();
        for (const gid of groupIds) {
          const info = groupIdToInfo.get(gid);
          if (!info) continue;
          groupNames.push(info.name);
          for (const mgId of info.modelGroupIds) mgIds.add(mgId);
        }
        userGroupNameMap.set(m.panel_user_id, groupNames.join(', '));

        if (!mgIds.size) {
          // 用户组没配模型组 -> null(无限制)
          userAllowedMap.set(m.panel_user_id, null);
          continue;
        }
        const allowedModels = new Set();
        for (const mgId of mgIds) {
          for (const modelName of (mgIdToModels.get(mgId) || [])) allowedModels.add(modelName);
        }
        userAllowedMap.set(m.panel_user_id, allowedModels.size ? allowedModels : null);
      }
    }

    const rows = filteredMembers.map(m => {
      let visibleModels = [...groupModelNames];
      let blockedModels = [];
      let panelGroupName = '';
      let isAdminRole = false;

      if (m.is_portal_admin) {
        isAdminRole = true;
      } else if (adminRoleIds.has(m.id)) {
        isAdminRole = true;
      } else if (m.panel_user_id && userAllowedMap.has(m.panel_user_id)) {
        const allowed = userAllowedMap.get(m.panel_user_id);
        panelGroupName = userGroupNameMap.get(m.panel_user_id) || '';
        if (allowed === null) {
          // 无限制 -> 全可见
        } else {
          visibleModels = [...groupModelNames].filter(name => allowed.has(name));
          blockedModels = [...groupModelNames].filter(name => !allowed.has(name));
        }
      }

      const blockedCount = blockedModels.length;
      const visibleCount = visibleModels.length;

      return {
        userId: m.id,
        username: m.username,
        name: m.name,
        isPortalAdmin: !!m.is_portal_admin,
        isAdminRole,
        panelGroupName,
        visibleCount,
        blockedCount,
        total: totalModels,
        visibleModels,
        blockedModels,
      };
    });

    // onlyBlocked 过滤
    const finalRows = onlyBlocked ? rows.filter(r => r.blockedCount > 0) : rows;

    res.json({ data: { members: finalRows, total: members.rowCount } });
  } catch (e) {
    console.error('[members-preview] error:', e);
    res.status(500).json({ error: '获取成员限制概览失败', reason: e.message });
  }
});

// 全量资源列表(供资源组编辑勾选用):管理端,需 group:view。
// 不走广场接口(/api/models 等,它们已校验 model:view/skill:view/mcp:view),避免资源组编辑者
// 因没有查看权限而拉不到资源。
router.get('/api/admin/resources-list', verifyUser, requirePermission('group:view'), async (req, res) => {
  try {
    const { type } = req.query;
    const data = {};
    if (type) {
      data[type] = await mapAllWithType(type, getResourceType(type));
    } else {
      for (const t of getAllResourceTypes()) {
        data[t.key] = await mapAllWithType(t.key, getResourceType(t.key));
      }
    }
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: '获取资源列表失败', reason: e.message });
  }
});

// 各资源类型 listAll -> 统一 {id, title, subtitle} 映射
async function mapAllWithType(key, adapter) {
  if (!adapter?.listAll) return [];
  const rows = await adapter.listAll();
  if (key === 'model') {
    // id = portal_models 主键(每行唯一), 区分同名不同账号/供应商的实例。
    // resource_group_items 存主键 id, 勾选时不会连带同名其他实例。
    return rows.map(r => ({
      id: String(r.id),
      title: r.model_name,
      subtitle: `${r.group_name || ''} · ${r.provider || ''}`.trim(),
      is_public: !!r.is_public,
    }));
  }
  if (key === 'skill') return rows.map(r => ({ id: r.slug, title: r.title, subtitle: r.slug }));
  if (key === 'mcp') return rows.map(r => ({ id: String(r.panel_mcp_id ?? r.id), title: r.name || '未命名', subtitle: r.type || '' }));
  return rows.map(r => ({ id: String(r.id ?? ''), title: String(r.title ?? r.name ?? r.id ?? ''), subtitle: '' }));
  if (key === 'skill') return rows.map(r => ({ id: r.slug, title: r.title, subtitle: r.slug }));
  if (key === 'mcp') return rows.map(r => ({ id: String(r.panel_mcp_id ?? r.id), title: r.name || '未命名', subtitle: r.type || '' }));
  return rows.map(r => ({ id: String(r.id ?? ''), title: String(r.title ?? r.name ?? r.id ?? ''), subtitle: '' }));
}

// ─── 模型-标签关联 ──────────────────────────────────────────

// 批量设置模型标签（整体替换）
router.put('/api/admin/model-tags/:modelId', verifyUser, requirePermission('model:edit'), async (req, res) => {
  const client = await pool().connect();
  try {
    const { modelId } = req.params;
    const modelIdNum = Number(modelId);
    if (!Number.isFinite(modelIdNum)) return res.status(400).json({ error: '无效的模型 ID' });
    const { tag_ids } = req.body;
    if (!Array.isArray(tag_ids)) return res.status(400).json({ error: 'tag_ids 必须是数组' });

    // 验证模型存在
    const m = await client.query('SELECT id FROM portal_models WHERE id = $1', [modelIdNum]);
    if (!m.rowCount) return res.status(404).json({ error: '模型不存在' });

    // 验证所有 tag_id 存在
    if (tag_ids.length) {
      const validIds = tag_ids.map(Number).filter(Number.isFinite);
      if (validIds.length !== tag_ids.length) return res.status(400).json({ error: 'tag_ids 包含无效值' });
      const t = await client.query('SELECT id FROM tags WHERE id = ANY($1)', [validIds]);
      if (t.rowCount !== validIds.length) return res.status(400).json({ error: '部分标签不存在' });
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM resource_tags WHERE resource_type = $1 AND resource_id = $2', ['model', modelIdNum]);
    for (const tagId of tag_ids) {
      await client.query('INSERT INTO resource_tags (resource_type, resource_id, tag_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', ['model', modelIdNum, Number(tagId)]);
    }
    await client.query('COMMIT');

    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: '设置模型标签失败', reason: e.message });
  } finally {
    client.release();
  }
});

// 批量打标签（多模型同一批标签，去重合并）
router.post('/api/admin/model-tags/batch', verifyUser, requirePermission('model:edit'), async (req, res) => {
  const client = await pool().connect();
  try {
    const { model_ids, tag_ids } = req.body;
    if (!Array.isArray(model_ids) || !model_ids.length) return res.status(400).json({ error: '请选择模型' });
    if (!Array.isArray(tag_ids) || !tag_ids.length) return res.status(400).json({ error: '请选择标签' });

    const validModels = model_ids.map(Number).filter(Number.isFinite);
    const validTags = tag_ids.map(Number).filter(Number.isFinite);
    if (!validModels.length || !validTags.length) return res.status(400).json({ error: '参数包含无效值' });

    // 验证标签存在
    const t = await client.query('SELECT id FROM tags WHERE id = ANY($1)', [validTags]);
    if (t.rowCount !== validTags.length) return res.status(400).json({ error: '部分标签不存在' });

    await client.query('BEGIN');
    for (const mid of validModels) {
      for (const tid of validTags) {
        await client.query('INSERT INTO resource_tags (resource_type, resource_id, tag_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', ['model', mid, tid]);
      }
    }
    await client.query('COMMIT');

    res.json({ ok: true, affected: validModels.length });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: '批量打标签失败', reason: e.message });
  } finally {
    client.release();
  }
});

// 批量移除标签
router.post('/api/admin/model-tags/batch-remove', verifyUser, requirePermission('model:edit'), async (req, res) => {
  try {
    const { model_ids, tag_ids } = req.body;
    if (!Array.isArray(model_ids) || !model_ids.length) return res.status(400).json({ error: '请选择模型' });
    if (!Array.isArray(tag_ids) || !tag_ids.length) return res.status(400).json({ error: '请选择标签' });

    await pool().query(`
      DELETE FROM resource_tags WHERE resource_type = 'model' AND resource_id = ANY($1) AND tag_id = ANY($2)
    `, [model_ids.map(Number).filter(Number.isFinite), tag_ids.map(Number).filter(Number.isFinite)]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '批量移除标签失败', reason: e.message });
  }
});

// 查询模型标签（支持批量：?model_ids=1,2,3）
router.get('/api/admin/model-tags', verifyUser, requirePermission('model:edit'), async (req, res) => {
  try {
    const ids = (req.query.model_ids || '').split(',').map(Number).filter(Boolean);
    if (!ids.length) return res.json({ data: {} });

    const result = await pool().query(`
      SELECT rt.resource_id AS model_id, t.id, t.name, t.color
      FROM resource_tags rt
      JOIN tags t ON t.id = rt.tag_id AND t.is_active = TRUE
      WHERE rt.resource_type = 'model' AND rt.resource_id = ANY($1)
      ORDER BY t.sort_order, t.name
    `, [ids]);

    const map = {};
    for (const r of result.rows) {
      (map[r.model_id] ??= []).push({ id: r.id, name: r.name, color: r.color });
    }
    // 补齐无标签的模型
    for (const id of ids) { if (!map[id]) map[id] = []; }

    res.json({ data: map });
  } catch (e) {
    res.status(500).json({ error: '获取模型标签失败', reason: e.message });
  }
});

module.exports = router;