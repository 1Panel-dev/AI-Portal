const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const storage = require('../lib/storage');
const panelApi = require('../lib/1panel-api');
const { JWT_SECRET, loginLimiter, verifyAuth, verifyAdmin } = require('../auth');
const { panel, getPanelPayload, getPanelItems, getPanelRoles, syncModelsFromPanel, syncSkillsFromPanel, findPanelUser, createPanelUser } = require('../panel');
const bcrypt = require('bcrypt');
const oauthRegistry = require('../oauth');

const router = express.Router();

// 生成短 taskId
function genTaskId() {
  return 'tsk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function inspectPanelBiz(panelRes) {
  const data = panelRes?.data;
  if (!data || typeof data !== 'object') return { ok: true, code: null, message: '' };
  const code = Number(data.code);
  const message = data.message || data.msg || '';
  if (Number.isFinite(code) && code >= 400) {
    return { ok: false, code, message: String(message) };
  }
  return { ok: true, code: Number.isFinite(code) ? code : null, message: String(message) };
}

function isPanelRecordNotFound(err) {
  return String(err?.message || '').toLowerCase().includes('record not found');
}

function normalizeSkillText(value) {
  return String(value || '').toLowerCase().replace(/\.zip$/i, '').trim();
}

function getPanelSkillId(item) {
  return item?.id || item?.ID || item?.skillId || item?.skill_id || item?.recordId || item?.record_id || null;
}

function panelSkillMatches(item, { skillId, title, packageName }) {
  const wanted = [skillId, title, packageName, normalizeSkillText(packageName)]
    .filter(Boolean)
    .map(normalizeSkillText);
  const actual = [
    item.id,
    item.name,
    item.title,
    item.slug,
    item.skillId,
    item.packageName,
    item.fileName,
    item.filename,
    item.displayName,
  ]
    .filter(Boolean)
    .map(normalizeSkillText);
  return actual.some(v => wanted.includes(v));
}

async function resolvePanelSkillId({ skillId, title, packageName }) {
  const PAGE_SIZE = 100;
  const terms = [normalizeSkillText(packageName), skillId, title, packageName, '']
    .filter((v, i, arr) => v !== undefined && v !== null && arr.indexOf(v) === i);

  for (const info of terms) {
    let page = 1;
    let fetched = 0;
    while (page < 50) {
      const response = await panel.post('/api/v2/core/enterprise/skills-hub/search', {
        page, pageSize: PAGE_SIZE, info,
      });
      const biz = inspectPanelBiz(response);
      if (response.status < 200 || response.status >= 300 || !biz.ok) {
        throw new Error(biz.message || `1Panel search HTTP=${response.status} code=${biz.code}`);
      }
      const items = getPanelItems(response.data);
      const found = items.find(item => panelSkillMatches(item, { skillId, title, packageName }));
      const foundId = getPanelSkillId(found);
      if (foundId) return foundId;
      if (info && items.length === 1) {
        const onlyId = getPanelSkillId(items[0]);
        if (onlyId) return onlyId;
      }

      fetched += items.length;
      const payload = response.data && typeof response.data === 'object' ? response.data.data : response.data;
      const total = typeof payload?.total === 'number' ? payload.total : fetched;
      if (fetched >= total || items.length < PAGE_SIZE) break;
      page++;
    }
  }

  return null;
}

async function operatePanelSkillStatus(panelSkillId, operate, errorCode) {
  const response = await panel.post('/api/v2/core/enterprise/skills-hub/status', {
    id: panelSkillId,
    operate,
  });
  const biz = inspectPanelBiz(response);
  if (response.status < 200 || response.status >= 300 || !biz.ok) {
    const reason = biz.message || `HTTP ${response.status} code=${biz.code}`;
    const err = new Error(reason);
    err.code = errorCode;
    throw err;
  }
  return response.data;
}

function approvePanelSkill(panelSkillId) {
  return operatePanelSkillStatus(panelSkillId, 'approve', 'PANEL_SKILL_APPROVE_FAILED');
}

function rejectPanelSkill(panelSkillId) {
  return operatePanelSkillStatus(panelSkillId, 'reject', 'PANEL_SKILL_REJECT_FAILED');
}

function publishPanelSkill(panelSkillId) {
  return operatePanelSkillStatus(panelSkillId, 'publish', 'PANEL_SKILL_PUBLISH_FAILED');
}

function disablePanelSkill(panelSkillId) {
  return operatePanelSkillStatus(panelSkillId, 'disable', 'PANEL_SKILL_DISABLE_FAILED');
}

async function operatePanelSkillStatusWithResolve({ panelSkillId, operate, errorCode, skillRef, preferResolve = false }) {
  let targetId = panelSkillId;
  if (preferResolve) {
    const resolvedId = await resolvePanelSkillId(skillRef);
    if (resolvedId) targetId = resolvedId;
  }

  try {
    return {
      panelSkillId: targetId,
      data: await operatePanelSkillStatus(targetId, operate, errorCode),
      resolved: targetId !== panelSkillId,
    };
  } catch (err) {
    if (!isPanelRecordNotFound(err)) throw err;
    const resolvedId = await resolvePanelSkillId(skillRef);
    if (!resolvedId) throw err;
    return {
      panelSkillId: resolvedId,
      data: await operatePanelSkillStatus(resolvedId, operate, errorCode),
      resolved: resolvedId !== panelSkillId,
    };
  }
}

async function deletePanelSkill(panelSkillId) {
  const response = await panel.post('/api/v2/core/enterprise/skills-hub/delete', { id: panelSkillId });
  const biz = inspectPanelBiz(response);
  if (response.status < 200 || response.status >= 300 || !biz.ok) {
    const reason = biz.message || `HTTP ${response.status} code=${biz.code}`;
    const err = new Error(reason);
    err.code = 'PANEL_SKILL_DELETE_FAILED';
    throw err;
  }
  return response.data;
}

/**
 * 解 zip 包探测 type / runtime,审核时调用一次,结果落 skills 表
 * 失败时返回默认值 { type: 'prompt', runtime: null }——保持与旧 manifest 接口兜底语义一致
 * 不抛错,以免阻断审核主流程
 */
async function detectSkillType(filePath) {
  if (!filePath) return { type: 'prompt', runtime: null };
  try {
    const AdmZip = require('adm-zip');
    const fileBuffer = await storage.download(filePath);
    const zip = new AdmZip(fileBuffer);
    const entries = zip.getEntries().map(e => e.entryName);

    const hasPy = entries.some(e => e.endsWith('.py'));
    const hasNode = entries.some(e => e === 'package.json');
    const hasRequirements = entries.some(e => e === 'requirements.txt');

    if (hasRequirements || hasPy) return { type: 'script', runtime: 'python' };
    if (hasNode) return { type: 'script', runtime: 'node' };
    return { type: 'prompt', runtime: null };
  } catch (err) {
    console.warn('[approve] zip 类型探测失败,回退默认值:', err.message);
    return { type: 'prompt', runtime: null };
  }
}

// 注意：管理员登录已统一到 /api/auth/login
// 普通用户和管理员使用同一个登录接口
// 登录后根据返回的 role 字段判断权限

// 验证管理员 token 中间件

router.get('/api/admin/submissions', verifyAdmin, async (req, res) => {
  try {
    const result = await global.pool.query(`
      SELECT *
      FROM skill_submissions
      WHERE status = 'pending'
      ORDER BY submitted_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching submissions:', err);
    res.status(500).json({ error: '获取待审核列表失败' });
  }
});

// 提交新技能（待审核）

router.post('/api/admin/approve/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const reviewer = 'admin'; // 简化处理，实际可以从 token 中获取

    // 获取待审核的技能
    const submission = await global.pool.query(
      'SELECT * FROM skill_submissions WHERE id = $1',
      [id]
    );

    if (submission.rowCount === 0) {
      return res.status(404).json({ error: '提交记录不存在' });
    }

    const skill = submission.rows[0];

    // 如果该提交已同步到 1Panel,先让 1Panel 后台审核通过,再发布上架。
    // 两步都成功后再写本地 approved/active,避免本地已上线但远端未发布。
    let panelApproveData = null;
    let panelPublishData = null;
    let effectivePanelSkillId = skill.panel_skill_id || null;
    if (skill.panel_skill_id) {
      try {
        const approved = await operatePanelSkillStatusWithResolve({
          panelSkillId: skill.panel_skill_id,
          operate: 'approve',
          errorCode: 'PANEL_SKILL_APPROVE_FAILED',
          skillRef: { skillId: skill.skill_id, title: skill.title, packageName: skill.package_name },
          preferResolve: true,
        });
        panelApproveData = approved.data;
        effectivePanelSkillId = approved.panelSkillId;

        const published = await operatePanelSkillStatusWithResolve({
          panelSkillId: effectivePanelSkillId,
          operate: 'publish',
          errorCode: 'PANEL_SKILL_PUBLISH_FAILED',
          skillRef: { skillId: skill.skill_id, title: skill.title, packageName: skill.package_name },
        });
        panelPublishData = published.data;
        effectivePanelSkillId = published.panelSkillId;
      } catch (e) {
        console.error('[approve] 1Panel 技能审核/发布失败:', e.message);
        return res.status(502).json({
          error: '1Panel 技能审核/发布失败',
          reason: e.message,
          code: e.code || 'PANEL_SKILL_APPROVE_FAILED',
        });
      }
    }

    // 审核时一次性探测 zip 类型并落表,后续 CLI manifest 请求直接读字段,无需再下载 zip
    const detected = await detectSkillType(skill.file_path);
    const panelApprovedStatus = skill.panel_skill_id ? 'published' : (skill.panel_status || null);

    // 插入到正式表（使用 COALESCE 处理可能的 NULL 值）
    await global.pool.query(`
      INSERT INTO skills (
        id, title, slug, description, avatar, avatar_color,
        downloads, stars, version, category, tag, author,
        install_command, install_url, file_path, type, runtime,
        source, panel_skill_id, panel_status,
        created_at, updated_at, is_active
      ) VALUES (
        $1, $2, $3,
        COALESCE($4, ''),
        COALESCE($5, 'S'),
        COALESCE($6, 'av-teal'),
        0, 0,
        COALESCE($7, 'v1.0.0'),
        $8,
        NULL,
        $9,
        COALESCE($10, ''),
        COALESCE($11, ''),
        $12,
        $13, $14,
        'local', $15, $16,
        CURRENT_DATE, CURRENT_DATE, TRUE
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        version = EXCLUDED.version,
        file_path = EXCLUDED.file_path,
        type = EXCLUDED.type,
        runtime = EXCLUDED.runtime,
        source = EXCLUDED.source,
        panel_skill_id = EXCLUDED.panel_skill_id,
        panel_status = EXCLUDED.panel_status,
        is_active = TRUE,
        updated_at = CURRENT_DATE
    `, [skill.skill_id, skill.title, skill.slug, skill.description,
        skill.avatar, skill.avatar_color, skill.version, skill.category,
        skill.author, skill.install_command, skill.install_url, skill.file_path,
        detected.type, detected.runtime, effectivePanelSkillId || null, panelApprovedStatus]);

    // 更新提交记录状态
    await global.pool.query(`
      UPDATE skill_submissions
      SET status = 'approved', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP,
          panel_status = COALESCE($3, panel_status),
          panel_raw_data = CASE
            WHEN $4::jsonb = '{}'::jsonb THEN panel_raw_data
            ELSE COALESCE(panel_raw_data, '{}'::jsonb) || $4::jsonb
          END,
          panel_skill_id = COALESCE($5, panel_skill_id)
      WHERE id = $1
    `, [id, reviewer, panelApprovedStatus, (panelApproveData || panelPublishData) ? { approve: panelApproveData, publish: panelPublishData } : {}, effectivePanelSkillId || null]);

    // 记录版本历史
    await global.pool.query(`
      INSERT INTO skill_versions (skill_id, version, file_path, description)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (skill_id, version) DO UPDATE SET
        file_path = EXCLUDED.file_path,
        description = EXCLUDED.description
    `, [skill.skill_id, skill.version || 'v1.0.0', skill.file_path, skill.description || '']);

    res.json({ success: true, message: '审核通过，技能已上线' });
  } catch (err) {
    console.error('Error approving skill:', err);
    res.status(500).json({ error: '审核失败' });
  }
});

// 拒绝技能
router.post('/api/admin/reject/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const reviewer = 'admin';

    const submission = await global.pool.query(
      'SELECT skill_id, title, package_name, panel_skill_id, panel_status FROM skill_submissions WHERE id = $1',
      [id]
    );
    if (submission.rowCount === 0) {
      return res.status(404).json({ error: '提交记录不存在' });
    }

    const row = submission.rows[0];
    const panelSkillId = row.panel_skill_id;
    let effectivePanelSkillId = panelSkillId || null;
    let panelRejectData = null;
    if (panelSkillId) {
      try {
        const rejected = await operatePanelSkillStatusWithResolve({
          panelSkillId,
          operate: 'reject',
          errorCode: 'PANEL_SKILL_REJECT_FAILED',
          skillRef: { skillId: row.skill_id, title: row.title, packageName: row.package_name },
          preferResolve: true,
        });
        panelRejectData = rejected.data;
        effectivePanelSkillId = rejected.panelSkillId;
      } catch (e) {
        console.error('[reject] 1Panel 技能驳回失败:', e.message);
        return res.status(502).json({
          error: '1Panel 技能驳回失败',
          reason: e.message,
          code: e.code || 'PANEL_SKILL_REJECT_FAILED',
        });
      }
    }

    await global.pool.query(`
      UPDATE skill_submissions
      SET status = 'rejected', reviewed_by = $3, review_note = $2, reviewed_at = CURRENT_TIMESTAMP,
          panel_status = $4,
          panel_raw_data = COALESCE(panel_raw_data, '{}'::jsonb) || $5::jsonb,
          panel_skill_id = COALESCE($6, panel_skill_id)
      WHERE id = $1
    `, [id, note, reviewer, effectivePanelSkillId ? 'rejected' : (row.panel_status || null), panelRejectData ? { reject: panelRejectData } : {}, effectivePanelSkillId || null]);

    res.json({ success: true, message: '已拒绝' });
  } catch (err) {
    console.error('Error rejecting skill:', err);
    res.status(500).json({ error: '操作失败', reason: err.message });
  }
});

// 获取审核历史（所有记录）
router.get('/api/admin/submissions/all', verifyAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT s.*,
        CASE
          WHEN s.status = 'approved' THEN '已通过'
          WHEN s.status = 'rejected' THEN '已拒绝'
          WHEN s.status = 'deleted' THEN '已删除'
          ELSE '待审核'
        END as status_text
      FROM skill_submissions s
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ' AND s.status = $1';
      params.push(status);
    }

    query += ' ORDER BY s.submitted_at DESC';

    const result = await global.pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching submission history:', err);
    res.status(500).json({ error: '获取审核历史失败' });
  }
});

// ============ API 路由 ============

// 健康检查

router.get('/api/admin/skills', verifyAdmin, async (req, res) => {
  try {
    const { status = 'all', page = '1', limit = '20', search = '', category = 'all' } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    // 构建 WHERE 条件
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status === 'active') {
      whereClause += ' AND is_active = TRUE';
    } else if (status === 'inactive') {
      whereClause += ' AND is_active = FALSE';
    }

    if (category && category !== 'all') {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (title ILIKE $${paramIndex} OR id ILIKE $${paramIndex} OR author ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // 用 COUNT(*) OVER() 合并计数和分页，单次 SQL 完成
    const query = `
      SELECT
        id, title, slug, description, avatar, avatar_color,
        downloads, stars, version, category, tag, author,
        install_command as "installCommand",
        install_url as "installUrl",
        created_at as "createdAt",
        updated_at as "updatedAt",
        is_active,
        COUNT(*) OVER() AS _total
      FROM skills
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limitNum, offset);

    const result = await global.pool.query(query, params);
    const total = result.rows.length > 0 ? parseInt(result.rows[0]._total) : 0;
    const data = result.rows.map(({ _total, ...row }) => row);

    res.json({
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasMore: pageNum * limitNum < total
      }
    });
  } catch (err) {
    console.error('Error fetching admin skills:', err);
    res.status(500).json({ error: '获取技能列表失败' });
  }
});

// 更新技能信息
router.put('/api/admin/skills/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      category,
      install_command,
      install_url,
      version,
      // 支持前端驼峰命名
      installCommand,
      installUrl,
    } = req.body;

    // 兼容前端驼峰命名
    const cmd = install_command || installCommand;
    const url = install_url || installUrl;

    const result = await global.pool.query(`
      UPDATE skills
      SET
        title = $2,
        description = $3,
        category = $4,
        install_command = $5,
        install_url = $6,
        version = $7,
        updated_at = CURRENT_DATE
      WHERE id = $1
      RETURNING *
    `, [id, title, description, category, cmd, url, version]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '技能不存在' });
    }

    res.json({ success: true, skill: result.rows[0] });
  } catch (err) {
    console.error('Error updating skill:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

// 下架/上架技能
router.post('/api/admin/skills/:id/toggle', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const current = await global.pool.query(
      'SELECT id, title, is_active, panel_skill_id FROM skills WHERE id = $1',
      [id]
    );

    if (current.rowCount === 0) {
      return res.status(404).json({ error: '技能不存在' });
    }

    const skill = current.rows[0];
    const nextActive = !skill.is_active;
    const operate = nextActive ? 'publish' : 'disable';
    let panelStatusData = null;
    let effectivePanelSkillId = skill.panel_skill_id || null;

    if (skill.panel_skill_id) {
      try {
        const operated = await operatePanelSkillStatusWithResolve({
          panelSkillId: skill.panel_skill_id,
          operate,
          errorCode: nextActive ? 'PANEL_SKILL_PUBLISH_FAILED' : 'PANEL_SKILL_DISABLE_FAILED',
          skillRef: { skillId: skill.id, title: skill.title, packageName: skill.title },
        });
        panelStatusData = operated.data;
        effectivePanelSkillId = operated.panelSkillId;
      } catch (e) {
        console.error(`[toggle-skill] 1Panel 技能${nextActive ? '上架' : '下架'}失败:`, e.message);
        return res.status(502).json({
          error: `1Panel 技能${nextActive ? '上架' : '下架'}失败`,
          reason: e.message,
          code: e.code || (nextActive ? 'PANEL_SKILL_PUBLISH_FAILED' : 'PANEL_SKILL_DISABLE_FAILED'),
        });
      }
    }

    const result = await global.pool.query(`
      UPDATE skills
      SET is_active = $2,
          panel_status = CASE WHEN $3::integer IS NULL THEN panel_status ELSE $4 END,
          panel_skill_id = COALESCE($5, panel_skill_id),
          updated_at = CURRENT_DATE
      WHERE id = $1
      RETURNING id, is_active
    `, [id, nextActive, effectivePanelSkillId || null, operate, effectivePanelSkillId || null]);

    const status = result.rows[0].is_active ? '上架' : '下架';
    res.json({ success: true, message: `技能已${status}`, is_active: result.rows[0].is_active });
  } catch (err) {
    console.error('Error toggling skill:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 删除技能
router.delete('/api/admin/skills/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // 先查询技能信息，获取文件路径和 1Panel 远端 id
    const result = await global.pool.query('SELECT file_path, panel_skill_id FROM skills WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '技能不存在' });
    }

    const skill = result.rows[0];

    // 有远端关联时先删 1Panel,成功后再删本地,避免本地没了但 1Panel 仍残留
    if (skill.panel_skill_id) {
      try {
        await deletePanelSkill(skill.panel_skill_id);
      } catch (e) {
        console.error('[delete-skill] 1Panel 技能删除失败:', e.message);
        return res.status(502).json({
          error: '1Panel 技能删除失败',
          reason: e.message,
          code: e.code || 'PANEL_SKILL_DELETE_FAILED',
        });
      }
    }

    if (skill.file_path) {
      // 删除存储文件（本地或 COS）
      await storage.delete(skill.file_path);
    }

    await global.pool.query(`
      UPDATE skill_submissions
      SET status = 'deleted',
          reviewed_at = CURRENT_TIMESTAMP,
          review_note = COALESCE(NULLIF(review_note, ''), '管理员已删除该技能')
      WHERE skill_id = $1
        AND status = 'approved'
    `, [id]);

    await global.pool.query('DELETE FROM skills WHERE id = $1', [id]);

    res.json({ success: true, message: '技能已删除' });
  } catch (err) {
    console.error('Error deleting skill:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// ============ 系统配置 API ============

// 获取存储配置
router.get('/api/admin/config', verifyAdmin, async (req, res) => {
  try {
    res.json(storage.getConfig());
  } catch (err) {
    console.error('Error fetching config:', err);
    res.status(500).json({ error: '获取配置失败' });
  }
});

// 保存存储配置
router.post('/api/admin/config', verifyAdmin, async (req, res) => {
  try {
    const { storageType, cosSecretId, cosSecretKey, cosBucket, cosRegion, localPath } = req.body;

    const configs = [
      ['storage_type', storageType || 'local'],
      ['cos_secret_id', cosSecretId || ''],
      ['cos_secret_key', cosSecretKey || ''],
      ['cos_bucket', cosBucket || ''],
      ['cos_region', cosRegion || 'ap-guangzhou'],
      ['local_path', localPath || ''],
    ];

    for (const [key, value] of configs) {
      await global.pool.query(`
        INSERT INTO system_config (key, value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
      `, [key, value]);
    }

    // 热重载存储配置
    await storage.reload(global.pool);

    res.json({ success: true, message: '配置已保存', config: storage.getConfig() });
  } catch (err) {
    console.error('Error saving config:', err);
    res.status(500).json({ error: '保存配置失败' });
  }
});

// 测试 COS 连接
router.post('/api/admin/config/test-cos', verifyAdmin, async (req, res) => {
  try {
    const { cosSecretId, cosSecretKey, cosBucket, cosRegion } = req.body;

    if (!cosSecretId || !cosSecretKey || !cosBucket || !cosRegion) {
      return res.status(400).json({ success: false, error: '请填写完整的 COS 配置' });
    }

    // 如果 secretKey 是掩码值（****开头），使用后端存储的真实值
    let realSecretKey = cosSecretKey;
    if (cosSecretKey.startsWith('****')) {
      const rawConfig = storage.getRawConfig();
      realSecretKey = rawConfig.cosSecretKey;
    }

    const COS = require('cos-nodejs-sdk-v5');
    const client = new COS({ SecretId: cosSecretId, SecretKey: realSecretKey });

    // 尝试 headBucket 验证连接和权限
    await new Promise((resolve, reject) => {
      client.headBucket(
        { Bucket: cosBucket, Region: cosRegion },
        (err) => (err ? reject(err) : resolve())
      );
    });

    res.json({ success: true, message: 'COS 连接成功' });
  } catch (err) {
    const msg = err.statusCode === 403 ? '密钥无权限' :
                err.statusCode === 404 ? 'Bucket 不存在' :
                err.message || '连接失败';
    res.json({ success: false, error: msg });
  }
});

// ============ 1Panel 网关配置 API ============

// 获取 1Panel 配置(含同步开关、间隔、最近一次同步时间)
router.get('/api/admin/panel-config', verifyAdmin, async (req, res) => {
  try {
    const [cfgRes, syncRes, panelRoles] = await Promise.all([
      global.pool.query("SELECT key, value FROM system_config WHERE key LIKE 'panel_%'"),
      global.pool.query(`
        SELECT sync_type, created_at, status, message, total_count, success_count
        FROM portal_sync_log
        WHERE sync_type IN ('models', 'skills')
        ORDER BY created_at DESC
        LIMIT 10
      `),
      // 优先实时查询 1Panel，失败时从本地缓存读取
      (async () => {
        try {
          return await getPanelRoles();
        } catch {
          const cached = await global.pool.query(
            "SELECT value FROM system_config WHERE key = 'panel_roles_cache'"
          );
          if (cached.rowCount > 0) {
            try { return JSON.parse(cached.rows[0].value); } catch { return []; }
          }
          return [];
        }
      })(),
    ]);

    const map = {};
    for (const row of cfgRes.rows) map[row.key] = row.value;
    const panelCfg = panelApi.getConfig();

    // 取每个 sync_type 的最近一条
    const lastSync = {};
    for (const row of syncRes.rows) {
      if (!lastSync[row.sync_type]) lastSync[row.sync_type] = row;
    }

    res.json({
      baseUrl: map.panel_base_url || panelCfg.baseUrl,
      apiKey: panelCfg.apiKey, // 已脱敏
      apiKeyConfigured: panelCfg.apiKeyConfigured,
      timeout: parseInt(map.panel_api_timeout || panelCfg.timeout, 10),
      syncEnabled: map.panel_sync_enabled !== 'false',
      syncIntervalMinutes: parseInt(map.panel_sync_interval_minutes || '10', 10),
      skillUploadEnabled: map.panel_skill_upload_enabled === 'true',
      panelUserRoleId: parseInt(map.panel_user_role_id || '4', 10),
      skillSubmitEnabled: map.panel_skill_submit_enabled === 'true',
      skillctlDocUrl: map.site_skillctl_doc_url || '',
      panelRoles,
      lastSync,
    });
  } catch (err) {
    console.error('Error fetching panel config:', err);
    res.status(500).json({ error: '获取 1Panel 配置失败' });
  }
});

// 获取「调用示例」配置(管理员视图,允许编辑)
router.get('/api/admin/model-example', verifyAdmin, async (req, res) => {
  try {
    const result = await global.pool.query(`
      SELECT key, value FROM system_config
      WHERE key IN ('model_example_endpoint', 'model_example_template')
    `);
    const map = {};
    for (const row of result.rows) map[row.key] = row.value;
    res.json({
      endpoint: map.model_example_endpoint || '',
      template: map.model_example_template || '',
    });
  } catch (err) {
    console.error('Error fetching model example config:', err);
    res.status(500).json({ error: '获取调用示例配置失败' });
  }
});

// 保存「调用示例」配置
router.post('/api/admin/model-example', verifyAdmin, async (req, res) => {
  try {
    const { endpoint, template } = req.body;
    // 简单校验:endpoint 非空且像 URL,template 非空
    if (typeof endpoint !== 'string' || !endpoint.trim()) {
      return res.status(400).json({ error: '调用地址不能为空' });
    }
    if (!/^https?:\/\//i.test(endpoint.trim())) {
      return res.status(400).json({ error: '调用地址需以 http:// 或 https:// 开头' });
    }
    if (typeof template !== 'string' || !template.trim()) {
      return res.status(400).json({ error: '示例模板不能为空' });
    }

    const configs = [
      ['model_example_endpoint', endpoint.trim()],
      ['model_example_template', template],
    ];
    for (const [key, value] of configs) {
      await global.pool.query(`
        INSERT INTO system_config (key, value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
      `, [key, value]);
    }
    res.json({ success: true, message: '调用示例配置已保存' });
  } catch (err) {
    console.error('Error saving model example config:', err);
    res.status(500).json({ error: '保存调用示例配置失败' });
  }
});

// 保存 1Panel 配置
router.post('/api/admin/panel-config', verifyAdmin, async (req, res) => {
  try {
    const {
      baseUrl, apiKey, timeout,
      syncEnabled, syncIntervalMinutes, skillUploadEnabled, panelUserRoleId,
      skillSubmitEnabled, skillctlDocUrl,
    } = req.body;

    const configs = [['panel_base_url', baseUrl || '']];

    // apiKey 是 **** 掩码 → 不更新(保留旧值);否则覆盖
    if (apiKey && !apiKey.startsWith('****')) {
      configs.push(['panel_api_key', apiKey]);
    }
    if (timeout !== undefined && timeout !== null) {
      const t = parseInt(timeout, 10);
      if (!Number.isNaN(t) && t > 0) configs.push(['panel_api_timeout', String(t)]);
    }
    if (typeof syncEnabled === 'boolean') {
      configs.push(['panel_sync_enabled', syncEnabled ? 'true' : 'false']);
    }
    if (typeof skillUploadEnabled === 'boolean') {
      configs.push(['panel_skill_upload_enabled', skillUploadEnabled ? 'true' : 'false']);
    }
    if (syncIntervalMinutes !== undefined && syncIntervalMinutes !== null) {
      const m = parseInt(syncIntervalMinutes, 10);
      if (!Number.isNaN(m) && m > 0) configs.push(['panel_sync_interval_minutes', String(m)]);
    }
    if (panelUserRoleId !== undefined && panelUserRoleId !== null) {
      const r = parseInt(panelUserRoleId, 10);
      if (!Number.isNaN(r) && r > 0) configs.push(['panel_user_role_id', String(r)]);
    }
    if (typeof skillSubmitEnabled === 'boolean') {
      configs.push(['portal_skill_submit_enabled', skillSubmitEnabled ? 'true' : 'false']);
    }
    if (skillctlDocUrl !== undefined && skillctlDocUrl !== null) {
      configs.push(['site_skillctl_doc_url', String(skillctlDocUrl).trim()]);
    }

    for (const [key, value] of configs) {
      await global.pool.query(`
        INSERT INTO system_config (key, value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
      `, [key, value]);
    }

    // 热重载 1Panel API 客户端配置(会触发调度器重启)
    await panelApi.reload(global.pool);

    res.json({ success: true, message: '1Panel 配置已保存' });
  } catch (err) {
    console.error('Error saving panel config:', err);
    res.status(500).json({ error: '保存 1Panel 配置失败' });
  }
});

// 测试 1Panel 连接(用传入的配置临时测试,不持久化)
router.post('/api/admin/panel-config/test', verifyAdmin, async (req, res) => {
  try {
    const { baseUrl, apiKey, timeout } = req.body;
    if (!baseUrl) {
      return res.json({ success: false, error: '请填写 1Panel 网关地址' });
    }

    // 掩码 apiKey 时用 DB 里的真实值
    let realKey = apiKey;
    if (!realKey || realKey.startsWith('****')) {
      const raw = panelApi.getRawConfig();
      realKey = raw.apiKey;
    }
    if (!realKey) {
      return res.json({ success: false, error: '请填写 API Key' });
    }

    // 用 panel.post 但临时覆盖 baseUrl/apiKey
    const response = await panel.post(
      '/api/v2/core/enterprise/ai-proxy/backends/search',
      { page: 1, pageSize: 10, info: '' },
      { baseUrl, apiKey: realKey, timeout: timeout || 10000 }
    );
    if (response.status >= 200 && response.status < 300) {
      const items = getPanelItems(response.data);
      res.json({ success: true, message: `连接成功,发现 ${items.length} 个 AI 网关` });
    } else {
      res.json({ success: false, error: `HTTP ${response.status}` });
    }
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// 立即同步(手动触发,不等定时器)
router.post('/api/admin/panel-config/sync-now', verifyAdmin, async (req, res) => {
  const startTime = Date.now();
  console.log('[admin] 管理员触发手动同步,userId=', req.user?.id, '|', new Date().toISOString());
  try {
    // 并发跑模型 + 技能 + 角色同步,失败不互相影响
    const [modelsResult, skillsResult, rolesResult] = await Promise.allSettled([
      syncModelsFromPanel(),
      syncSkillsFromPanel(),
      // 同步角色列表并缓存到本地（方便管理后台加载最新数据）
      (async () => {
        const roles = await getPanelRoles();
        const cacheKey = 'panel_roles_cache';
        if (roles.length > 0) {
          await global.pool.query(`
            INSERT INTO system_config (key, value, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
          `, [cacheKey, JSON.stringify(roles)]);
          return { ok: true, count: roles.length };
        }
        return { ok: false, error: '角色列表为空' };
      })(),
    ]);

    const summary = {
      models: modelsResult.status === 'fulfilled'
        ? { ...modelsResult.value, ok: true }
        : { ok: false, error: modelsResult.reason?.message },
      skills: skillsResult.status === 'fulfilled'
        ? { ...skillsResult.value, ok: true }
        : { ok: false, error: skillsResult.reason?.message },
      roles: rolesResult.status === 'fulfilled'
        ? rolesResult.value
        : { ok: false, error: rolesResult.reason?.message },
    };

    // 打印汇总日志，方便运维一眼看出哪个子任务失败
    console.log('[admin] sync-now 结果:', JSON.stringify(summary), `| 耗时 ${Date.now() - startTime}ms`);

    res.json({
      success: true,
      elapsedMs: Date.now() - startTime,
      ...summary,
    });
  } catch (err) {
    console.error('Error sync-now:', err);
    res.status(500).json({ error: '同步失败: ' + err.message });
  }
});

// ============ 数据统计 API ============

// 获取管理后台统计数据
router.get('/api/admin/stats', verifyAdmin, async (req, res) => {
  try {
    // 5 个查询互相独立，并发执行可显著降低 P99
    const [
      skillsStats,
      submissionStats,
      recentSkills,
      categoryStats,
      topAuthors,
    ] = await Promise.all([
      global.pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN is_active THEN 1 END) as active,
          COUNT(CASE WHEN NOT is_active THEN 1 END) as inactive,
          SUM(downloads) as total_downloads
        FROM skills
      `),
      global.pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
        FROM skill_submissions
      `),
      global.pool.query(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM skills
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date
      `),
      global.pool.query(`
        SELECT category, COUNT(*) as count
        FROM skills
        WHERE is_active = TRUE
        GROUP BY category
        ORDER BY count DESC
      `),
      global.pool.query(`
        SELECT author, COUNT(*) as skill_count
        FROM skills
        WHERE is_active = TRUE
        GROUP BY author
        ORDER BY skill_count DESC
        LIMIT 10
      `),
    ]);

    res.json({
      skills: skillsStats.rows[0],
      submissions: submissionStats.rows[0],
      recent: recentSkills.rows,
      categories: categoryStats.rows,
      topAuthors: topAuthors.rows,
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});



function isRemoteRecordNotFound(message) {
  const msg = String(message || '').toLowerCase();
  return msg.includes('record not found')
      || msg.includes('记录未能')
      || msg.includes('不存在')
      || msg.includes('not found');
}

// 从 1Panel user 对象提取中文名：description 格式为 "通过AI网关创建：张三"
function extractDisplayName(pu) {
  const desc = String(pu.description || '').trim();
  const prefix = '通过AI网关创建：';
  if (desc.startsWith(prefix)) return desc.slice(prefix.length).trim();
  if (desc.length > 0) return desc;
  return null;
}
router.get('/api/admin/portal-users/map', verifyAdmin, async (req, res) => {
  try {
    const result = await global.pool.query(
      `SELECT id, panel_user_id, COALESCE(NULLIF(display_name, ''), name) AS display_name
       FROM portal_users
       WHERE status = 'active'
       ORDER BY id`
    );
    const map = {};
    for (const row of result.rows) {
      map[row.id] = row.display_name;
      if (row.panel_user_id) map[`panel_${row.panel_user_id}`] = row.display_name;
    }
    res.json(map);
  } catch (err) {
    console.error('获取用户中文名映射失败:', err);
    res.status(500).json({ error: '获取用户中文名映射失败' });
  }
});

// 获取 1Panel AI 使用统计数据（代理透传）
router.get('/api/admin/usage-statistics', verifyAdmin, async (req, res) => {
  try {
    const { days, userId } = req.query;
    // 1Panel usage/statistics 支持 userId 参数做服务端筛选
    const body = userId ? { info: '', userId: parseInt(userId, 10), provider: '', model: '' } : {};
    const response = await panel.post('/api/v2/core/enterprise/ai-proxy/usage/statistics', body);

    if (response.status < 200 || response.status >= 300) {
      return res.status(response.status).json({
        error: '获取统计数据失败',
        reason: `1Panel HTTP ${response.status}`
      });
    }

    const biz = inspectPanelBiz(response);
    if (!biz.ok) {
      return res.status(502).json({
        error: '1Panel 业务错误',
        reason: biz.message,
        code: biz.code
      });
    }

    const payload = getPanelPayload(response.data);
    res.json(payload);
  } catch (err) {
    console.error('获取使用统计失败:', err);
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
      return res.status(502).json({ error: '1Panel 不可达', reason: err.message, code: 'PANEL_UNREACHABLE' });
    }
    res.status(500).json({ error: '获取使用统计失败', reason: err.message });
  }
});

// 分页查询本地门户用户
router.get('/api/admin/portal-users', verifyAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
    const keyword = String(req.query.keyword || '').trim();
    const sort = req.query.sort === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * pageSize;
    const params = [];
    let where = '';
    if (keyword) {
      params.push(`%${keyword}%`);
      where = `WHERE u.username ILIKE $${params.length} OR u.name ILIKE $${params.length}`;
    }

    const totalRes = await global.pool.query(`SELECT COUNT(*)::int AS total FROM portal_users u ${where}`, params);
    params.push(pageSize, offset);
    const result = await global.pool.query(`
      SELECT
        u.id, u.panel_user_id, u.username, u.name, u.role, u.status,
        u.last_login_at, u.created_at,
        COUNT(DISTINCT k.id)::int AS api_key_count,
        COUNT(DISTINCT s.id)::int AS submission_count
      FROM portal_users u
      LEFT JOIN portal_api_keys k ON k.user_id = u.id
      LEFT JOIN skill_submissions s ON s.submitted_by_user_id = u.id
      ${where}
      GROUP BY u.id
      ORDER BY u.created_at ${sort}, u.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({ items: result.rows, total: totalRes.rows[0].total, page, pageSize });
  } catch (err) {
    console.error('获取用户列表失败:', err);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 删除本地用户（同时删除远端用户和 API Key）
router.delete('/api/admin/portal-users/:id', verifyAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    // 1. 查询本地用户及其 API Key
    const userRes = await global.pool.query('SELECT * FROM portal_users WHERE id = $1', [userId]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const localUser = userRes.rows[0];

    // 2. 删除远端 API Key —— 并发删除,各 key 互不依赖
    // 单 key 失败不阻塞其他 key 和后续流程(语义与旧版串行 try/catch 一致)
    const keyRes = await global.pool.query('SELECT panel_key_id FROM portal_api_keys WHERE user_id = $1', [userId]);
    const deleteKeyTasks = keyRes.rows
      .filter(row => row.panel_key_id)
      .map(async row => {
        try {
          const response = await panel.post('/api/v2/core/enterprise/ai-proxy/api-keys/delete', { id: row.panel_key_id });
          const biz = inspectPanelBiz(response);
          if (response.status >= 200 && response.status < 300 && biz.ok) return;
          if (isRemoteRecordNotFound(biz.message)) {
            console.warn(`远端 API Key ${row.panel_key_id} 已不存在，跳过`);
            return;
          }
          throw new Error(biz.message || `API Key ${row.panel_key_id} 删除失败 HTTP=${response.status}`);
        } catch (e) {
          // 网络异常也算跳过，不给本地删除增加负担
          if (isNetworkError(e.message)) {
            console.warn(`远端 API Key ${row.panel_key_id} 不可达，跳过`);
            return;
          }
          throw e;
        }
      });
    try {
      await Promise.all(deleteKeyTasks);
    } catch (e) {
      console.error('远端 API Key 删除失败:', e.message);
      return res.status(502).json({ error: '远端 API Key 删除失败', reason: e.message, code: 'PANEL_USER_KEY_DELETE_FAILED' });
    }

    // 3. 删除远端用户（远端已不存在时跳过，不阻断本地删除）
    if (localUser.panel_user_id) {
      try {
        const response = await panel.post('/api/v2/core/enterprise/users/del', { ids: [localUser.panel_user_id] });
        const biz = inspectPanelBiz(response);
        if (response.status >= 200 && response.status < 300 && biz.ok) {
          // 删除成功
        } else if (isRemoteRecordNotFound(biz.message)) {
          console.warn(`远端用户 ${localUser.panel_user_id} 已不存在，跳过`);
        } else {
          throw new Error(biz.message || `HTTP=${response.status} code=${biz.code}`);
        }
      } catch (e) {
        console.error('远端用户删除失败:', e.message);
        return res.status(502).json({ error: '远端用户删除失败', reason: e.message, code: 'PANEL_USER_DELETE_FAILED' });
      }
    }

    // 4. 删除本地记录（portal_api_keys 会被 CASCADE 自动删除）
    await global.pool.query('DELETE FROM portal_users WHERE id = $1', [userId]);

    res.json({ success: true, message: '用户已删除', deleted: { username: localUser.username, panelUserId: localUser.panel_user_id } });
  } catch (err) {
    console.error('删除用户失败:', err);
    res.status(500).json({ error: '删除用户失败' });
  }
});

// 从 1Panel 同步用户（异步任务模式）
// 切 1Panel 实例时：旧 host 的 active 用户自动禁用，新 host 的用户增量导入
router.post('/api/admin/portal-users/sync', verifyAdmin, async (req, res) => {
  const taskId = genTaskId();
  // 先落一条 running 任务
  await global.pool.query(
    `INSERT INTO portal_sync_tasks (task_id, type, status, message) VALUES ($1, 'users', 'running', $2)`,
    [taskId, '正在同步用户...']
  );

  // 立即返回 taskId，前端轮询 /api/admin/sync-tasks/:id
  res.json({ taskId, status: 'running', message: '任务已提交，正在后台同步...' });

  // 后台执行，不阻塞响应
  runUserSyncTask(taskId).catch(err => {
    console.error(`[sync-users:${taskId}] 后台同步异常:`, err.message);
  });
});

// 后台执行用户同步
async function runUserSyncTask(taskId) {
  const startTime = Date.now();
  try {
    const result = await doSyncUsers();
    const elapsed = Date.now() - startTime;
    await global.pool.query(
      `UPDATE portal_sync_tasks SET status = 'done', message = $2, result = $3, updated_at = CURRENT_TIMESTAMP WHERE task_id = $1`,
      [taskId, `同步完成，耗时 ${elapsed}ms`, result]
    );
  } catch (err) {
    await global.pool.query(
      `UPDATE portal_sync_tasks SET status = 'error', message = $2, updated_at = CURRENT_TIMESTAMP WHERE task_id = $1`,
      [taskId, err.message]
    );
  }
}

// 核心同步逻辑（提取为独立函数，前后台共用）
async function doSyncUsers() {
  const currentHost = (panel.getRawConfig() && panel.getRawConfig().baseUrl) || '';

  if (currentHost) {
    await global.pool.query(
      `UPDATE portal_users SET panel_host = $1 WHERE panel_host IS NULL AND panel_user_id IS NOT NULL`,
      [currentHost]
    );
    const disableResult = await global.pool.query(
      `UPDATE portal_users SET status = 'disabled'
       WHERE panel_host IS NOT NULL
         AND panel_host IS DISTINCT FROM $1
         AND status = 'active'
       RETURNING id`,
      [currentHost]
    );
    if (disableResult.rows.length > 0) {
      const ids = disableResult.rows.map(r => r.id);
      await global.pool.query(`DELETE FROM portal_api_keys WHERE user_id = ANY($1::int[])`, [ids]);
    }
  }

  const response = await panel.post('/api/v2/core/enterprise/users/search', {
    page: 1, pageSize: 200, info: '',
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error('1Panel 用户查询失败');
  }
  const biz = inspectPanelBiz(response);
  if (!biz.ok) {
    throw new Error('1Panel 业务错误: ' + biz.message);
  }
  const panelUsers = getPanelItems(response.data);

  const localUsers = await global.pool.query(
    'SELECT id, username, panel_user_id, panel_host FROM portal_users'
  );
  const localByUsername = new Map();
  const localPanelIds = new Set();
  for (const row of localUsers.rows) {
    localByUsername.set(row.username, row);
    if (row.panel_user_id) localPanelIds.add(row.panel_user_id);
  }

  let synced = 0, bound = 0;
  for (const pu of panelUsers) {
    const name = String(pu.name || '').trim();
    if (!name) continue;
    const local = localByUsername.get(name);

    if (local) {
      if (pu.id && (!local.panel_user_id || (local.panel_host && local.panel_host !== currentHost))) {
        await global.pool.query(
          'UPDATE portal_users SET panel_user_id = $1, display_name = $4, panel_host = $3, status = \'active\' WHERE id = $2',
          [pu.id, local.id, currentHost, extractDisplayName(pu) || local.display_name || null]
        );
        localByUsername.set(name, { ...local, panel_user_id: pu.id, panel_host: currentHost, status: 'active' });
        bound++;
      }
      continue;
    }

    if (!localPanelIds.has(pu.id)) {
      const DEFAULT_PWD = process.env.SYNC_USER_DEFAULT_PASSWORD || '';
      const passwordHash = await bcrypt.hash(DEFAULT_PWD, 12);
      try {
        await global.pool.query(`
          INSERT INTO portal_users (panel_user_id, username, name, display_name, password_hash, role, status, panel_host, created_at)
          VALUES ($1, $2, $3, $4, $5, 'user', 'active', $6, CURRENT_TIMESTAMP)
          ON CONFLICT (username) DO NOTHING
        `, [pu.id, name, pu.name, extractDisplayName(pu), passwordHash, currentHost]);
        synced++;
      } catch (e) {
        console.error(`同步用户 ${pu.name} 失败:`, e.message);
      }
    }
  }

  // 同步 API Key
  let keysSynced = 0;
  try {
    const allPanelKeys = [];
    let kPage = 1;
    const KEY_PAGE_SIZE = 100;
    while (kPage < 50) {
      const keyRes = await panel.post('/api/v2/core/enterprise/ai-proxy/api-keys/search', {
        page: kPage, pageSize: KEY_PAGE_SIZE, info: '',
      });
      const keyBiz = inspectPanelBiz(keyRes);
      if (keyRes.status < 200 || keyRes.status >= 300 || !keyBiz.ok) break;
      const items = getPanelItems(keyRes.data);
      allPanelKeys.push(...items);
      if (items.length < KEY_PAGE_SIZE) break;
      kPage++;
    }
    const keyByPanelUser = new Map();
    for (const k of allPanelKeys) {
      if (k.userId && !keyByPanelUser.has(k.userId)) keyByPanelUser.set(k.userId, k);
    }
    const needingKeys = await global.pool.query(`
      SELECT pu.id, pu.panel_user_id FROM portal_users pu
      LEFT JOIN portal_api_keys pak ON pak.user_id = pu.id
      WHERE pu.panel_user_id IS NOT NULL AND pak.id IS NULL
    `);
    for (const user of needingKeys.rows) {
      const panelKey = keyByPanelUser.get(user.panel_user_id);
      if (!panelKey) continue;
      try {
        await global.pool.query(`
          INSERT INTO portal_api_keys (user_id, panel_key_id, panel_user_id, api_key_mask, api_key_cipher, group_id, status, remark, token_limit, raw_data, synced_at)
          VALUES ($1, $2, $3, $4, '', $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
        `, [user.id, panelKey.id, user.panel_user_id, panelKey.apiKeyMask || '', panelKey.groupId || 1, panelKey.status || 'Enable', panelKey.remark || '', panelKey.tokenLimit || 0, panelKey]);
        keysSynced++;
      } catch (e) {
        console.error(`[sync-users] 同步用户 ${user.id} API Key 失败:`, e.message);
      }
    }
  } catch (e) {
    console.error('[sync-users] 批量同步 API Key 失败:', e.message);
  }

  return { synced, bound, keysSynced, message: `同步完成，新增 ${synced} 个，补全绑定 ${bound} 个，同步 Key ${keysSynced} 个` };
}

// 查询同步任务状态
router.get('/api/admin/sync-tasks/:taskId', verifyAdmin, async (req, res) => {
  try {
    const { taskId } = req.params;
    const result = await global.pool.query(
      'SELECT task_id, type, status, message, result, created_at, updated_at FROM portal_sync_tasks WHERE task_id = $1',
      [taskId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '任务不存在' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('查询同步任务失败:', err);
    res.status(500).json({ error: '查询同步任务失败' });
  }
});

// 管理员修改用户密码（支持批量，同时同步到 1Panel 远端）
router.post('/api/admin/portal-users/password', verifyAdmin, async (req, res) => {
  try {
    const { user_ids, new_password } = req.body;

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于 6 位' });
    }

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: '请指定用户' });
    }

    const hash = await bcrypt.hash(new_password, 12);
    let success = 0, failed = 0;

    for (const userId of user_ids) {
      try {
        const userRes = await global.pool.query('SELECT * FROM portal_users WHERE id = $1', [userId]);
        if (userRes.rowCount === 0) { failed++; continue; }
        const localUser = userRes.rows[0];

        // 同步更新远端密码（1Panel 的 users/update 要求 name 等字段不能为空，先 search 拿全量信息）
        if (localUser.panel_user_id) {
          try {
            const userInfoRes = await panel.post('/api/v2/core/enterprise/users/search', {
              page: 1,
              pageSize: 10,
              info: localUser.username || '',
            });
            const panelUsers = getPanelItems(userInfoRes.data);
            const panelUser = panelUsers.find(u => String(u.id) === String(localUser.panel_user_id));

            if (panelUser) {
              const encodedPassword = Buffer.from(new_password, 'utf-8').toString('base64');
              const panelRes = await panel.post('/api/v2/core/enterprise/users/update', {
                id: localUser.panel_user_id,
                name: panelUser.name || localUser.username,
                sessionTimeout: panelUser.sessionTimeout || 86400,
                isSuperAdmin: panelUser.isSuperAdmin || false,
                nodeRoles: (panelUser.nodeRoles || []).map(r => ({ nodeId: r.nodeId, roleId: r.roleId })),
                description: panelUser.description || '',
                createdAt: panelUser.createdAt,
                password: encodedPassword,
              });
              const biz = inspectPanelBiz(panelRes);
              if (panelRes.status < 200 || panelRes.status >= 300 || !biz.ok) {
                console.error(`[panel-password] 用户 ${userId} 远端密码同步失败: ${biz.reason || panelRes.status}`);
                failed++; continue;
              }
            } else {
              console.warn(`[panel-password] 1Panel 未找到用户 ${localUser.username} (Panel ID: ${localUser.panel_user_id})`);
              failed++; continue;
            }
          } catch (e) {
            console.error(`[panel-password] 用户 ${userId} 远端密码同步异常:`, e.message);
            failed++; continue;
          }
        }

        await global.pool.query('UPDATE portal_users SET password_hash = $1 WHERE id = $2', [hash, userId]);
        success++;
      } catch (e) {
        failed++;
        console.error(`用户 ${userId} 改密失败:`, e.message);
      }
    }

    res.json({ success, failed, total: user_ids.length, message: `成功 ${success} 个，失败 ${failed} 个` });
  } catch (err) {
    console.error('批量修改密码失败:', err);
    res.status(500).json({ error: '批量修改密码失败: ' + err.message });
  }
});

// ============ 1Panel 用户管理 (管理员) ============

// 获取 1Panel 所有用户
router.get('/api/admin/panel-users', verifyAdmin, async (req, res) => {
  try {
    const { roleId } = req.query;
    const response = await panel.post('/api/v2/core/enterprise/users/search', {
      page: 1,
      pageSize: 200,
      info: '',
    });

    if (response.status < 200 || response.status >= 300) {
      return res.status(response.status).json({ error: '1Panel 用户查询失败' });
    }

    let users = getPanelItems(response.data);

    if (roleId) {
      const rid = parseInt(roleId, 10);
      users = users.filter(u =>
        Array.isArray(u.nodeRoles) && u.nodeRoles.some(r => r.roleId === rid)
      );
    }

    res.json({ total: users.length, users });
  } catch (err) {
    console.error('获取面板用户失败:', err);
    res.status(500).json({ error: '获取面板用户失败' });
  }
});

// 批量修改面板用户密码
router.post('/api/admin/panel-users/batch-password', verifyAdmin, async (req, res) => {
  try {
    const { password, roleId, userIds } = req.body;

    if (!password) {
      return res.status(400).json({ error: '请提供 password' });
    }

    if (!roleId && (!userIds || !userIds.length)) {
      return res.status(400).json({ error: '请提供 roleId 或 userIds' });
    }

    const response = await panel.post('/api/v2/core/enterprise/users/search', {
      page: 1,
      pageSize: 200,
      info: '',
    });

    if (response.status < 200 || response.status >= 300) {
      return res.status(response.status).json({ error: '1Panel 用户查询失败' });
    }

    let allUsers = getPanelItems(response.data);
    let targets;
    if (userIds && userIds.length) {
      targets = allUsers.filter(u => userIds.includes(u.id));
    } else {
      const rid = parseInt(roleId, 10);
      targets = allUsers.filter(u =>
        Array.isArray(u.nodeRoles) && u.nodeRoles.some(r => r.roleId === rid)
      );
    }

    if (!targets.length) {
      return res.status(404).json({ error: '未找到匹配的用户' });
    }

    const encodedPassword = Buffer.from(password, 'utf-8').toString('base64');

    // 旧实现：for + await 串行调用 1Panel,N 个用户 = N × RTT
    // 新实现：分批并发(每批 BATCH_SIZE 个),用 Promise.allSettled 保证单个失败不影响其他
    // 注意:不能无脑全并发——1Panel 远端有 QPS 限制,且大量并发可能耗尽连接池
    const BATCH_SIZE = 10;
    const results = [];

    const runOne = async (user) => {
      try {
        const updateRes = await panel.post('/api/v2/core/enterprise/users/update', {
          id: user.id,
          name: user.name,
          sessionTimeout: user.sessionTimeout || 86400,
          isSuperAdmin: user.isSuperAdmin || false,
          nodeRoles: (user.nodeRoles || []).map(r => ({ nodeId: r.nodeId, roleId: r.roleId })),
          description: user.description || '',
          createdAt: user.createdAt,
          password: encodedPassword,
        });
        const ok = updateRes.status >= 200 && updateRes.status < 300;
        return { id: user.id, name: user.name, success: ok, status: updateRes.status };
      } catch (err) {
        return { id: user.id, name: user.name, success: false, error: err.message };
      }
    };

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      // Promise.all 这里是安全的,因为 runOne 内部已 try/catch,绝不会 reject
      const batchResults = await Promise.all(batch.map(runOne));
      results.push(...batchResults);
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    res.json({
      total: results.length,
      success: successCount,
      failed: failCount,
      results,
    });
  } catch (err) {
    console.error('批量修改密码失败:', err);
    res.status(500).json({ error: '批量修改密码失败' });
  }
});

// ============ 静态文件服务 (生产环境) ============


// ============ 站点品牌 + 公告横幅 ============
// 品牌资源(logo / favicon)落地到 data/uploads/branding/, 走持久卷,
// 通过 app.js 里挂的 express.static('/uploads/branding') 对外可访问
const BRANDING_UPLOAD_DIR = path.join(__dirname, '../../data/uploads/branding');
if (!fs.existsSync(BRANDING_UPLOAD_DIR)) {
  fs.mkdirSync(BRANDING_UPLOAD_DIR, { recursive: true });
}

const brandingUpload = multer({
  storage: multer.diskStorage({
    destination: BRANDING_UPLOAD_DIR,
    filename: (req, file, cb) => {
      // logo / favicon 用固定前缀 + 时间戳, 避免缓存又便于追溯
      const kind = req.params.kind === 'favicon' ? 'favicon' : 'logo';
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `${kind}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB 上限
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpe?g|svg\+xml|x-icon|vnd\.microsoft\.icon|webp)$/i.test(file.mimetype)
      || /\.(png|jpg|jpeg|svg|ico|webp)$/i.test(file.originalname);
    if (!ok) return cb(new Error('仅支持图片 (png/jpg/svg/ico/webp)'));
    cb(null, true);
  },
});

// HTML 黑名单过滤: admin 写公告时拦截最常见 XSS 向量
// 注意: admin 是被信任角色, 这里是「防止意外贴入恶意脚本」, 不是「防止 admin 越权」
function sanitizeAnnouncementHtml(html) {
  if (typeof html !== 'string') return '';
  let out = html;
  // 1. 删 <script>...</script> (含变体: <script src=...></script>)
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  out = out.replace(/<script\b[^>]*\/?>/gi, '');
  // 2. 删 <iframe>/<object>/<embed>/<style> 这类危险标签
  out = out.replace(/<(iframe|object|embed|style|link|meta|base)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  out = out.replace(/<(iframe|object|embed|style|link|meta|base)\b[^>]*\/?>/gi, '');
  // 3. 删 on* 事件属性 (onclick / onerror / onload 等)
  out = out.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // 4. 拦截 javascript: 与 data: 协议 (避免 <a href="javascript:..."> 和 data: URI 注入)
  out = out.replace(/(href|src|formaction|action|xlink:href)\s*=\s*(["'])\s*(?:javascript|data|vbscript)\s*:/gi, '$1=$2#blocked:');
  return out;
}

// 获取站点品牌 (admin 视图)
router.get('/api/admin/branding', verifyAdmin, async (req, res) => {
  try {
    const result = await global.pool.query(
      `SELECT key, value FROM system_config WHERE key IN ('site_name', 'site_logo', 'site_favicon')`
    );
    const map = {};
    for (const row of result.rows) map[row.key] = row.value;
    res.json({
      site_name:    map.site_name    || 'AI 门户',
      site_logo:    map.site_logo    || '',
      site_favicon: map.site_favicon || '',
    });
  } catch (err) {
    console.error('获取站点品牌失败:', err);
    res.status(500).json({ error: '获取站点品牌失败' });
  }
});

// 保存站点品牌
router.post('/api/admin/branding', verifyAdmin, async (req, res) => {
  try {
    const { site_name, site_logo, site_favicon } = req.body || {};
    if (typeof site_name !== 'string' || !site_name.trim()) {
      return res.status(400).json({ error: '站点名不能为空' });
    }
    const configs = [
      ['site_name',    site_name.trim().slice(0, 100)],
      ['site_logo',    String(site_logo    || '').trim().slice(0, 500)],
      ['site_favicon', String(site_favicon || '').trim().slice(0, 500)],
    ];
    for (const [key, value] of configs) {
      await global.pool.query(
        `INSERT INTO system_config (key, value, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
    }
    // 品牌已落库,失效 index.html 注入缓存,让下次刷新首屏即显示新站名/favicon
    if (typeof req.app?.locals?.invalidateIndexCache === 'function') {
      req.app.locals.invalidateIndexCache();
    }
    res.json({ success: true, message: '站点品牌已保存' });
  } catch (err) {
    console.error('保存站点品牌失败:', err);
    res.status(500).json({ error: '保存站点品牌失败' });
  }
});

// 上传 logo / favicon
// 返回的 url 是站点绝对路径(/uploads/branding/...), 前端拼上 base 即可用
router.post('/api/admin/branding/upload/:kind', verifyAdmin, (req, res) => {
  if (!['logo', 'favicon'].includes(req.params.kind)) {
    return res.status(400).json({ error: 'kind 仅支持 logo / favicon' });
  }
  brandingUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || '上传失败' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '未收到文件' });
    }
    const url = `/uploads/branding/${req.file.filename}`;
    res.json({ success: true, url, filename: req.file.filename });
  });
});

// 获取公告 (admin 视图)
router.get('/api/admin/announcement', verifyAdmin, async (req, res) => {
  try {
    const result = await global.pool.query(
      `SELECT key, value FROM system_config
       WHERE key IN ('banner_enabled', 'banner_html', 'dialog_enabled', 'dialog_title', 'dialog_html', 'dialog_version')`
    );
    const map = {};
    for (const row of result.rows) map[row.key] = row.value;
    res.json({
      banner_enabled: map.banner_enabled !== 'false',
      banner_html:    map.banner_html    || '',
      dialog_enabled: map.dialog_enabled !== 'false',
      dialog_title:   map.dialog_title   || '',
      dialog_html:    map.dialog_html    || '',
      dialog_version: parseInt(map.dialog_version || '1', 10),
    });
  } catch (err) {
    console.error('获取公告失败:', err);
    res.status(500).json({ error: '获取公告失败' });
  }
});

// 保存公告
// 注意: 保存时 dialog_version 自增, 让所有勾过「不再提示」的用户重新看到 dialog
router.post('/api/admin/announcement', verifyAdmin, async (req, res) => {
  try {
    const {
      banner_enabled, banner_html,
      dialog_enabled, dialog_title, dialog_html,
    } = req.body || {};

    const cleanBanner = sanitizeAnnouncementHtml(banner_html || '');
    const cleanDialog = sanitizeAnnouncementHtml(dialog_html || '');
    const cleanTitle  = String(dialog_title || '').trim().slice(0, 200);

    const configs = [
      ['banner_enabled', banner_enabled === false ? 'false' : 'true'],
      ['banner_html',    cleanBanner],
      ['dialog_enabled', dialog_enabled === false ? 'false' : 'true'],
      ['dialog_title',   cleanTitle],
      ['dialog_html',    cleanDialog],
    ];
    for (const [key, value] of configs) {
      await global.pool.query(
        `INSERT INTO system_config (key, value, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
    }
    // dialog_version 自增
    await global.pool.query(
      `UPDATE system_config
       SET value = (COALESCE(NULLIF(value, '')::int, 0) + 1)::text,
           updated_at = CURRENT_TIMESTAMP
       WHERE key = 'dialog_version'`
    );

    res.json({ success: true, message: '公告已保存' });
  } catch (err) {
    console.error('保存公告失败:', err);
    res.status(500).json({ error: '保存公告失败: ' + err.message });
  }
});

// ============================================================
// 管理员新增本地用户(OAuth 启用关闭自助注册后的唯一录入入口之一)
// 与 portal.js 的 /api/auth/register 保持同样的校验和 1Panel 同步逻辑
// ============================================================
router.post('/api/admin/portal-users', verifyAdmin, async (req, res) => {
  try {
    const rawUsername = String(req.body.username || '').trim();
    const rawPassword = req.body.password;
    const rawName = String(req.body.name || '').trim() || rawUsername;
    const rawRole = String(req.body.role || 'user').trim();

    if (!rawUsername || rawUsername.length < 3 || rawUsername.length > 30) {
      return res.status(400).json({ error: '用户名需3-30位字符' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(rawUsername)) {
      return res.status(400).json({ error: '用户名只能包含英文、数字和下划线' });
    }
    if (!rawPassword || rawPassword.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }
    if (rawRole !== 'user' && rawRole !== 'admin') {
      return res.status(400).json({ error: '角色只能是 user 或 admin' });
    }

    const existing = await global.pool.query(
      'SELECT id FROM portal_users WHERE username = $1', [rawUsername]
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    // 同步到 1Panel(失败不阻断,沿用 /register 的容错语义)
    let panelUserId = null;
    let sessionTimeout = 86400;
    let syncWarning = null;
    try {
      const panelUser = await findPanelUser(rawUsername);
      if (panelUser) {
        panelUserId = panelUser.id;
        sessionTimeout = panelUser.sessionTimeout || 86400;
      } else {
        try {
          await createPanelUser({ username: rawUsername, password: rawPassword, name: rawName });
          const created = await findPanelUser(rawUsername);
          if (created) {
            panelUserId = created.id;
            sessionTimeout = created.sessionTimeout || 86400;
          }
        } catch (createErr) {
          console.error('[admin/portal-users] 1Panel 创建用户失败,仍创建本地用户:', createErr.message);
          syncWarning = '1Panel 用户创建失败,本地用户已创建,请检查 1Panel 网络连接后重试';
        }
      }
    } catch (panelErr) {
      console.error('[admin/portal-users] 1Panel 查询用户失败,仍创建本地用户:', panelErr.message);
      syncWarning = '1Panel 用户查询失败,本地用户已创建,请检查 1Panel 网络连接后重试';
    }

    const passwordHash = await bcrypt.hash(rawPassword, 12);
    const result = await global.pool.query(`
      INSERT INTO portal_users (panel_user_id, username, name, display_name, password_hash, session_timeout, status, role)
      VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
      RETURNING id, panel_user_id, username, name, role, status, last_login_at, created_at
    `, [panelUserId, rawUsername, rawName, rawName, passwordHash, sessionTimeout, rawRole]);

    const user = result.rows[0];
    res.json({
      user: {
        id: user.id,
        panel_user_id: user.panel_user_id,
        username: user.username,
        name: user.name,
        role: user.role,
        status: user.status,
        last_login_at: user.last_login_at,
        created_at: user.created_at,
      },
      ...(syncWarning ? { syncWarning } : {}),
    });
  } catch (err) {
    console.error('[admin/portal-users] 创建失败:', err);
    res.status(500).json({ error: '创建用户失败' });
  }
});

// ============================================================
// 第三方登录配置(管理员)
// ============================================================

function maskSecret(s) {
  if (!s || typeof s !== 'string') return '';
  if (s.length <= 4) return '***';
  return '***' + s.slice(-4);
}

router.get('/api/admin/oauth/providers', verifyAdmin, async (req, res) => {
  try {
    const r = await global.pool.query(
      'SELECT provider, display_name, enabled, config, sort_order, updated_at FROM oauth_providers ORDER BY sort_order ASC'
    );
    const out = r.rows.map(row => {
      const adapter = oauthRegistry.getAdapter(row.provider);
      const config = { ...(row.config || {}) };
      if (adapter && adapter.configSchema) {
        for (const f of adapter.configSchema.fields) {
          if (f.sensitive && config[f.key]) {
            config[`${f.key}_masked`] = maskSecret(config[f.key]);
            delete config[f.key];
          }
        }
      }
      return {
        provider: row.provider,
        display_name: row.display_name,
        enabled: row.enabled,
        sort_order: row.sort_order,
        config,
        schema: adapter ? adapter.configSchema : null,
        updated_at: row.updated_at,
      };
    });
    res.json({ providers: out });
  } catch (err) {
    console.error('[admin/oauth/providers GET] failed:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

router.put('/api/admin/oauth/providers/:provider', verifyAdmin, async (req, res) => {
  try {
    const provider = req.params.provider;
    const adapter = oauthRegistry.getAdapter(provider);
    if (!adapter) {
      return res.status(404).json({ code: 'OAUTH_PROVIDER_NOT_FOUND', error: 'provider 未注册' });
    }
    const existing = await global.pool.query(
      'SELECT config FROM oauth_providers WHERE provider=$1', [provider]
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ code: 'OAUTH_PROVIDER_NOT_FOUND', error: 'provider 未注册' });
    }
    const oldConfig = existing.rows[0].config || {};

    const incoming = req.body.config || {};
    const merged = { ...oldConfig };
    for (const f of adapter.configSchema.fields) {
      const v = incoming[f.key];
      if (f.sensitive) {
        if (typeof v === 'string' && v.length > 0) merged[f.key] = v;
      } else if (typeof v !== 'undefined') {
        merged[f.key] = v;
      }
    }

    const wantEnabled = (req.body.enabled === true);
    if (wantEnabled) {
      for (const f of adapter.configSchema.fields) {
        if (f.required && !merged[f.key]) {
          return res.status(400).json({
            code: 'OAUTH_CONFIG_INVALID',
            error: `字段 ${f.label} 必填,启用前请先填写`
          });
        }
      }
    }

    const display_name = (typeof req.body.display_name === 'string')
      ? req.body.display_name : null;
    const sort_order = (typeof req.body.sort_order === 'number')
      ? req.body.sort_order : null;

    await global.pool.query(`
      UPDATE oauth_providers
      SET
        display_name = COALESCE($2, display_name),
        enabled = COALESCE($3, enabled),
        config = $4::jsonb,
        sort_order = COALESCE($5, sort_order),
        updated_at = CURRENT_TIMESTAMP
      WHERE provider = $1
    `, [provider, display_name, typeof req.body.enabled === 'boolean' ? req.body.enabled : null, JSON.stringify(merged), sort_order]);

    // 清缓存:若 secret 改了,旧 token 会用错的密钥继续 hit 缓存
    try {
      if (adapter && typeof adapter._getTokenCache === 'function') {
        const tc = adapter._getTokenCache();
        if (typeof tc.clear === 'function') {
          tc.clear(`${provider}:${merged.corpid}:${merged.agentid}`);
        }
      }
    } catch (e) {
      console.warn('[admin/oauth PUT] token cache clear failed (non-fatal):', e.message);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/oauth/providers PUT] failed:', err);
    res.status(500).json({ error: '保存失败' });
  }
});

router.post('/api/admin/oauth/providers/:provider/test', verifyAdmin, async (req, res) => {
  try {
    const provider = req.params.provider;
    const adapter = oauthRegistry.getAdapter(provider);
    if (!adapter) {
      return res.status(404).json({ code: 'OAUTH_PROVIDER_NOT_FOUND', error: 'provider 未注册' });
    }

    const existing = await global.pool.query(
      'SELECT config FROM oauth_providers WHERE provider=$1', [provider]
    );
    const oldConfig = existing.rows[0]?.config || {};
    const incoming = req.body.config || {};
    const test = { ...oldConfig };
    for (const f of adapter.configSchema.fields) {
      const v = incoming[f.key];
      if (f.sensitive) {
        if (typeof v === 'string' && v.length > 0) test[f.key] = v;
      } else if (typeof v !== 'undefined') {
        test[f.key] = v;
      }
    }

    try {
      await adapter.testConnection(test);
      res.json({ ok: true });
    } catch (err) {
      console.error(`[admin/oauth/providers/${provider}/test] failed:`, err.message);
      res.json({ ok: false, code: 'OAUTH_TEST_FAILED', reason: err.message });
    }
  } catch (err) {
    console.error('[admin/oauth/providers/test] failed:', err);
    res.status(500).json({ error: '测试失败' });
  }
});

module.exports = router;
