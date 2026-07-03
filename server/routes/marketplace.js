const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const storage = require('../lib/storage');
const downloadCounter = require('../lib/downloadCounter');
const { panel, getPanelPayload, getPanelItems, downloadPanelSkill } = require('../panel');
const { downloadLimiter, uploadLimiter, verifyUser } = require('../auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '../../data/uploads/skills');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  dest: path.join(UPLOAD_DIR, '_tmp'),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .zip 文件'));
    }
  },
});

function panelBizError(response) {
  const data = response?.data;
  if (!data || typeof data !== 'object') return null;
  const code = Number(data.code);
  if (Number.isFinite(code) && code >= 400) {
    return data.message || data.msg || `1Panel business code=${code}`;
  }
  return null;
}

async function isPanelSkillUploadEnabled() {
  const result = await global.pool.query(
    "SELECT value FROM system_config WHERE key = 'panel_skill_upload_enabled' LIMIT 1"
  );
  return result.rows[0]?.value === 'true';
}

async function isSkillSubmitEnabled() {
  const result = await global.pool.query(
    "SELECT value FROM system_config WHERE key = 'portal_skill_submit_enabled' LIMIT 1"
  );
  return result.rows[0]?.value === 'true';
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

async function uploadSkillToPanel({ skillId, title, description, category, version, author, filePath, originalName }) {
  const panelName = buildPanelSkillName(originalName, skillId);
  const beforeRemoteIds = await listPanelSkillIds();
  const response = await panel.postMultipart('/api/v2/core/enterprise/skills-hub/upload', {
    fields: {
      name: panelName,
      title,
      description: description || '',
      category,
      version,
      author,
    },
    files: [{
      name: 'file',
      filename: originalName,
      contentType: 'application/zip',
      content: fs.readFileSync(filePath),
    }],
  });
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
      avatar = 'S',
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
router.get('/api/skills', async (req, res) => {
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
      return res.json(result.rows[0]);
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 12)); // 最大100条
    const offset = (pageNum - 1) * limitNum;

    // 用 COUNT(*) OVER() 合并计数和分页，单次 SQL 拿到总数 + 数据
    let whereClause = 'WHERE is_active = TRUE';
    const params = [];
    let paramIndex = 1;

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

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching skill:', err);
    res.status(500).json({ error: '获取技能详情失败' });
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
    `, [id, req.headers['user-agent'] || '', '']);

    // 返回当前 DB 中的 downloads(不含本次未 flush 的累计),与旧契约同形
    res.json({ success: true, downloads: parseInt(result.rows[0].downloads) });
  } catch (err) {
    console.error('Error recording download:', err);
    res.status(500).json({ error: '记录下载失败' });
  }
});

// ============ Skill 包上传/下载 API ============

// 上传 Skill 包（zip）
router.post('/api/skills/upload', verifyUser, uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!(await isSkillSubmitEnabled())) {
      return res.status(403).json({
        code: 'SKILL_SUBMIT_DISABLED',
        error: '提交技能功能暂未开放',
      });
    }

    const { skill_id, title, description, category, version = 'v1.0.0' } = req.body;

    if (!skill_id || !title || !category) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请上传 .zip 文件' });
    }

    const submitter = req.portalUser;
    const submittedBy = submitter.name || submitter.username;
    const author = submittedBy;
    const packageName = req.file.originalname;
    let panelUpload = null;

    if (await isPanelSkillUploadEnabled()) {
      try {
        panelUpload = await uploadSkillToPanel({
          skillId: skill_id,
          title,
          description: description || '',
          category,
          version,
          author,
          filePath: req.file.path,
          originalName: packageName,
        });
      } catch (e) {
        console.error('[skill-upload] 1Panel 上传失败:', e.message);
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(502).json({
          error: '上传到 1Panel Skills Hub 失败',
          reason: e.message,
          code: e.code || 'PANEL_SKILL_UPLOAD_FAILED',
        });
      }
    }

    // 开关开启且 1Panel 已上传成功时,不再上传到 COS/local storage。
    // 只保留 panel_skill_id,后续下载走 1Panel skills-hub/download。
    const filePath = panelUpload ? null : await storage.upload(skill_id, req.file.path, version);

    // 删除 multer 临时文件
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    const installCommand = `skillctl install ${skill_id}`;
    const installUrl = `/api/skills/${skill_id}/download`;

    // 写入待审核表
    // 同 skill_id + 同 version → 覆盖（用户可能传错文件重新上传）
    // 同 skill_id + 不同 version → 新增（版本迭代）
    const existing = await global.pool.query(
      'SELECT id FROM skill_submissions WHERE skill_id = $1 AND version = $2 AND status = $3',
      [skill_id, version, 'pending']
    );

    if (existing.rows.length > 0) {
      // 已有待审核的同版本记录，更新文件
      await global.pool.query(`
        UPDATE skill_submissions
        SET file_path = $1, title = $2, description = $3, category = $4,
            author = $5, submitted_by = $6, submitted_by_user_id = $7,
            package_name = $8,
            panel_skill_id = $9, panel_status = $10, panel_raw_data = $11,
            panel_uploaded_at = CASE WHEN $9::integer IS NULL THEN panel_uploaded_at ELSE CURRENT_TIMESTAMP END,
            submitted_at = CURRENT_TIMESTAMP
        WHERE skill_id = $12 AND version = $13 AND status = 'pending'
      `, [filePath, title, description || '', category, author, submittedBy, submitter.id,
          packageName, panelUpload?.id || null, panelUpload?.status || null, panelUpload?.raw || {},
          skill_id, version]);
    } else {
      // 新版本或首次提交，创建新记录
      await global.pool.query(`
        INSERT INTO skill_submissions (
          skill_id, title, slug, description, category, author,
          install_command, install_url, version, file_path, package_name,
          panel_skill_id, panel_status, panel_raw_data, panel_uploaded_at,
          status, submitted_by, submitted_by_user_id, submitted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                  $12, $13, $14, CASE WHEN $12::integer IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,
                  'pending', $15, $16, CURRENT_TIMESTAMP)
      `, [skill_id, title, skill_id, description || '', category, author,
          installCommand, installUrl, version, filePath, packageName,
          panelUpload?.id || null, panelUpload?.status || null, panelUpload?.raw || {},
          submittedBy, submitter.id]);
    }

    res.json({
      success: true,
      message: '技能包上传成功，等待审核',
      skill_id,
      package_name: packageName,
      install_command: installCommand,
    });
  } catch (err) {
    console.error('Error uploading skill:', err);
    res.status(500).json({ error: '上传失败' });
  }
});

router.get('/api/my/skills', verifyUser, async (req, res) => {
  try {
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
        live.downloads
      FROM skill_submissions s
      LEFT JOIN skills live ON live.id = s.skill_id
      WHERE s.submitted_by_user_id = $1
      ORDER BY s.submitted_at DESC
    `, [req.portalUser.id]);

    res.json({ data: result.rows });
  } catch (err) {
    console.error('Error fetching my skills:', err);
    res.status(500).json({ error: '获取我的技能失败' });
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
router.get('/api/skills/:slug/download', downloadLimiter, async (req, res) => {
  try {
    const { slug } = req.params;
    const { v: version } = req.query;
    if (SLUG_BLACKLIST.includes(slug)) {
      return res.status(400).json({ error: '无效的 slug' });
    }

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
            if (items.length > 0) searchId = items[0].id;
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
      }
    } else {
      // 下载最新版本——读取 source / panel_skill_id 用于下游分流
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
    }

    // 1Panel 来源:转发到 skills-hub/download
    if (panelSkillId) {
      try {
        const buffer = await downloadPanelSkill(panelSkillId);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${slug}.zip"`);
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
      res.setHeader('Content-Disposition', `attachment; filename="${slug}.zip"`);
      return res.send(fileBuffer);
    }

    // Local 模式：直接发送文件
    const localPath = storage.getLocalPath(filePath);
    if (!fs.existsSync(localPath)) {
      return res.status(404).json({ error: '技能包文件未找到' });
    }
    res.download(localPath, `${slug}.zip`);
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

    // 先查技能元信息（source + panel_skill_id）
    const skillResult = await global.pool.query(`
      SELECT id, source, panel_skill_id FROM skills
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
          if (items.length > 0) searchId = items[0].id;
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

    // local 来源：查本地 skill_versions 表
    const result = await global.pool.query(`
      SELECT sv.version, sv.file_path, sv.description, sv.created_at
      FROM skill_versions sv
      WHERE sv.skill_id = $1
      ORDER BY sv.created_at DESC
    `, [skill.id]);

    res.json({ data: result.rows, source: 'local' });
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
