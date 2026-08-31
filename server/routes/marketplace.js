const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const storage = require('../lib/storage');
const downloadCounter = require('../lib/downloadCounter');
const { panel, getPanelPayload, getPanelItems, downloadPanelSkill } = require('../panel');
const { downloadLimiter, uploadLimiter, verifyUser, requirePermission, requirePermissionOrAdminRole, optionalUser } = require('../auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '../../data/uploads/skills');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  dest: path.join(UPLOAD_DIR, '_tmp'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const ok = name.endsWith('.zip') || name.endsWith('.7z')
      || name.endsWith('.tar') || name.endsWith('.tar.gz') || name.endsWith('.tgz');
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .zip / .7z / .tar / .tar.gz 格式'));
    }
  },
});

// 按文件名后缀判断技能包格式（.zip 可读写 skill.md；.7z/.tar/.tar.gz 只能原样转发 1Panel）
function skillArchiveFormat(filename) {
  const name = String(filename || '').toLowerCase();
  if (name.endsWith('.zip')) return 'zip';
  if (name.endsWith('.7z')) return '7z';
  if (name.endsWith('.tar.gz') || name.endsWith('.tgz')) return 'tar.gz';
  if (name.endsWith('.tar')) return 'tar';
  return 'unknown';
}

function panelBizError(response) {
  const data = response?.data;
  if (!data || typeof data !== 'object') return null;
  const code = Number(data.code);
  if (Number.isFinite(code) && code >= 400) {
    return data.message || data.msg || `1Panel business code=${code}`;
  }
  return null;
}

function buildPanelSkillName(originalName, skillId) {
  const base = path.basename(String(originalName || ''), path.extname(String(originalName || ''))).trim();
  return base || skillId;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getPanelSkillId(item) {
  return item?.id || item?.ID || item?.skillId || item?.skill_id || item?.recordId || item?.record_id || null;
}

function panelSkillTimeValue(item) {
  const raw = item?.createdAt || item?.created_at || item?.updatedAt || item?.updated_at || '';
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : 0;
}

function sortPanelSkillsByTimeDesc(items) {
  return [...items].sort((a, b) => panelSkillTimeValue(b) - panelSkillTimeValue(a));
}

function panelSkillMatches(item, { skillId, title, originalName, panelName }) {
  const wanted = [skillId, title, originalName, panelName]
    .filter(Boolean)
    .map(v => String(v).toLowerCase());
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
    .map(v => String(v).toLowerCase());
  return actual.some(v => wanted.includes(v));
}

async function findUploadedPanelSkill({ skillId, title, originalName, panelName, excludeIds = new Set() }) {
  const PAGE_SIZE = 100;
  const terms = [panelName, skillId, title, originalName, ''].filter((v, i, arr) => v !== undefined && v !== null && arr.indexOf(v) === i);

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const info of terms) {
      let page = 1;
      let fetched = 0;
      while (page < 50) {
        const response = await panel.post('/api/v2/core/enterprise/skills-hub/search', {
          page, pageSize: PAGE_SIZE, info,
        });
        const bizError = panelBizError(response);
        if (response.status < 200 || response.status >= 300 || bizError) {
          const err = new Error(bizError || `HTTP ${response.status}`);
          err.code = 'PANEL_SKILL_SEARCH_FAILED';
          throw err;
        }
        const payload = getPanelPayload(response.data) || {};
        const items = Array.isArray(payload.items) ? payload.items
                    : Array.isArray(payload.list) ? payload.list
                    : Array.isArray(payload.records) ? payload.records
                    : Array.isArray(payload) ? payload : [];
        const newItems = items.filter(item => {
          const id = getPanelSkillId(item);
          return id !== null && id !== undefined && !excludeIds.has(String(id));
        });
        const newItem = sortPanelSkillsByTimeDesc(newItems)[0];
        if (newItem) return newItem;
        const found = items.find(item => panelSkillMatches(item, { skillId, title, originalName, panelName }));
        if (found) return found;
        // 1Panel 的 search 有时按 info 已经精准过滤,但字段名不是 name/title。
        // 非空 info 只返回 1 条时,接受该条作为刚上传的技能。
        if (info && items.length === 1) return items[0];

        fetched += items.length;
        const total = typeof payload.total === 'number' ? payload.total : fetched;
        if (fetched >= total || items.length < PAGE_SIZE) break;
        page++;
      }
    }
    if (attempt < 2) await sleep(300 * (attempt + 1));
  }

  return null;
}

async function listPanelSkillIds() {
  const PAGE_SIZE = 100;
  const ids = new Set();
  let page = 1;
  while (page < 50) {
    const response = await panel.post('/api/v2/core/enterprise/skills-hub/search', {
      page, pageSize: PAGE_SIZE, info: '',
    });
    const bizError = panelBizError(response);
    if (response.status < 200 || response.status >= 300 || bizError) {
      const err = new Error(bizError || `HTTP ${response.status}`);
      err.code = 'PANEL_SKILL_SEARCH_FAILED';
      throw err;
    }
    const payload = getPanelPayload(response.data) || {};
    const items = Array.isArray(payload.items) ? payload.items
                : Array.isArray(payload.list) ? payload.list
                : Array.isArray(payload.records) ? payload.records
                : Array.isArray(payload) ? payload : [];
    for (const item of items) {
      const id = getPanelSkillId(item);
      if (id !== null && id !== undefined) ids.add(String(id));
    }
    const total = typeof payload.total === 'number' ? payload.total : ids.size;
    if (ids.size >= total || items.length < PAGE_SIZE) break;
    page++;
  }
  return ids;
}

async function uploadSkillToPanel({ skillId, title, version, fileContent, originalName, confirmOverwrite = false }) {
  const panelName = buildPanelSkillName(originalName, skillId);
  const beforeRemoteIds = await listPanelSkillIds();
  console.log('[skill-upload] 发送给 1Panel 的参数:');
  console.log('  version =', JSON.stringify(version));
  console.log('  confirmMetadataOverwrite =', String(confirmOverwrite));
  console.log('  file    =', JSON.stringify(originalName), `(${fileContent ? fileContent.length : 0} bytes)`);
  const response = await panel.postMultipart('/api/v2/core/enterprise/skills-hub/upload', {
    fields: {
      version,
      confirmMetadataOverwrite: confirmOverwrite ? 'true' : 'false',
    },
    files: [{
      name: 'file',
      filename: originalName,
      contentType: 'application/zip',
      content: fileContent,
    }],
  });
  console.log('[skill-upload] 1Panel 原始响应:', response.status, JSON.stringify(response.data));
  const bizError = panelBizError(response);
  if (response.status < 200 || response.status >= 300 || bizError) {
    const reason = bizError || `HTTP ${response.status}`;
    const err = new Error(reason);
    err.code = 'PANEL_SKILL_UPLOAD_FAILED';
    throw err;
  }
  const payload = getPanelPayload(response.data) || {};
  let uploaded = {
    id: payload.id || payload.skillId || null,
    status: payload.status || payload.panelStatus || null,
    raw: payload,
  };
  if (!uploaded.id) {
    const found = await findUploadedPanelSkill({ skillId, title, originalName, panelName, excludeIds: beforeRemoteIds });
    const foundId = getPanelSkillId(found);
    if (foundId) {
      uploaded = {
        id: foundId,
        status: found.status || found.panelStatus || uploaded.status,
        raw: { upload: payload, search: found },
      };
    }
  }
  if (!uploaded.id) {
    const err = new Error('1Panel 上传成功但 search 未找到技能 ID');
    err.code = 'PANEL_SKILL_UPLOAD_UNVERIFIED';
    throw err;
  }
  return uploaded;
}

router.post('/api/submit', async (req, res) => {
  try {
    const {
      skill_id,
      title,
      slug,
      description,
      avatar = (title?.charAt(0)?.toUpperCase() || 'S'),
      avatar_color = 'av-teal',
      category,
      author,
      install_command,
      install_url,
      version = 'v1.0.0',
      submitted_by,
    } = req.body;

    // 验证必填字段
    if (!skill_id || !title || !slug || !category || !author || !install_command) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    // 检查 skill_id 是否已存在
    const existing = await global.pool.query(
      'SELECT id FROM skills WHERE id = $1 UNION SELECT skill_id FROM skill_submissions WHERE skill_id = $1 AND status = $2',
      [skill_id, 'pending']
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({ error: '技能 ID 已存在或正在审核中' });
    }

    await global.pool.query(`
      INSERT INTO skill_submissions (
        skill_id, title, slug, description, avatar, avatar_color,
        category, author, install_command, install_url, version,
        status, submitted_by, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12, CURRENT_TIMESTAMP)
    `, [skill_id, title, slug, description, avatar, avatar_color,
        category, author, install_command, install_url, version, submitted_by]);

    res.json({ success: true, message: '技能提交成功，等待审核' });
  } catch (err) {
    console.error('Error submitting skill:', err);
    res.status(500).json({ error: '提交失败' });
  }
});

// 审核通过 - 将技能写入正式表

router.get('/api/health', async (req, res) => {
  try {
    const result = await global.pool.query('SELECT NOW()');
    res.json({ status: 'ok', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', message: '数据库连接失败' });
  }
});

// 获取所有技能
router.get('/api/skills', verifyUser, requirePermissionOrAdminRole('skill:view'), async (req, res) => {
  try {
    const {
      category,
      source,
      search,
      sort = 'default',
      page = '1',
      limit = '12',
      slug
    } = req.query;

    // 如果请求单个技能（通过 slug）
    if (slug) {
      const result = await global.pool.query(`
        SELECT
          id, title, slug, description, avatar, avatar_color,
          downloads, stars, version, category, tag, author,
          install_command as "installCommand",
          install_url as "installUrl",
          created_at as "createdAt",
          updated_at as "updatedAt",
          source, risk_level as "riskLevel", panel_status as "panelStatus"
        FROM skills
        WHERE slug = $1 AND is_active = TRUE
      `, [slug]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: '技能不存在' });
      }
      // 资源组白名单校验:普通用户只能查看其资源组勾选的技能(防绕过广场列表直接查详情)
      const { canUserAccessSkill } = require('../lib/permission');
      if (!(await canUserAccessSkill(req.portalUser.id, slug))) {
        return res.status(403).json({ code: 'FORBIDDEN', error: '无权查看该技能' });
      }

      // 拉标签（用 panel_skill_id 关联）
      const skill = result.rows[0];
      if (skill.panel_skill_id) {
        try {
          const tagResult = await global.pool.query(`
            SELECT t.id, t.name, t.color
            FROM resource_tags rt
            JOIN tags t ON t.id = rt.tag_id AND t.is_active = TRUE
            WHERE rt.resource_type = 'skill' AND rt.resource_id = $1
            ORDER BY t.sort_order, t.name
          `, [skill.panel_skill_id]);
          skill.tags = tagResult.rows;
        } catch (tagErr) {
          skill.tags = [];
        }
      } else {
        skill.tags = [];
      }

      return res.json(skill);
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 12)); // 最大100条
    const offset = (pageNum - 1) * limitNum;

    // 用 COUNT(*) OVER() 合并计数和分页，单次 SQL 拿到总数 + 数据
    let whereClause = 'WHERE is_active = TRUE';
    const params = [];
    let paramIndex = 1;

    // RBAC Phase 2: 登录非超管用户按资源组过滤 Skill（访客/超管/未授权全公开兜底）
    let visibleSkillSlugs = null;
    if (req.portalUser && !req.portalUser.is_portal_admin) {
      const { getVisibleResourcesForUser } = require('../lib/permission');
      const visible = await getVisibleResourcesForUser(req.portalUser.id);
      // 全公开兜底时 visible.skill 是 listAll() 返回的行对象数组（含 slug/title），
      // 资源组已勾选时是 slug 字符串数组。只有后者才需要过滤。
      if (Array.isArray(visible.skill)) {
        if (visible.skill.length > 0 && typeof visible.skill[0] === 'string') {
          visibleSkillSlugs = visible.skill;
        } else if (visible.skill.length === 0) {
          // 空交集 → 无可见 Skill
          visibleSkillSlugs = [];
        }
      }
    }

    if (category && category !== 'all') {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    // 来源过滤: source = 'local' | 'panel' | 'all'(等价于不过滤)
    if (source && source !== 'all') {
      whereClause += ` AND source = $${paramIndex}`;
      params.push(source);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (visibleSkillSlugs) {
      whereClause += ` AND slug = ANY($${paramIndex})`;
      params.push(visibleSkillSlugs);
      paramIndex++;
    }

    // 标签筛选（用 panel_skill_id 关联）
    const { tag } = req.query;
    if (tag && Number.isFinite(parseInt(tag))) {
      whereClause += ` AND panel_skill_id IN (SELECT rt.resource_id FROM resource_tags rt JOIN tags t ON t.id = rt.tag_id WHERE rt.resource_type = 'skill' AND rt.tag_id = $${paramIndex} AND t.is_active = TRUE)`;
      params.push(parseInt(tag));
      paramIndex++;
    }

    let orderBy;
    switch (sort) {
      case 'downloads': orderBy = 'ORDER BY downloads DESC'; break;
      case 'latest':    orderBy = 'ORDER BY created_at DESC'; break;
      case 'stars':     orderBy = 'ORDER BY stars DESC'; break;
      default:          orderBy = 'ORDER BY downloads DESC, created_at DESC';
    }

    const query = `
      SELECT
        id, title, slug, description, avatar, avatar_color,
        downloads, stars, version, category, tag, author,
        install_command as "installCommand",
        install_url as "installUrl",
        created_at as "createdAt",
        updated_at as "updatedAt",
        source, risk_level as "riskLevel", panel_status as "panelStatus",
        panel_skill_id,
        COUNT(*) OVER() AS _total
      FROM skills
      ${whereClause}
      ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limitNum, offset);

    const result = await global.pool.query(query, params);
    const total = result.rows.length > 0 ? parseInt(result.rows[0]._total) : 0;
    // 剥掉内部计数字段，避免暴露到前端
    const data = result.rows.map(({ _total, ...row }) => row);

    // 批量拉标签（用 panel_skill_id 关联 resource_tags）
    if (data.length) {
      const skillIds = data.map(r => r.panel_skill_id).filter(id => id !== null);
      if (skillIds.length) {
        const tagResult = await global.pool.query(`
          SELECT rt.resource_id AS panel_skill_id, t.id, t.name, t.color
          FROM resource_tags rt
          JOIN tags t ON t.id = rt.tag_id AND t.is_active = TRUE
          WHERE rt.resource_type = 'skill' AND rt.resource_id = ANY($1)
          ORDER BY t.sort_order, t.name
        `, [skillIds]);
        const tagMap = {};
        for (const tr of tagResult.rows) (tagMap[tr.panel_skill_id] ??= []).push({ id: tr.id, name: tr.name, color: tr.color });
        for (const row of data) row.tags = tagMap[row.panel_skill_id] || [];
      } else {
        for (const row of data) row.tags = [];
      }
    }

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
    console.error('Error fetching skills:', err);
    res.status(500).json({ error: '获取技能列表失败' });
  }
});

// 获取单个技能
router.get('/api/skills/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await global.pool.query(`
      SELECT
        id, title, slug, description, avatar, avatar_color,
        downloads, stars, version, category, tag, author,
        install_command as "installCommand",
        install_url as "installUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM skills
      WHERE slug = $1 AND is_active = TRUE
    `, [slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '技能不存在' });
    }

    const skill = result.rows[0];

    // 拉标签（用 panel_skill_id 关联）
    if (skill.panel_skill_id) {
      try {
        const tagResult = await global.pool.query(`
          SELECT t.id, t.name, t.color
          FROM resource_tags rt
          JOIN tags t ON t.id = rt.tag_id AND t.is_active = TRUE
          WHERE rt.resource_type = 'skill' AND rt.resource_id = $1
          ORDER BY t.sort_order, t.name
        `, [skill.panel_skill_id]);
        skill.tags = tagResult.rows;
      } catch (tagErr) {
        skill.tags = [];
      }
    } else {
      skill.tags = [];
    }

    res.json(skill);
  } catch (err) {
    console.error('Error fetching skill:', err);
    res.status(500).json({ error: '获取技能详情失败' });
  }
});

// 公开端点:返回技能适用的活跃标签列表（供技能广场筛选）
// 按用户可见技能过滤 count: 无资源权限的普通用户返回空(标签与列表口径一致);
// 超管/后台角色/全公开兜底时统计全部。
router.get('/api/skill-tags', optionalUser, async (req, res) => {
  try {
    let visibleSkillSlugs = null;
    if (req.portalUser && !req.portalUser.is_portal_admin) {
      const { getVisibleResourcesForUser, isAdminRoleUser } = require('../lib/permission');
      if (!(await isAdminRoleUser(req.portalUser.id))) {
        const visible = await getVisibleResourcesForUser(req.portalUser.id);
        if (Array.isArray(visible.skill)) {
          if (visible.skill.length > 0 && typeof visible.skill[0] === 'string') {
            visibleSkillSlugs = visible.skill;
          } else if (visible.skill.length === 0) {
            // 严格白名单且无任何资源组 -> 无可见技能,标签为空
            return res.json({ data: [], total: 0 });
          }
        }
      }
    }

    // total: 当前用户可见的活跃技能总数(供前端「全部标签」行使用)
    const totalRow = visibleSkillSlugs
      ? await global.pool.query('SELECT COUNT(*)::int AS n FROM skills WHERE is_active = TRUE AND slug = ANY($1)', [visibleSkillSlugs])
      : await global.pool.query('SELECT COUNT(*)::int AS n FROM skills WHERE is_active = TRUE');
    const total = totalRow.rows[0]?.n || 0;

    const r = await global.pool.query(`
      SELECT t.id, t.name, t.color, t.sort_order,
             COUNT(DISTINCT rt.resource_id)::int AS count
      FROM tags t
      JOIN tag_resource_types trt ON trt.tag_id = t.id AND trt.resource_type = 'skill'
      LEFT JOIN resource_tags rt ON rt.tag_id = t.id AND rt.resource_type = 'skill'
      LEFT JOIN skills s ON s.panel_skill_id = rt.resource_id AND s.is_active = TRUE
      WHERE t.is_active = TRUE
        ${visibleSkillSlugs ? 'AND s.slug = ANY($1)' : ''}
      GROUP BY t.id
      ORDER BY t.sort_order, t.name
    `, visibleSkillSlugs ? [visibleSkillSlugs] : []);
    res.json({ data: r.rows, total });
  } catch (err) {
    res.json({ data: [], total: 0 });
  }
});

// 获取统计信息
router.get('/api/stats', async (req, res) => {
  try {
    const result = await global.pool.query(`
      SELECT
        COUNT(*) as total_skills,
        SUM(downloads) as total_downloads,
        COUNT(DISTINCT author) as unique_authors
      FROM skills
      WHERE is_active = TRUE
    `);

    const stats = result.rows[0];
    res.json({
      totalSkills: parseInt(stats.total_skills),
      totalDownloads: parseInt(stats.total_downloads),
      uniqueAuthors: parseInt(stats.unique_authors)
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// 增加下载量
router.post('/api/skills/:id/download', downloadLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    // 先确认技能存在(沿用旧的 404 语义,避免对不存在的 id 也计数)
    const result = await global.pool.query(`
      SELECT downloads FROM skills WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '技能不存在' });
    }

    // 通过缓冲计数器累加,30s 内自动 flush;响应不再等 DB UPDATE
    downloadCounter.increment(id);

    // 记录下载日志（可选）
    await global.pool.query(`
      INSERT INTO download_stats (skill_id, user_agent, ip_hash)
      VALUES ($1, $2, $3)
    `, [id, req.headers['user-agent'] || '', req.ip]);

    // 返回当前 DB 中的 downloads(不含本次未 flush 的累计),与旧契约同形
    res.json({ success: true, downloads: parseInt(result.rows[0].downloads) });
  } catch (err) {
    console.error('Error recording download:', err);
    res.status(500).json({ error: '记录下载失败' });
  }
});

// ============ Skill 包上传/下载 API ============

// 从上传 zip 的 skill.md 读取标准 frontmatter 元数据(name/version/description/category/author 等)。
// 1Panel 新版会按包内元数据校验上传字段, 故所有字段以包内为准。
async function parseSkillMd(filePath) {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(filePath);
    // 找 skill.md / SKILL.md（根目录或子目录均可）
    const entry = zip.getEntries().find(e => /(^|\/)skill\.md$/i.test(e.entryName));
    if (!entry) return null;
    let content = entry.getData().toString('utf8');
    // 去 BOM
    content = content.replace(/^﻿/, '');

    // 优先 YAML frontmatter(--- 包裹), 没有则回退到全文逐行扫 key: value
    const fm = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    const scope = fm ? fm[1] : content;

    const meta = {};
    const lines = scope.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
      if (!m) continue;
      const key = m[1].toLowerCase();
      let val = m[2].replace(/^['"]|['"]$/g, '').trim();
      // YAML 块标量(description: | 保留换行 / > 折叠换行): 后续缩进行都是该字段的值
      if (val === '|' || val === '>') {
        const sep = val === '|' ? '\n' : ' ';
        const parts = [];
        let j = i + 1;
        while (j < lines.length && /^\s+/.test(lines[j])) {
          parts.push(lines[j].trim());
          j++;
        }
        i = j - 1;
        val = parts.join(sep);
      }
      if (val) meta[key] = val;
    }
    return meta;
  } catch (err) {
    console.warn('[skill-upload] 解析 skill.md 失败:', err.message);
    return {};
  }
}

// 解析技能包: 返回 skill.md 元数据 + 建议版本号(skill.md 自带版本), 供前端两步表单预填
router.post('/api/skills/parse', verifyUser, requirePermission('skill:create'), uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传技能包' });
    }
    // 非 zip 格式(7z/tar/tar.gz)暂不解析 skill.md, 直接返回手动填写标记
    if (skillArchiveFormat(req.file.originalname) !== 'zip') {
      if (fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch {} }
      return res.json({ name: '', description: '', category: 'skill', version: '', lastVersion: '', suggestedVersion: '', manual: true });
    }
    const meta = await parseSkillMd(req.file.path);
    if (meta === null) {
      return res.status(400).json({ error: '技能包缺少 skill.md 文件' });
    }
    const name = String(meta.name || meta.id || meta.slug || '').trim();
    const version = String(meta.version || '').trim();
    const description = String(meta.description || '').trim();
    const category = String(meta.category || 'skill').trim();

    // 上一个提交的版本(任意状态, 取最近一条), 用于自动叠加
    let lastVersion = '';
    if (name) {
      const last = await global.pool.query(
        'SELECT version FROM skill_submissions WHERE skill_id = $1 ORDER BY submitted_at DESC, id DESC LIMIT 1',
        [name]
      );
      if (last.rowCount) lastVersion = last.rows[0].version || '';
    }

    // 建议版本: 只用 skill.md 自带版本; 包内无版本则留空, 由用户手动填写(不再自动 +1)
    const suggestedVersion = version;

    // 删临时文件
    if (fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch {} }

    res.json({ name, description, category, version, lastVersion, suggestedVersion });
  } catch (err) {
    console.error('Error parsing skill:', err);
    res.status(500).json({ error: '解析技能包失败' });
  }
});

// 上传 Skill 包（zip）
router.post('/api/skills/upload', verifyUser, requirePermission('skill:create'), uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请上传技能包' });
  }

  const submitter = req.portalUser;
  const submittedBy = submitter.name || submitter.username;
  const author = submittedBy;

  // 确认后的字段(两步表单第二步提交)
  const skill_id = String(req.body.name || '').trim();
  const title = skill_id;   // 显示名暂用 name(与 1Panel sync 逻辑一致)
  const description = String(req.body.description || '').trim();
  const version = String(req.body.version || '').trim();
  const category = String(req.body.category || 'skill').trim();

  if (!skill_id) {
    return res.status(400).json({ error: '缺少技能 name' });
  }
  if (!version) {
    return res.status(400).json({ error: '缺少版本号' });
  }

  const packageName = req.file.originalname;
  const installCommand = `skillctl install ${skill_id}`;
  const installUrl = `/api/skills/${skill_id}/download`;

  // 直接上传原始包, 不做 skill.md 重写。1Panel 会自行递归解析包内 skill.md(大小写不敏感)拿 name。
  const fileContent = fs.readFileSync(req.file.path);

  // 只读解析包内 version, 判断是否与输入不一致 → 决定 confirmMetadataOverwrite。
  // 1Panel 在「包内版本 != 填写版本」时会弹窗「是否以填写内容为准」, 确认即覆盖(confirmMetadataOverwrite=true)。
  let confirmOverwrite = false;
  if (skillArchiveFormat(req.file.originalname) === 'zip') {
    try {
      const meta = await parseSkillMd(req.file.path);
      const pkgVersion = String((meta && meta.version) || '').trim();
      confirmOverwrite = !!pkgVersion && pkgVersion !== version;
    } catch (e) {
      console.warn('[skill-upload] 读取包内 version 失败:', e.message);
    }
  }

  const client = await global.pool.connect();
  try {
    // 事务: 先写本地待审核, 再同步 1Panel; 任一步失败整体回滚(本地也不留)。
    await client.query('BEGIN');

    // 1. 查是否有同 skill_id + 同 version 的 pending 提交(替换场景)
    const existing = await client.query(
      'SELECT id, panel_skill_id FROM skill_submissions WHERE skill_id = $1 AND version = $2 AND status = $3',
      [skill_id, version, 'pending']
    );

    // 替换(同版本重传): 先删旧 1Panel 技能, 否则上传会报 version already exists
    if (existing.rows.length > 0 && existing.rows[0].panel_skill_id) {
      try {
        await deletePanelSkill(existing.rows[0].panel_skill_id);
      } catch (e) {
        console.error('[skill-upload] 删除旧 1Panel 技能失败:', e.message);
        await client.query('ROLLBACK');
        return res.status(502).json({
          error: '1Panel 旧技能删除失败',
          reason: e.message,
          code: e.code || 'PANEL_SKILL_DELETE_FAILED',
        });
      }
    }

    // 2. 写本地待审核记录。文件统一放 1Panel(file_path 空), 下载走 skills-hub/download。
    //    同 skill_id + 同 version → 覆盖; 同 skill_id + 不同 version → 新增(版本迭代)。
    if (existing.rows.length > 0) {
      await client.query(`
        UPDATE skill_submissions
        SET title = $1, description = $2, category = $3, author = $4,
            submitted_by = $5, submitted_by_user_id = $6, package_name = $7,
            submitted_at = CURRENT_TIMESTAMP
        WHERE skill_id = $8 AND version = $9 AND status = 'pending'
      `, [title, description || '', category, author, submittedBy, submitter.id, packageName, skill_id, version]);
    } else {
      await client.query(`
        INSERT INTO skill_submissions (
          skill_id, title, slug, description, avatar, avatar_color, category, author,
          install_command, install_url, version, package_name,
          status, submitted_by, submitted_by_user_id, submitted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', $13, $14, CURRENT_TIMESTAMP)
      `, [skill_id, title, skill_id, description || '', (title.charAt(0).toUpperCase() || 'S'), 'av-teal', category, author,
          installCommand, installUrl, version, packageName, submittedBy, submitter.id]);
    }

    // 3. 同步到 1Panel Skills Hub(总是执行)
    let panelUpload;
    try {
      panelUpload = await uploadSkillToPanel({
        skillId: skill_id,
        title,
        version,
        fileContent,
        originalName: packageName,
        confirmOverwrite,
      });
    } catch (e) {
      console.error('[skill-upload] 1Panel 上传失败, 回滚本地:', e.message);
      await client.query('ROLLBACK');
      return res.status(502).json({
        error: '上传到 1Panel Skills Hub 失败',
        reason: e.message,
        code: e.code || 'PANEL_SKILL_UPLOAD_FAILED',
      });
    }

    // 3. 回填 1Panel 技能标识, 提交事务
    await client.query(`
      UPDATE skill_submissions
      SET panel_skill_id = $1, panel_status = $2, panel_raw_data = $3,
          panel_uploaded_at = CURRENT_TIMESTAMP
      WHERE skill_id = $4 AND version = $5 AND status = 'pending'
    `, [panelUpload.id || null, panelUpload.status || null, panelUpload.raw || {}, skill_id, version]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: '技能包上传成功，等待审核',
      skill_id,
      package_name: packageName,
      install_command: installCommand,
    });
  } catch (err) {
    console.error('Error uploading skill:', err);
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: '上传失败' });
  } finally {
    client.release();
    // 删除 multer 临时文件
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
  }
});

router.get('/api/my/skills', verifyUser, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const result = await global.pool.query(`
      SELECT
        s.id,
        s.skill_id,
        s.title,
        s.slug,
        s.description,
        s.category,
        s.author,
        s.version,
        COALESCE(s.package_name, NULLIF(regexp_replace(s.file_path, '^.*/', ''), '')) AS package_name,
        s.status,
        s.submitted_by,
        s.submitted_at,
        s.reviewed_at,
        s.review_note,
        live.is_active,
        live.downloads,
        COUNT(*) OVER() AS _total
      FROM skill_submissions s
      LEFT JOIN skills live ON live.id = s.skill_id
      WHERE s.submitted_by_user_id = $1
      ORDER BY s.submitted_at DESC
      LIMIT $2 OFFSET $3
    `, [req.portalUser.id, limit, offset]);

    const total = result.rows.length > 0 ? parseInt(result.rows[0]._total) : 0;
    const data = result.rows.map(({ _total, ...row }) => row);

    res.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error fetching my skills:', err);
    res.status(500).json({ error: '获取我的技能失败' });
  }
});

// 删除 1Panel 上的技能(撤销提交时同步删除远端 pending 技能)
async function deletePanelSkill(panelSkillId) {
  const response = await panel.post('/api/v2/core/enterprise/skills-hub/delete', { id: panelSkillId });
  const bizError = panelBizError(response);
  if (response.status < 200 || response.status >= 300 || bizError) {
    // 1Panel 若已不存在该技能(record not found), 视为删除成功, 不阻断撤销/删除流程
    if (bizError && /not found|不存在|未找到/i.test(String(bizError))) {
      return;
    }
    const err = new Error(bizError || `HTTP ${response.status}`);
    err.code = 'PANEL_SKILL_DELETE_FAILED';
    throw err;
  }
}

// 撤销提交(用户侧): 仅 pending 可撤销; 同步删除 1Panel 对应技能, 本地标记 withdrawn(留记录)
router.post('/api/my/skills/:id/withdraw', verifyUser, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const submission = await global.pool.query(
      'SELECT id, title, panel_skill_id, status FROM skill_submissions WHERE id = $1 AND submitted_by_user_id = $2',
      [id, req.portalUser.id]
    );
    if (submission.rowCount === 0) {
      return res.status(404).json({ error: '提交记录不存在' });
    }
    const row = submission.rows[0];
    if (row.status !== 'pending') {
      return res.status(400).json({ error: '只有待审核的提交可以撤销' });
    }

    // 始终保持与 1Panel 同步: 删除远端 pending 技能
    if (row.panel_skill_id) {
      try {
        await deletePanelSkill(row.panel_skill_id);
      } catch (e) {
        console.error('[withdraw] 1Panel 删除失败:', e.message);
        return res.status(502).json({
          error: '1Panel 技能删除失败',
          reason: e.message,
          code: e.code || 'PANEL_SKILL_DELETE_FAILED',
        });
      }
    }

    await global.pool.query(
      `UPDATE skill_submissions
       SET status = 'withdrawn', reviewed_at = CURRENT_TIMESTAMP, review_note = '用户已撤销'
       WHERE id = $1`,
      [id]
    );

    res.json({ success: true, message: '已撤销' });
  } catch (err) {
    console.error('Error withdrawing skill:', err);
    res.status(500).json({ error: '撤销失败' });
  }
});

// 获取 Skill manifest（CLI 用）
router.get('/api/skills/:slug/manifest', async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await global.pool.query(`
      SELECT id, title, slug, description, version, author, file_path, type, runtime, panel_skill_id
      FROM skills
      WHERE slug = $1 AND is_active = TRUE
    `, [slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '技能不存在' });
    }

    const skill = result.rows[0];

    if (!skill.file_path && !skill.panel_skill_id) {
      return res.status(404).json({ error: '技能包文件不存在' });
    }

    // 优先使用审核时落表的探测结果——零 IO
    let type = skill.type || 'prompt';
    let runtime = skill.runtime || null;

    // 兜底：旧数据(010 迁移前审核通过的技能)没有 type 字段,回退到下载 zip 探测
    // 命中条件:type 为 NULL(老数据缺字段)。新数据 type 至少是 'prompt',不会进这里
    if (!skill.type) {
      try {
        const AdmZip = require('adm-zip');
        const fileBuffer = await storage.download(skill.file_path);
        const zip = new AdmZip(fileBuffer);
        const entries = zip.getEntries().map(e => e.entryName);

        const hasPy = entries.some(e => e.endsWith('.py'));
        const hasNode = entries.some(e => e === 'package.json');
        const hasRequirements = entries.some(e => e === 'requirements.txt');

        if (hasRequirements || hasPy) {
          type = 'script';
          runtime = 'python';
        } else if (hasNode) {
          type = 'script';
          runtime = 'node';
        }
      } catch {
        // adm-zip 未安装或下载失败时忽略，按 prompt 类型返回
      }
    }

    res.json({
      name: skill.slug,
      version: skill.version,
      description: skill.description,
      type,
      runtime,
      author: skill.author,
    });
  } catch (err) {
    console.error('Error fetching manifest:', err);
    res.status(500).json({ error: '获取 manifest 失败' });
  }
});

// 下载 Skill 包（CLI 用）
const SLUG_BLACKLIST = ['api', 'admin', 'download', 'manifest', 'versions', 'categories', 'health', 'stats', 'submit'];
router.get('/api/skills/:slug/download', verifyUser, requirePermission('skill:view'), downloadLimiter, async (req, res) => {
  try {
    const { slug } = req.params;
    const { v: version } = req.query;
    if (SLUG_BLACKLIST.includes(slug)) {
      return res.status(400).json({ error: '无效的 slug' });
    }

    // 资源组白名单校验:普通用户只能下载其资源组勾选的技能(防绕过广场列表直接下载)
    const { canUserAccessSkill } = require('../lib/permission');
    if (!(await canUserAccessSkill(req.portalUser.id, slug))) {
      return res.status(403).json({ code: 'FORBIDDEN', error: '无权访问该技能' });
    }

    // 下载文件名去掉 1panel- 前缀（slug 加前缀是为了 DB 唯一约束，文件名不需要）
    const downloadName = slug.startsWith('1panel-') ? slug.slice(7) : slug;

    let filePath;
    let panelSkillId = null; // 非 null 表示来源是 1Panel
    if (version) {
      // 按版本下载：先确定技能来源
      const skillInfo = await global.pool.query(`
        SELECT id, source, panel_skill_id FROM skills
        WHERE slug = $1 AND is_active = TRUE
      `, [slug]);
      if (skillInfo.rows.length === 0) {
        return res.status(404).json({ error: '技能不存在' });
      }
      const skillRow = skillInfo.rows[0];

      if (skillRow.source === 'panel') {
        // panel 来源：搜 1Panel 拿有效 ID，再调 versions 找到对应版本专属 id 下载
        try {
          const panelName = slug.startsWith('1panel-') ? slug.slice(7) : slug;
          const searchRes = await panel.post('/api/v2/core/enterprise/skills-hub/search', {
            page: 1, pageSize: 1, info: panelName, status: 'published',
          });
          let searchId = skillRow.panel_skill_id;
          if (searchRes.status >= 200 && searchRes.status < 300 && !panelBizError(searchRes)) {
            const items = getPanelItems(searchRes.data);
            // 模糊搜索 info=panelName 可能返回其他名称含 panelName 的技能，
            // 必须精确匹配 name，否则会下载到错误技能的包
            const exact = items.find(it => String(it.name || '') === panelName);
            if (exact) searchId = exact.id;
          }
          if (!searchId) {
            return res.status(404).json({ error: '版本不存在' });
          }

          const verRes = await panel.post('/api/v2/core/enterprise/skills-hub/versions', {
            id: searchId,
          });
          if (verRes.status >= 200 && verRes.status < 300 && !panelBizError(verRes)) {
            const payload = getPanelPayload(verRes.data);
            const allVersions = Array.isArray(payload) ? payload : [];
            const match = allVersions.find(v => v && v.version === version);
            if (match) {
              panelSkillId = match.id;
              downloadCounter.increment(skillRow.id);
              global.pool.query(
                `INSERT INTO download_stats (skill_id, user_agent, ip_hash, user_id) VALUES ($1, $2, $3, $4)`,
                [skillRow.id, req.headers['user-agent'] || '', req.ip, String(req.user.id)]
              ).catch(() => {});
            }
          }
        } catch (e) {
          console.error(`[download] 1Panel versions 查询失败:`, e.message);
        }
        if (!panelSkillId) {
          return res.status(404).json({ error: '版本不存在' });
        }
      } else {
        // local 来源：查本地 skill_versions 表
        const result = await global.pool.query(`
          SELECT sv.file_path, s.panel_skill_id
          FROM skill_versions sv
          JOIN skills s ON sv.skill_id = s.id
          WHERE s.slug = $1 AND sv.version = $2 AND s.is_active = TRUE
        `, [slug, version]);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: '版本不存在' });
        }
        filePath = result.rows[0].file_path;
        panelSkillId = result.rows[0].panel_skill_id || null;
        downloadCounter.increment(skillRow.id);
        global.pool.query(
          `INSERT INTO download_stats (skill_id, user_agent, ip_hash, user_id) VALUES ($1, $2, $3, $4)`,
          [skillRow.id, req.headers['user-agent'] || '', req.ip, String(req.user.id)]
        ).catch(() => {});
      }
    } else {
      const result = await global.pool.query(`
        SELECT id, file_path, source, panel_skill_id
        FROM skills
        WHERE slug = $1 AND is_active = TRUE
      `, [slug]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: '技能不存在' });
      }
      const row = result.rows[0];
      filePath = row.file_path;
      panelSkillId = row.panel_skill_id || null;
      // 增加下载量(走缓冲计数器,避免热点行写) —— 本地和 1Panel 都计数
      downloadCounter.increment(row.id);
      global.pool.query(
        `INSERT INTO download_stats (skill_id, user_agent, ip_hash, user_id) VALUES ($1, $2, $3, $4)`,
        [row.id, req.headers['user-agent'] || '', req.ip, String(req.user.id)]
      ).catch(() => {});
    }
    // 1Panel 来源:转发到 skills-hub/download
    if (panelSkillId) {
      try {
        const buffer = await downloadPanelSkill(panelSkillId);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}.zip"`);
        return res.send(buffer);
      } catch (err) {
        console.error('1Panel 技能下载失败:', err.message);
        return res.status(502).json({ error: '远端技能下载失败: ' + err.message });
      }
    }

    if (!filePath) {
      return res.status(404).json({ error: '技能包文件未找到' });
    }

    // COS 模式：直接下载文件并以正确文件名返回
    const signedUrl = storage.getSignedUrl(filePath);
    if (signedUrl) {
      const fileBuffer = await storage.download(filePath);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}.zip"`);
      return res.send(fileBuffer);
    }

    // Local 模式：直接发送文件
    const localPath = storage.getLocalPath(filePath);
    if (!fs.existsSync(localPath)) {
      return res.status(404).json({ error: '技能包文件未找到' });
    }
    res.download(localPath, `${downloadName}.zip`);
  } catch (err) {
    console.error('Error downloading skill:', err);
    res.status(500).json({ error: '下载失败' });
  }
});

// 获取技能版本历史
// panel 来源技能调 1Panel skills-hub/versions 接口；local 来源查本地 skill_versions 表
router.get('/api/skills/:slug/versions', async (req, res) => {
  try {
    const { slug } = req.params;

    // 先查技能元信息（source + panel_skill_id + version 用于 local 最新版本排序）
    const skillResult = await global.pool.query(`
      SELECT id, source, panel_skill_id, version FROM skills
      WHERE slug = $1 AND is_active = TRUE
    `, [slug]);

    if (skillResult.rows.length === 0) {
      return res.status(404).json({ error: '技能不存在' });
    }

    const skill = skillResult.rows[0];

    // panel 来源：先搜 1Panel 拿到有效 ID，再调 versions 接口
    // 不能用本地 panel_skill_id 直接传——sync 时每个版本存了不同 ID，未必是 versions 接口要的那个
    if (skill.source === 'panel') {
      try {
        // 从 slug 提取 1Panel 技能名（去掉 "1panel-" 前缀）
        const panelName = slug.startsWith('1panel-') ? slug.slice(7) : slug;
        const searchRes = await panel.post('/api/v2/core/enterprise/skills-hub/search', {
          page: 1, pageSize: 1, info: panelName, status: 'published',
        });

        let searchId = skill.panel_skill_id; // 兜底
        if (searchRes.status >= 200 && searchRes.status < 300 && !panelBizError(searchRes)) {
          const items = getPanelItems(searchRes.data);
          // 模糊搜索可能返回其他名称含 panelName 的技能，必须精确匹配 name
          const exact = items.find(it => String(it.name || '') === panelName);
          if (exact) searchId = exact.id;
        }

        if (!searchId) {
          return res.json({ data: [], source: 'panel' });
        }

        const response = await panel.post('/api/v2/core/enterprise/skills-hub/versions', {
          id: searchId,
        });

        if (response.status >= 200 && response.status < 300) {
          const bizError = panelBizError(response);
          if (!bizError) {
            const payload = getPanelPayload(response.data);
            const versions = Array.isArray(payload) ? payload : [];
            // 只返回已发布的版本，过滤掉无 version 的脏数据
            return res.json({
              data: versions
                .filter(v => v && v.version && v.status === 'published')
                .map(v => ({
                  id: v.id,
                  version: v.version,
                  status: v.status,
                  isLatest: !!v.isLatest,
                  isLatestPublished: !!v.isLatestPublished,
                  publishedAt: v.publishedAt || null,
                  createdAt: v.createdAt,
                })),
              source: 'panel',
            });
          }
        }
      } catch (e) {
        console.error(`[skill-versions] 1Panel 查询失败(slug=${slug}):`, e.message);
      }
      // 1Panel 不可达时兜底返回空列表，不抛错
      return res.json({ data: [], source: 'panel', error: '1Panel 版本信息暂不可用' });
    }

    // local 来源：查本地 skill_versions 表, 最新版本(与 skills.version 一致)排最上并标记 isLatest
    const result = await global.pool.query(`
      SELECT sv.version, sv.file_path, sv.description, sv.created_at,
             (sv.version = $2) AS is_latest
      FROM skill_versions sv
      WHERE sv.skill_id = $1
      ORDER BY (sv.version = $2) DESC, sv.created_at DESC
    `, [skill.id, skill.version]);

    res.json({
      data: result.rows.map(r => ({
        version: r.version,
        file_path: r.file_path,
        description: r.description,
        createdAt: r.created_at,
        isLatest: !!r.is_latest,
        status: 'published',
      })),
      source: 'local',
    });
  } catch (err) {
    console.error('Error fetching versions:', err);
    res.status(500).json({ error: '获取版本列表失败' });
  }
});

// 获取分类列表
router.get('/api/categories', async (req, res) => {
  try {
    const result = await global.pool.query(`
      SELECT category, COUNT(*) as count
      FROM skills
      WHERE is_active = TRUE
      GROUP BY category
      ORDER BY count DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: '获取分类列表失败' });
  }
});

// ============ 管理后台 - 技能管理 API ============

// 获取所有已上线技能（包括已下架的）- 支持分页


module.exports = router;
