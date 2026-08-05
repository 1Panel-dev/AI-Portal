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

// ---- 角色 CRUD + 权限配置 ----

// 返回全部角色（含 is_system 标记 + 权限位列表 + 用户数）
router.get('/api/admin/roles', verifyUser, requirePermission('role:view'), async (req, res) => {
  try {
    const r = await pool().query(`
      SELECT r.id, r.name, r.description, r.is_system,
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
        `INSERT INTO roles (name, description, is_system) VALUES ($1, $2, FALSE) RETURNING id, name, description, is_system`,
        [name, description]
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
        SELECT r.id, r.name, r.description, r.is_system,
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
      SELECT r.id, r.name, r.description, r.is_system,
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
// 单角色限制: 每个用户只能有一个角色（数组长度≤1，传多个返 400）
router.put('/api/admin/users/:id/roles', verifyUser, requirePermission('user:edit'), async (req, res) => {
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