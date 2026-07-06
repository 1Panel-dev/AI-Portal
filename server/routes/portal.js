const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { verifyAdmin, verifyUser, signPortalToken } = require('../auth');
const { panel, getPanelPayload, getPanelItems, findPanelUser, createPanelUser, syncModelsFromPanel } = require('../panel');
const { isAnyProviderEnabled } = require('../oauth');

const router = express.Router();

function sanitizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function formatPortalUser(user) {
  return {
    id: user.id,
    panel_user_id: user.panel_user_id,
    username: user.username,
    name: user.name,
    role: user.role,
    status: user.status,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
  };
}

router.post('/api/auth/register', async (req, res) => {
  try {
    // OAuth 启用时关闭自助注册
    if (await isAnyProviderEnabled(global.pool)) {
      return res.status(403).json({
        code: 'REGISTER_DISABLED',
        error: '已启用第三方登录,自助注册已关闭,请联系管理员或使用第三方账号登录'
      });
    }

    const rawUsername = sanitizeUsername(req.body.username);
    const rawPassword = req.body.password;
    const rawName = String(req.body.name || '').trim() || rawUsername;

    if (!rawUsername || rawUsername.length < 3 || rawUsername.length > 30) {
      return res.status(400).json({ error: '用户名需3-30位字符' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(rawUsername)) {
      return res.status(400).json({ error: '用户名只能包含英文、数字和下划线' });
    }
    if (!rawPassword || rawPassword.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }

    const existing = await global.pool.query('SELECT id FROM portal_users WHERE username ILIKE $1', [rawUsername]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    let panelUserId = null;
    let sessionTimeout = 86400;
    try {
      const panelUser = await findPanelUser(rawUsername);
      if (panelUser) {
        panelUserId = panelUser.id;
        sessionTimeout = panelUser.sessionTimeout || 86400;
      } else {
        try {
          await createPanelUser({ username: rawUsername, password: rawPassword, name: rawName });
          // 1Panel 创建用户返回 data:null，需要再查一次拿 id
          const created = await findPanelUser(rawUsername);
          if (created) {
            panelUserId = created.id;
            sessionTimeout = created.sessionTimeout || 86400;
          }
        } catch (createErr) {
          console.error('1Panel 用户创建失败，仍允许本地注册:', createErr.message);
        }
      }
    } catch (panelErr) {
      console.error('1Panel 用户查询失败，仍允许本地注册:', panelErr.message);
    }

    const passwordHash = await bcrypt.hash(rawPassword, 12);
    const result = await global.pool.query(`
      INSERT INTO portal_users (panel_user_id, username, name, password_hash, session_timeout, status, role)
      VALUES ($1, $2, $3, $4, $5, 'active', 'user')
      RETURNING id, panel_user_id, username, name, role, status, last_login_at, created_at
    `, [panelUserId, rawUsername, rawName, passwordHash, sessionTimeout]);

    const user = result.rows[0];
    const token = signPortalToken(user);
    res.json({ token, user: formatPortalUser(user) });
  } catch (err) {
    console.error('注册失败:', err);
    res.status(500).json({ error: '注册失败' });
  }
});

router.post('/api/auth/login', async (req, res) => {
  try {
    const rawUsername = sanitizeUsername(req.body.username);
    const rawPassword = req.body.password;

    if (!rawUsername || !rawPassword) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    // 查找用户（包括普通用户和管理员）
    // 用 ILIKE 不区分大小写，但如果有大小写冲突（zhangsan + Zhangsan），要求精确匹配
    let result = await global.pool.query(`
      SELECT * FROM portal_users
      WHERE username ILIKE $1 AND status = 'active'
    `, [rawUsername]);

    if (result.rowCount > 1) {
      // 精确匹配优先
      const exact = result.rows.find(r => r.username === rawUsername);
      if (exact) {
        result = { rows: [exact], rowCount: 1 };
      } else {
        return res.status(401).json({ error: '用户名不明确，请使用精确大小写登录' });
      }
    }

    if (result.rowCount === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const user = result.rows[0];

    // 验证密码
    const valid = await bcrypt.compare(rawPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 更新最后登录时间
    await global.pool.query('UPDATE portal_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // 根据角色生成不同的 token
    let token;
    if (user.role === 'admin') {
      // 管理员 token
      const { signAdminToken } = require('../auth');
      token = signAdminToken(user);
    } else {
      // 普通用户 token
      token = signPortalToken(user);
    }

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        status: user.status,
      }
    });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ error: '登录失败' });
  }
});

router.get('/api/auth/me', verifyUser, async (req, res) => {
  try {
    // 加载 password_hash 判断 has_password
    const r = await global.pool.query(
      'SELECT password_hash, auto_created_from FROM portal_users WHERE id=$1',
      [req.portalUser.id]
    );
    const extra = r.rows[0] || {};
    res.json({
      ...formatPortalUser(req.portalUser),
      has_password: !!(extra.password_hash && extra.password_hash.length > 0),
      auto_created_from: extra.auto_created_from || null,
    });
  } catch (err) {
    console.error('[auth/me] failed:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

router.put('/api/auth/password', verifyUser, async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }

    const hash = await bcrypt.hash(new_password, 12);
    await global.pool.query('UPDATE portal_users SET password_hash = $1 WHERE id = $2', [hash, req.portalUser.id]);

    // 同步密码到 1Panel（如果用户已关联 1Panel 账号）
    if (req.portalUser.panel_user_id) {
      try {
        console.log(`[密码同步] 开始同步用户 ${req.portalUser.username} (ID: ${req.portalUser.id}, Panel ID: ${req.portalUser.panel_user_id}) 的密码到 1Panel`);

        // 先获取 1Panel 用户完整信息
        const userInfoRes = await panel.post('/api/v2/core/enterprise/users/search', {
          page: 1,
          pageSize: 1,
          info: req.portalUser.username,
        });

        const users = getPanelItems(userInfoRes.data);
        const panelUser = users.find(u => String(u.id) === String(req.portalUser.panel_user_id));

        if (panelUser) {
          console.log(`[密码同步] 找到 1Panel 用户: ${panelUser.name} (ID: ${panelUser.id})`);

          // 1Panel 密码使用 base64 编码
          const encodedPassword = Buffer.from(new_password, 'utf-8').toString('base64');

          // 更新 1Panel 用户信息（包含密码）
          const updateRes = await panel.post('/api/v2/core/enterprise/users/update', {
            id: req.portalUser.panel_user_id,
            name: panelUser.name || req.portalUser.username,
            sessionTimeout: panelUser.sessionTimeout || 86400,
            isSuperAdmin: panelUser.isSuperAdmin || false,
            nodeRoles: (panelUser.nodeRoles || []).map(r => ({ nodeId: r.nodeId, roleId: r.roleId })),
            description: panelUser.description || '',
            createdAt: panelUser.createdAt,
            password: encodedPassword,
          });

          if (updateRes.status >= 200 && updateRes.status < 300) {
            console.log(`[密码同步] ✅ 用户 ${req.portalUser.username} 密码同步到 1Panel 成功`);
          } else {
            console.error(`[密码同步] ❌ 用户 ${req.portalUser.username} 密码同步到 1Panel 失败: Status ${updateRes.status}`);
          }
        } else {
          console.warn(`[密码同步] ⚠️ 未在 1Panel 找到用户 ${req.portalUser.username} (Panel ID: ${req.portalUser.panel_user_id})`);
        }
      } catch (err) {
        console.error(`[密码同步] ❌ 用户 ${req.portalUser.username} 同步密码到 1Panel 失败:`, err.message);
        // 不阻塞主流程，本地密码已更新成功
      }
    } else {
      console.log(`[密码同步] 用户 ${req.portalUser.username} 未关联 1Panel 账号，跳过同步`);
    }

    res.json({ success: true, message: '密码已更新' });
  } catch (err) {
    console.error('修改密码失败:', err);
    res.status(500).json({ error: '修改密码失败' });
  }
});

router.get('/api/models', async (req, res) => {
  try {
    let rows = [];
    let syncFailedReason = null;  // 记录首次兜底同步是否失败,用于给前端 hint
    try {
      const result = await global.pool.query(`
        SELECT id, group_name, model_name, provider, base_url, model_type, is_active
        FROM portal_models
        WHERE is_active = TRUE
        ORDER BY group_name, model_name
      `);
      rows = result.rows;
    } catch (dbErr) {
      if (dbErr.message.includes('does not exist') || dbErr.message.includes('不存在')) {
        rows = [];
      } else {
        throw dbErr;
      }
    }

    if (rows.length === 0) {
      try {
        await syncModelsFromPanel();
        const result = await global.pool.query(`
          SELECT id, group_name, model_name, provider, base_url, model_type, is_active
          FROM portal_models
          WHERE is_active = TRUE
          ORDER BY group_name, model_name
        `);
        rows = result.rows;
      } catch (syncErr) {
        console.error('首次模型同步失败:', syncErr.message);
        syncFailedReason = syncErr.message;
      }
    }

    const PROVIDER_LABELS = {
      deepseek: '深度求索',
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      zhipu: '智谱 AI',
      qwen: '阿里云百炼',
      ark: '火山方舟',
      'ark-coding-plan': '火山方舟',
      vllm: 'vLLM',
      custom: '自定义',
    };

    const groups = {};
    for (const row of rows) {
      const providerKey = (row.provider || 'custom').toLowerCase();
      const groupLabel = PROVIDER_LABELS[providerKey] || providerKey;
      if (!groups[row.group_name]) {
        groups[row.group_name] = { name: groupLabel, provider: row.provider, models: [] };
      }
      groups[row.group_name].models.push(row);
    }

    res.json({
      groups: Object.values(groups),
      totalModels: rows.length,
      totalGroups: Object.keys(groups).length,
      // 仅当首次兜底同步失败 + DB 也确实没数据时才返回 hint
      // DB 里有缓存数据 → 不打扰用户(只是这次没拿到最新增量,后台调度器会继续重试)
      ...(syncFailedReason && rows.length === 0 ? {
        hint: '模型列表暂时无法从 1Panel 同步,请稍后刷新或联系管理员',
        hintReason: syncFailedReason,
      } : {}),
    });
  } catch (err) {
    console.error('获取模型列表失败:', err);
    res.status(500).json({ error: '获取模型列表失败' });
  }
});

router.post('/api/models/sync', verifyAdmin, async (req, res) => {
  try {
    const result = await syncModelsFromPanel();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('模型同步失败:', err);
    res.status(500).json({ error: '模型同步失败: ' + err.message });
  }
});

// 公开端点:返回「调用示例」配置项,供前端模型页渲染 curl 模板
// 占位符约定:{{base_url}} {{model_name}} {{api_key}} 由前端按上下文替换
router.get('/api/models/example', async (req, res) => {
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
    console.error('获取调用示例配置失败:', err);
    res.status(500).json({ error: '获取调用示例配置失败' });
  }
});

// 公开端点:返回「提交技能开关」与「skillctl 文档地址」,供前端展示用
// 不缓存:管理员改完立即生效是更重要的诉求,几行 system_config 查询完全可以承受
router.get('/api/config/feature-flags', async (req, res) => {
  try {
    const result = await global.pool.query(`
      SELECT key, value FROM system_config
      WHERE key IN ('portal_skill_submit_enabled', 'site_skillctl_doc_url')
    `);
    const map = {};
    for (const row of result.rows) map[row.key] = row.value;
    res.json({
      skillSubmitEnabled: map.portal_skill_submit_enabled === 'true',
      skillctlDocUrl: map.site_skillctl_doc_url || '',
    });
  } catch (err) {
    console.error('获取功能开关失败:', err);
    res.status(500).json({ error: '获取功能开关失败' });
  }
});

router.get('/api/keys', verifyUser, async (req, res) => {
  try {
    // 诊断:打印当前 token 解析出的身份,用于排查"第二天看不到 key"
    console.log(`[GET /api/keys] portalUser id=${req.portalUser.id} username=${req.portalUser.username} panel_user_id=${req.portalUser.panel_user_id || '(空)'}`);

    // 先查本地数据库（含完整 key）
    const result = await global.pool.query(`
      SELECT id, panel_key_id, api_key_mask, api_key_cipher, status, remark, created_at
      FROM portal_api_keys
      WHERE user_id = $1
      LIMIT 1
    `, [req.portalUser.id]);
    console.log(`[GET /api/keys] 本地查询 → rowCount=${result.rowCount}${result.rowCount > 0 ? ` key.id=${result.rows[0].id} panel_key_id=${result.rows[0].panel_key_id}` : ''}`);
    console.log(`[GET /api/keys] 本地 portal_api_keys 查询 user_id=${req.portalUser.id} → rowCount=${result.rowCount}`);
    console.log(`[GET /api/keys] user.id=${req.portalUser.id} username=${req.portalUser.username} panel_user_id=${req.portalUser.panel_user_id || '(空)'} → 本地 rowCount=${result.rowCount}`);

    if (result.rowCount > 0) {
      const row = result.rows[0];

      // 有 panel_user_id 时验证 1Panel 端 key 是否还存在
      // 防止用户在 1Panel 管理后台删了 key 但 Portal 还在展示假数据
      if (req.portalUser.panel_user_id) {
        try {
          const userKeys = await listPanelKeysOfUser(req.portalUser.panel_user_id);
          // 按 panel_key_id 精确匹配；若本地 panel_key_id 为空但该用户在远端恰好只有一把 key，也视为匹配
          const match = row.panel_key_id
            ? userKeys.find(k => String(k.id) === String(row.panel_key_id))
            : (userKeys.length === 1 ? userKeys[0] : null);

          if (match) {
            // key 在 1Panel 还存在 → 用远端数据更新本地缓存（mask/cipher 可能已变化）
            let fullKey = row.api_key_cipher;
            let keyMask = match.apiKeyMask || row.api_key_mask;
            try {
              const revealRes = await panel.post('/api/v2/core/enterprise/ai-proxy/api-keys/reveal', { id: match.id });
              // 1Panel 习惯 HTTP 200 + body.code>=400 表达业务失败，必须校验（CLAUDE.md 规则#2）
              const revealBiz = inspectPanelBiz(revealRes);
              if (revealRes.status >= 200 && revealRes.status < 300 && revealBiz.ok) {
                const revealed = getPanelPayload(revealRes.data) || {};
                if (revealed.apiKey) fullKey = revealed.apiKey;
                if (revealed.apiKeyMask) keyMask = revealed.apiKeyMask;
              }
            } catch (e) { /* reveal 网络异常不阻断，沿用本地缓存 */ }

            await global.pool.query(`
              UPDATE portal_api_keys
              SET api_key_mask = $1, api_key_cipher = $2, panel_key_id = $3,
                  status = $4, synced_at = CURRENT_TIMESTAMP
              WHERE id = $5
            `, [keyMask, fullKey, match.id, match.status || 'Enable', row.id]);

            return res.json({
              key: {
                id: row.id,
                api_key: fullKey,
                api_key_mask: keyMask,
                panel_key_id: match.id,
                status: match.status || 'Enable',
                remark: row.remark || '',
                created_at: row.created_at,
                token_limit: match.tokenLimit || 0,
                token_used: match.tokenUsed || 0,
                token_remaining: match.tokenRemaining || 0,
                token_unlimited: !!match.tokenUnlimited,
              }
            });
          } else {
            // 1Panel 没返回匹配的 key：可能是 key 真被删了，也可能是
            // 鉴权通过但临时空响应（CLAUDE.md 第6条警告 sync 必须防的坑）。
            // 保守处理：不动本地记录，兜底返回本地缓存，避免误删有效 Key。
            // 只有后续明确拿到 404/record-not-found 才算真删了——但 search 不区分这点，
            // 所以这里一律兜底返回本地，由用户手动 reset/delete 处理失效 key。
            console.warn(`[GET /api/keys] 1Panel 未匹配到 key(user=${req.portalUser.id}, panel_key_id=${row.panel_key_id})，兜底返回本地缓存`);
          }
        } catch (panelErr) {
          // 1Panel 不可达时兜底返回本地记录，不断网时误伤
          console.error('[GET /api/keys] 1Panel 验证失败，兜底返回本地:', panelErr.message);
        }
      }

      // 无 panel_user_id 或 1Panel 不可达 → 直接返回本地（不含实时 token 配额）
      return res.json({
        key: {
          id: row.id,
          api_key: row.api_key_cipher,
          api_key_mask: row.api_key_mask,
          panel_key_id: row.panel_key_id,
          status: row.status,
          remark: row.remark || '',
          created_at: row.created_at,
          token_limit: 0,
          token_used: 0,
          token_remaining: 0,
          token_unlimited: false,
        }
      });
    }

    // 本地没有但 1Panel 可能有，尝试同步
    if (req.portalUser.panel_user_id) {
      try {
        const response = await panel.post('/api/v2/core/enterprise/ai-proxy/api-keys/search', {
          page: 1, pageSize: 100, info: '',
        });
        const allKeys = getPanelItems(response.data);
        const userKey = allKeys.find(k => k.userId === req.portalUser.panel_user_id);
        if (userKey) {
          let fullKey = '';
          let keyMask = userKey.apiKeyMask || '';
          try {
            const revealRes = await panel.post('/api/v2/core/enterprise/ai-proxy/api-keys/reveal', { id: userKey.id });
            const revealed = getPanelPayload(revealRes.data) || {};
            fullKey = revealed.apiKey || '';
            keyMask = revealed.apiKeyMask || keyMask;
          } catch (e) { console.error('1Panel reveal 失败:', e.message); }

          const insert = await global.pool.query(`
            INSERT INTO portal_api_keys (user_id, panel_key_id, panel_user_id, api_key_mask, api_key_cipher, group_id, status, remark, token_limit, raw_data, synced_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
            RETURNING id, api_key_mask, api_key_cipher, panel_key_id, status, remark, created_at
          `, [req.portalUser.id, userKey.id, req.portalUser.panel_user_id, keyMask, fullKey, userKey.groupId || 1, userKey.status || 'Enable', userKey.remark || '', userKey.tokenLimit || 0, userKey]);

          const saved = insert.rows[0];
          return res.json({
            key: {
              id: saved.id,
              api_key: saved.api_key_cipher,
              api_key_mask: saved.api_key_mask,
              panel_key_id: saved.panel_key_id,
              status: saved.status,
              remark: saved.remark || '',
              created_at: saved.created_at,
              token_limit: userKey.tokenLimit || 0,
              token_used: userKey.tokenUsed || 0,
              token_remaining: userKey.tokenRemaining || 0,
              token_unlimited: !!userKey.tokenUnlimited,
            }
          });
        }
      } catch (panelErr) {
        console.error('1Panel API Key 同步失败:', panelErr.message);
      }
    }

    res.json({ key: null });
  } catch (err) {
    console.error('获取 API Key 失败:', err);
    res.status(500).json({ error: '获取 API Key 失败' });
  }
});

function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(40);
  let key = 'sk-';
  for (let i = 0; i < 40; i++) {
    key += chars[bytes[i] % chars.length];
  }
  return key;
}

router.post('/api/keys', verifyUser, async (req, res) => {
  try {
    let panelUserId = req.portalUser.panel_user_id;

    // OAuth 自动创建的用户可能因网络原因未同步到 1Panel，这里再试一次
    if (!panelUserId) {
      try {
        const panelUser = await findPanelUser(req.portalUser.username);
        if (panelUser) {
          panelUserId = panelUser.id;
        } else {
          // 1Panel 也不存在，尝试创建
          const created = await createPanelUser({
            username: req.portalUser.username,
            password: crypto.randomBytes(16).toString('base64').slice(0, 32),
            name: req.portalUser.name || req.portalUser.username,
          });
          const found = await findPanelUser(req.portalUser.username);
          if (found) panelUserId = found.id;
        }
        if (panelUserId) {
          await global.pool.query(
            'UPDATE portal_users SET panel_user_id = $1 WHERE id = $2',
            [panelUserId, req.portalUser.id]
          );
        }
      } catch (e) {
        console.error('[create-key] OAuth 用户同步 1Panel 重试失败:', e.message);
      }
    }

    if (!panelUserId) {
      return res.status(400).json({ error: '需要先关联 1Panel 用户' });
    }

    // 一人一 Key 限制
    const existing = await global.pool.query(`
      SELECT id FROM portal_api_keys WHERE user_id = $1 LIMIT 1
    `, [req.portalUser.id]);
    if (existing.rowCount > 0) {
      return res.status(400).json({ error: '已有 API Key，如需更换请使用重置功能' });
    }

    const remark = String(req.body.remark || '').slice(0, 200);
    const apiKey = generateApiKey();

    let response;
    try {
      response = await panel.post('/api/v2/core/enterprise/ai-proxy/api-keys/create', {
        userId: panelUserId,
        groupId: 1,
        apiKey: apiKey,
        apiKeyMask: maskApiKey(apiKey),
        status: 'Enable',
        remark: remark,
        tokenLimit: 0,
      });
    } catch (e) {
      console.error('[create-key] 1Panel 网络异常:', e.message);
      return res.status(502).json({ error: '1Panel 不可达，创建失败', reason: e.message, code: 'PANEL_UNREACHABLE' });
    }

    if (response.status < 200 || response.status >= 300) {
      console.error(`[create-key] 1Panel HTTP ${response.status} body=${JSON.stringify(response.data).slice(0, 300)}`);
      return res.status(502).json({
        error: `1Panel 拒绝创建 API Key (HTTP ${response.status})`,
        reason: typeof response.data === 'object' ? (response.data?.msg || response.data?.message || JSON.stringify(response.data).slice(0, 200)) : String(response.data).slice(0, 200),
        code: 'PANEL_REJECTED',
      });
    }

    // 业务码校验:1Panel 习惯 HTTP 200 + body.code>=400 表达失败。
    // reset 路径漏过这层导致"假成功",这里也补上,避免普通用户首次申请时也踩同坑。
    const createBiz = inspectPanelBiz(response);
    if (!createBiz.ok) {
      console.error(`[create-key] 1Panel 业务失败 code=${createBiz.code} "${createBiz.message}"`);
      return res.status(502).json({
        error: '1Panel 拒绝创建 API Key',
        reason: createBiz.message || `code=${createBiz.code}`,
        code: 'PANEL_REJECTED',
      });
    }

    const panelResData = getPanelPayload(response.data);
    let panelKeyId = panelResData?.id || null;
    let fullKey = panelResData?.apiKey || apiKey;
    let keyMask = panelResData?.apiKeyMask || maskApiKey(fullKey);

    // 1Panel create 可能返回 data:null，需要再翻全页 search 拿 panel_key_id
    if (!panelKeyId) {
      try {
        const userKeys = await listPanelKeysOfUser(panelUserId);
        // 一人一 key:此时该用户名下应当只有刚创建的这一个
        if (userKeys.length === 1) {
          panelKeyId = userKeys[0].id;
          if (userKeys[0].apiKeyMask) keyMask = userKeys[0].apiKeyMask;
        } else {
          // 极端情况:走到这里说明远端有多 key 或 0 key,优先按 mask 匹配
          const myMask = maskApiKey(apiKey);
          const found = userKeys.find(k => k.apiKeyMask === myMask)
                     || userKeys.find(k => k.apiKeyMask && k.apiKeyMask.endsWith(myMask.slice(-4)));
          if (found) {
            panelKeyId = found.id;
            if (found.apiKeyMask) keyMask = found.apiKeyMask;
          }
        }
      } catch (e) {
        console.error('1Panel key 查找失败:', e.message);
      }
    }

    const result = await global.pool.query(`
      INSERT INTO portal_api_keys (
        user_id, panel_key_id, panel_user_id, api_key_mask, api_key_cipher,
        group_id, status, remark, token_limit, raw_data, synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      RETURNING id, api_key_mask, api_key_cipher, panel_key_id, status, remark, created_at
    `, [
      req.portalUser.id,
      panelKeyId,
      panelUserId,
      keyMask,
      fullKey,
      1,
      'Enable',
      remark,
      0,
      panelResData || {},
    ]);
    console.log(`[POST /api/keys] 创建成功: 落库 user_id=${req.portalUser.id}(username=${req.portalUser.username}) panel_user_id=${panelUserId} panel_key_id=${panelKeyId}`);

    const saved = result.rows[0];
    res.json({
      key: {
        id: saved.id,
        api_key: saved.api_key_cipher,
        api_key_mask: saved.api_key_mask,
        panel_key_id: saved.panel_key_id,
        status: saved.status,
        remark: saved.remark || '',
        created_at: saved.created_at,
      }
    });
  } catch (err) {
    console.error('创建 API Key 失败:', err);
    res.status(500).json({ error: '创建 API Key 失败: ' + err.message });
  }
});

router.get('/api/keys/:id', verifyUser, async (req, res) => {
  try {
    const requestedId = parseInt(req.params.id, 10);
    if (!Number.isFinite(requestedId)) {
      return res.status(400).json({ error: '无效的 Key ID' });
    }

    // 前端传的可能是 panel_key_id（1Panel 那边的 id），也可能是本地 portal_api_keys.id
    // 统一以「当前用户名下的 key 记录」为准，避免横向越权
    const local = await global.pool.query(`
      SELECT id, api_key_mask, api_key_cipher, panel_key_id, status, remark, created_at
      FROM portal_api_keys
      WHERE user_id = $1 AND (id = $2 OR panel_key_id = $2)
      LIMIT 1
    `, [req.portalUser.id, requestedId]);

    if (local.rowCount === 0) {
      return res.status(404).json({ error: 'API Key 不存在' });
    }

    const row = local.rows[0];

    // —— 策略:reveal-first ——
    // 复制场景对「拿到明文」是硬要求，必须优先去 1Panel reveal；
    // 本地 cipher 仅作为离线兜底，且 reveal 成功时顺手回填到 DB（修复历史空 cipher）
    let revealedKey = '';
    let revealedMask = '';
    let revealError = null;

    if (row.panel_key_id) {
      try {
        const response = await panel.post('/api/v2/core/enterprise/ai-proxy/api-keys/reveal', { id: row.panel_key_id });
        if (response.status >= 200 && response.status < 300) {
          const revealed = getPanelPayload(response.data) || {};
          revealedKey = revealed.apiKey || '';
          revealedMask = revealed.apiKeyMask || '';
        } else {
          revealError = `1Panel reveal 返回 ${response.status}`;
        }
      } catch (e) {
        revealError = `1Panel reveal 异常: ${e.message}`;
      }
    } else {
      revealError = '本地记录缺少 panel_key_id（可能从未同步成功，请重置 Key）';
    }

    // 1) reveal 拿到明文 → 主路径
    if (revealedKey) {
      // 顺手回填 DB（仅当 DB 里 cipher 为空或与新值不一致时）
      if (!row.api_key_cipher || row.api_key_cipher !== revealedKey) {
        try {
          await global.pool.query(`
            UPDATE portal_api_keys
            SET api_key_cipher = $1,
                api_key_mask = COALESCE(NULLIF($2, ''), api_key_mask),
                synced_at = CURRENT_TIMESTAMP
            WHERE id = $3
          `, [revealedKey, revealedMask, row.id]);
        } catch (dbErr) {
          console.error('回填 api_key_cipher 失败（不影响返回）:', dbErr.message);
        }
      }
      return res.json({
        id: row.id,
        panel_key_id: row.panel_key_id,
        api_key: revealedKey,
        api_key_mask: revealedMask || row.api_key_mask || maskApiKey(revealedKey),
        source: 'panel',
      });
    }

    // 2) reveal 失败 + 本地 cipher 是真实明文 → 兜底
    const localCipher = row.api_key_cipher || '';
    const looksLikePlaintext = localCipher && !localCipher.includes('*') && localCipher.length >= 20;
    if (looksLikePlaintext) {
      console.warn(`[keys/:id] reveal 失败但本地 cipher 可用，user=${req.portalUser.id} reason=${revealError}`);
      return res.json({
        id: row.id,
        panel_key_id: row.panel_key_id,
        api_key: localCipher,
        api_key_mask: row.api_key_mask,
        source: 'local',
      });
    }

    // 3) reveal 失败 + 本地也没有 → 明确告诉前端，引导用户重置
    console.error(`[keys/:id] 无法获取明文 key，user=${req.portalUser.id} reason=${revealError} cipher_len=${localCipher.length}`);
    return res.status(409).json({
      error: '无法获取完整 API Key，请点击「重置 Key」重新生成',
      reason: revealError || '本地缓存为空且 1Panel 不可达',
      code: 'REVEAL_FAILED',
    });
  } catch (err) {
    console.error('获取 API Key 详情失败:', err);
    res.status(500).json({ error: '获取 API Key 详情失败' });
  }
});

function maskApiKey(key) {
  if (!key || key.length <= 8) return key || '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

/**
 * 1Panel 习惯 HTTP 200 + body.code 表达业务状态。
 * 这里把"业务失败"识别集中到一处:HTTP 已 2xx,但 body.code 落在 HTTP 错误段(>=400)。
 * 返回 { ok: boolean, code: number|null, message: string }。
 */
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

/**
 * 翻页拿当前用户在 1Panel 端的全部 api-key 记录(按 panel userId 过滤)。
 * 翻全量(防御 100 条单页上限),并按 createdAt/createTime 倒序方便取最新。
 */
async function listPanelKeysOfUser(panelUserId) {
  const PAGE_SIZE = 100;
  const out = [];
  let page = 1;
  while (page < 50) { // 安全上限,防止远端 total 异常时死循环
    const res = await panel.post('/api/v2/core/enterprise/ai-proxy/api-keys/search', {
      page, pageSize: PAGE_SIZE, info: '',
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`1Panel api-keys/search HTTP ${res.status}`);
    }
    const items = getPanelItems(res.data);
    out.push(...items.filter(k => k.userId === panelUserId));
    if (items.length < PAGE_SIZE) break;
    page++;
  }
  return out;
}

/**
 * 把 panel 端属于该用户的 key 全部删掉(reset 的关键前置)。
 * 删完会再 search 一次校验,确保 0 残留——否则 1Panel 的 create 会以
 * "user already has an ai proxy api key" 拒绝,造成 PANSL_SYNC_UNVERIFIED 误报。
 *
 * 返回:删除条数。失败抛异常,由调用方决定是否中止。
 */
async function purgePanelKeysOfUser(panelUserId) {
  const existing = await listPanelKeysOfUser(panelUserId);
  for (const k of existing) {
    if (!k.id) continue;
    const delRes = await panel.post('/api/v2/core/enterprise/ai-proxy/api-keys/delete', { id: k.id });
    const biz = inspectPanelBiz(delRes);
    if (delRes.status < 200 || delRes.status >= 300 || !biz.ok) {
      throw new Error(`1Panel 删除旧 key 失败(id=${k.id}): HTTP=${delRes.status} code=${biz.code} ${biz.message}`);
    }
  }
  // 校验:删完应当 0 残留,否则后面 create 必然 "user already has ..." 失败
  const after = await listPanelKeysOfUser(panelUserId);
  if (after.length > 0) {
    throw new Error(`1Panel 仍残留 ${after.length} 个旧 key(id=${after.map(k => k.id).join(',')}),无法继续创建`);
  }
  return existing.length;
}

router.post('/api/keys/reset', verifyUser, async (req, res) => {
  try {
    if (!req.portalUser.panel_user_id) {
      return res.status(400).json({ error: '需要先关联 1Panel 用户' });
    }

    // 查本地已有 key 记录
    const existing = await global.pool.query(`
      SELECT id, panel_key_id, remark
      FROM portal_api_keys WHERE user_id = $1 LIMIT 1
    `, [req.portalUser.id]);

    if (existing.rowCount === 0) {
      return res.status(400).json({ error: '当前没有 API Key，请先申请' });
    }

    const row = existing.rows[0];

    // 1. 清干净 1Panel 端属于该用户的所有 key —— 不再依赖本地 panel_key_id
    //    根因:1Panel 限"一人一 key"。旧实现只删 row.panel_key_id 且 catch 不阻断,
    //    一旦本地缓存的 panel_key_id 与远端不一致(漂移/手工删/上次 reset 半失败),
    //    create 会以 code=400 "user already has an ai proxy api key" 被拒,
    //    最终走到 PANSL_SYNC_UNVERIFIED 误报"似乎未真正创建"。
    try {
      const purged = await purgePanelKeysOfUser(req.portalUser.panel_user_id);
      if (purged > 0) console.log(`[reset] 清理 1Panel 端旧 key ${purged} 个(user=${req.portalUser.id}, panelUser=${req.portalUser.panel_user_id})`);
    } catch (e) {
      console.error('[reset] 清理 1Panel 旧 key 失败:', e.message);
      return res.status(502).json({
        error: '1Panel 端旧 API Key 清理失败,无法继续重置',
        reason: e.message,
        code: 'PANEL_PURGE_FAILED',
      });
    }

    // 2. 生成新 key 并注册到 1Panel —— 失败必须中止,不能用本地随机串假装成功
    const newRawKey = generateApiKey();
    const newMask = maskApiKey(newRawKey);

    let createRes;
    try {
      createRes = await panel.post('/api/v2/core/enterprise/ai-proxy/api-keys/create', {
        userId: req.portalUser.panel_user_id,
        groupId: 1,
        apiKey: newRawKey,
        apiKeyMask: newMask,
        status: 'Enable',
        remark: row.remark || '',
        tokenLimit: 0,
      });
    } catch (e) {
      console.error('[reset] 1Panel create 网络异常:', e.message);
      return res.status(502).json({ error: '1Panel 不可达，重置失败', reason: e.message, code: 'PANEL_UNREACHABLE' });
    }

    if (createRes.status < 200 || createRes.status >= 300) {
      console.error(`[reset] 1Panel create 返回 HTTP ${createRes.status}, body=${JSON.stringify(createRes.data).slice(0, 300)}`);
      return res.status(502).json({
        error: `1Panel 拒绝创建 API Key (HTTP ${createRes.status})`,
        reason: typeof createRes.data === 'object' ? (createRes.data?.msg || createRes.data?.message || JSON.stringify(createRes.data).slice(0, 200)) : String(createRes.data).slice(0, 200),
        code: 'PANEL_REJECTED',
      });
    }

    // 业务码校验:1Panel 习惯 HTTP 200 + body.code>=400 表达失败。这层漏判正是上一版假成功的根因。
    const createBiz = inspectPanelBiz(createRes);
    if (!createBiz.ok) {
      console.error(`[reset] 1Panel create 业务失败 code=${createBiz.code} "${createBiz.message}"`);
      return res.status(502).json({
        error: '1Panel 拒绝创建 API Key',
        reason: createBiz.message || `code=${createBiz.code}`,
        code: 'PANEL_REJECTED',
      });
    }

    const createData = getPanelPayload(createRes.data);
    let panelKeyId = createData?.id || null;
    let fullKey = createData?.apiKey || newRawKey;
    let keyMask = createData?.apiKeyMask || newMask;

    // create 返回 data:null 时翻全页 search 验证 + 拿 id
    // 此前清理过同一用户的所有旧 key,这里能匹配到的就是刚创建的新 key
    if (!panelKeyId) {
      try {
        const userKeys = await listPanelKeysOfUser(req.portalUser.panel_user_id);
        // 优先按 mask 完整匹配 → 再按末 4 位 → 再退化到"该用户唯一 key"
        let found = userKeys.find(k => k.apiKeyMask === newMask);
        if (!found) {
          found = userKeys.find(k => k.apiKeyMask && k.apiKeyMask.endsWith(newMask.slice(-4)));
        }
        if (!found && userKeys.length === 1) {
          found = userKeys[0];
        }
        if (found) {
          panelKeyId = found.id;
          if (found.apiKeyMask) keyMask = found.apiKeyMask;
        }
      } catch (e) {
        console.error('[reset] 1Panel search 验证失败:', e.message);
      }
    }

    // 3. 关键校验：拿到 panelKeyId 才算真同步
    if (!panelKeyId) {
      console.error(`[reset] 1Panel 未返回 key id 且 search 也找不到,user=${req.portalUser.id}, mask=${newMask}`);
      return res.status(502).json({
        error: '1Panel 似乎未真正创建 API Key,请联系管理员检查 1Panel 网关配置',
        reason: 'create 未返回 id 且 search 兜底也未找到匹配记录',
        code: 'PANSL_SYNC_UNVERIFIED',
      });
    }

    // 4. 同步成功才更新本地 DB
    const result = await global.pool.query(`
      UPDATE portal_api_keys SET
        panel_key_id = $1, api_key_mask = $2, api_key_cipher = $3,
        status = 'Enable', synced_at = CURRENT_TIMESTAMP
      WHERE user_id = $4
      RETURNING id, api_key_mask, api_key_cipher, panel_key_id, status, remark, created_at
    `, [panelKeyId, keyMask, fullKey, req.portalUser.id]);

    const saved = result.rows[0];
    res.json({
      key: {
        id: saved.id,
        api_key: saved.api_key_cipher,
        api_key_mask: saved.api_key_mask,
        panel_key_id: saved.panel_key_id,
        status: saved.status,
        remark: saved.remark || '',
        created_at: saved.created_at,
      }
    });
  } catch (err) {
    console.error('重置 API Key 失败:', err);
    res.status(500).json({ error: '重置 API Key 失败: ' + err.message });
  }
});

// 删除当前用户的 API Key —— fail-closed:
// 1Panel 远端删除失败(网络/业务码 >=400)时本地一律不动,避免"本地以为删了、远端还在"。
// 用 purgePanelKeysOfUser 而不是仅删 row.panel_key_id —— 与 reset 同因:本地缓存的
// panel_key_id 可能与远端漂移(历史半失败 reset 留下),应以"按 panel_user_id 翻页 search"为准。
router.delete('/api/keys', verifyUser, async (req, res) => {
  try {
    if (!req.portalUser.panel_user_id) {
      return res.status(400).json({ error: '需要先关联 1Panel 用户' });
    }

    const existing = await global.pool.query(
      `SELECT id FROM portal_api_keys WHERE user_id = $1 LIMIT 1`,
      [req.portalUser.id]
    );
    if (existing.rowCount === 0) {
      return res.status(400).json({ error: '当前没有 API Key' });
    }

    // 1. 清干净 1Panel 端属于该用户的所有 key
    try {
      const purged = await purgePanelKeysOfUser(req.portalUser.panel_user_id);
      console.log(`[delete] 清理 1Panel 端 key ${purged} 个(user=${req.portalUser.id}, panelUser=${req.portalUser.panel_user_id})`);
    } catch (e) {
      console.error('[delete] 清理 1Panel key 失败:', e.message);
      // 区分网络不可达 / 业务码失败
      const isUnreachable = /ECONN|ETIMEDOUT|ENOTFOUND|timeout/i.test(e.message);
      return res.status(502).json({
        error: isUnreachable ? '1Panel 不可达，删除失败' : '1Panel 拒绝删除 API Key',
        reason: e.message,
        code: isUnreachable ? 'PANEL_UNREACHABLE' : 'PANEL_REJECTED',
      });
    }

    // 2. 远端已确认无残留,才删本地
    await global.pool.query(
      `DELETE FROM portal_api_keys WHERE user_id = $1`,
      [req.portalUser.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('删除 API Key 失败:', err);
    res.status(500).json({ error: '删除 API Key 失败: ' + err.message });
  }
});

// ============ Skill API ============

// 健康检查 (keeping for backward compat)


// ============ 公开:站点品牌 ============
// 任何访客打开首页都要读, 不能加 verifyUser
router.get('/api/site/branding', async (req, res) => {
  try {
    const result = await global.pool.query(
      `SELECT key, value FROM system_config WHERE key IN ('site_name', 'site_logo', 'site_favicon')`
    );
    const map = {};
    for (const row of result.rows) map[row.key] = row.value;
    // 不缓存:admin 改完立即生效是更重要的诉求,几行 system_config 查询完全可以承受
    res.set('Cache-Control', 'no-store');
    res.json({
      site_name:    map.site_name    || 'AI 门户',
      site_logo:    map.site_logo    || '',
      site_favicon: map.site_favicon || '',
    });
  } catch (err) {
    console.error('获取站点品牌失败:', err);
    // 失败也给个 fallback, 别让首页空白
    res.json({ site_name: 'AI 门户', site_logo: '', site_favicon: '' });
  }
});

// ============ 公开:公告横幅 ============
router.get('/api/site/announcement', async (req, res) => {
  try {
    const result = await global.pool.query(
      `SELECT key, value FROM system_config
       WHERE key IN ('banner_enabled', 'banner_html', 'dialog_enabled', 'dialog_title', 'dialog_html', 'dialog_version')`
    );
    const map = {};
    for (const row of result.rows) map[row.key] = row.value;
    res.set('Cache-Control', 'no-store');
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
    res.json({
      banner_enabled: false, banner_html: '',
      dialog_enabled: false, dialog_title: '', dialog_html: '',
      dialog_version: 1,
    });
  }
});

// ============================================================
// GET /api/auth/identities — 列出当前用户已绑定的所有三方身份
// ============================================================
router.get('/api/auth/identities', verifyUser, async (req, res) => {
  try {
    const r = await global.pool.query(`
      SELECT ui.provider, op.display_name, ui.external_id, ui.profile, ui.created_at
      FROM user_identities ui
      LEFT JOIN oauth_providers op ON op.provider = ui.provider
      WHERE ui.user_id = $1
      ORDER BY ui.created_at DESC
    `, [req.portalUser.id]);
    res.json({
      identities: r.rows.map(row => ({
        provider: row.provider,
        display_name: row.display_name || row.provider,
        external_id: row.external_id,
        profile: row.profile || {},
        created_at: row.created_at,
      }))
    });
  } catch (err) {
    console.error('[auth/identities] failed:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// ============================================================
// DELETE /api/auth/identities/:provider — 解绑
// 保护:自动创建的用户不能解绑最后一个身份(即使设了密码,解绑后重扫会重复建号)
// 另外:无密码用户只剩最后一个身份 → 拒绝
// ============================================================
router.delete('/api/auth/identities/:provider', verifyUser, async (req, res) => {
  try {
    const provider = req.params.provider;
    const me = await global.pool.query(
      'SELECT password_hash, auto_created_from FROM portal_users WHERE id=$1',
      [req.portalUser.id]
    );
    const hasPassword = !!(me.rows[0]?.password_hash);
    const autoCreatedFrom = me.rows[0]?.auto_created_from;
    const idCount = await global.pool.query(
      'SELECT COUNT(*)::int AS n FROM user_identities WHERE user_id=$1',
      [req.portalUser.id]
    );
    const n = idCount.rows[0].n;
    // 自动创建的用户不能解绑最后一个身份(防止解绑后重扫重复建号)
    if (autoCreatedFrom && n <= 1) {
      return res.status(409).json({
        code: 'OAUTH_UNBIND_LAST_IDENTITY',
        error: `此账号由${autoCreatedFrom}自动创建,无法解除最后一个绑定。请至少再绑定一个其他登录方式后重试`
      });
    }
    // 无密码用户只剩最后一个身份 → 拒绝
    if (!hasPassword && n <= 1) {
      return res.status(409).json({
        code: 'OAUTH_UNBIND_LAST_IDENTITY',
        error: '解绑此身份后您将无法登录,请先设置一个登录密码'
      });
    }
    await global.pool.query(
      'DELETE FROM user_identities WHERE user_id=$1 AND provider=$2',
      [req.portalUser.id, provider]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/identities/delete] failed:', err);
    res.status(500).json({ error: '解绑失败' });
  }
});

// ============================================================
// POST /api/auth/password/set — 为"未设密码"的用户首次设密码
// 与现有 PUT /api/auth/password(改密,需老密码)是两个独立接口
// ============================================================
router.post('/api/auth/password/set', verifyUser, async (req, res) => {
  try {
    const password = req.body.password;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }
    const me = await global.pool.query(
      'SELECT password_hash, auto_created_from FROM portal_users WHERE id=$1', [req.portalUser.id]
    );
    const row = me.rows[0] || {};
    if (row.password_hash && row.password_hash.length > 0 && !row.auto_created_from) {
      // 已经真正设置过密码的用户应走改密接口
      return res.status(409).json({
        code: 'USER_HAS_PASSWORD',
        error: '您已设置过密码,请使用"修改密码"接口'
      });
    }
    const hash = await bcrypt.hash(password, 12);
    await global.pool.query(
      `UPDATE portal_users
       SET password_hash=$1, auto_created_from=NULL
       WHERE id=$2`,
      [hash, req.portalUser.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/password/set] failed:', err);
    res.status(500).json({ error: '设置密码失败' });
  }
});

// GET /api/skillctl-token — 读库返回当前 skillctl 登录 token,不调 1Panel
// 库里为空(未生成过)就返回空字符串,前端据此显示「生成」按钮。
router.get('/api/skillctl-token', verifyUser, async (req, res) => {
  try {
    const result = await global.pool.query(
      'SELECT skillctl_token FROM portal_users WHERE id = $1',
      [req.portalUser.id]
    );
    const token = result.rowCount > 0 ? (result.rows[0].skillctl_token || '') : '';
    res.json({ token });
  } catch (err) {
    console.error('获取 skillctl token 失败:', err);
    res.status(500).json({ error: '获取 skillctl token 失败' });
  }
});

// POST /api/skillctl-token — 生成或刷新 skillctl 登录 token
// 调 1Panel users/api/update,每调一次轮换 token(旧的失效),返回新 token 并落库。
// update 入参固定全开:接口 Enable / IP 0.0.0.0/0 / 有效期 0(永不过期)。
router.post('/api/skillctl-token', verifyUser, async (req, res) => {
  try {
    if (!req.portalUser.panel_user_id) {
      return res.status(400).json({ error: '需要先关联 1Panel 用户' });
    }

    let updateRes;
    try {
      updateRes = await panel.post('/api/v2/core/enterprise/users/api/update', {
        id: req.portalUser.panel_user_id,
        apiInterfaceStatus: 'Enable',
        ipWhiteList: '0.0.0.0/0',
        apiKeyValidityTime: 0,
      });
    } catch (e) {
      console.error('[skillctl-token] 1Panel 网络异常:', e.message);
      return res.status(502).json({
        error: '1Panel 不可达,生成 Token 失败',
        reason: e.message,
        code: 'PANEL_UNREACHABLE',
      });
    }

    if (updateRes.status < 200 || updateRes.status >= 300) {
      console.error(`[skillctl-token] 1Panel HTTP ${updateRes.status}, body=${JSON.stringify(updateRes.data).slice(0, 300)}`);
      return res.status(502).json({
        error: `1Panel 拒绝生成 Token (HTTP ${updateRes.status})`,
        reason: typeof updateRes.data === 'object' ? (updateRes.data?.message || updateRes.data?.msg || JSON.stringify(updateRes.data).slice(0, 200)) : String(updateRes.data).slice(0, 200),
        code: 'PANEL_REJECTED',
      });
    }

    const biz = inspectPanelBiz(updateRes);
    if (!biz.ok) {
      console.error(`[skillctl-token] 1Panel 业务失败 code=${biz.code} "${biz.message}"`);
      return res.status(502).json({
        error: '1Panel 拒绝生成 Token',
        reason: biz.message || `code=${biz.code}`,
        code: 'PANEL_REJECTED',
      });
    }

    const payload = getPanelPayload(updateRes.data);
    // users/api/update 文档约定 data 是裸字符串(新 API Key);但防御性兼容对象包壳(如 {apiKey})
    const token = typeof payload === 'string'
      ? payload
      : (payload && (payload.apiKey || payload.key || payload.token)) || '';
    if (!token || typeof token !== 'string') {
      console.error(`[skillctl-token] update 未返回 token, user=${req.portalUser.id}, data=${JSON.stringify(updateRes.data).slice(0, 200)}`);
      return res.status(502).json({
        error: '1Panel 未返回 Token',
        reason: 'update 响应 data 为空',
        code: 'PANEL_SKILLCTL_TOKEN_FAILED',
      });
    }

    await global.pool.query(
      'UPDATE portal_users SET skillctl_token = $1 WHERE id = $2',
      [token, req.portalUser.id]
    );

    console.log(`[skillctl-token] 生成成功 user=${req.portalUser.id}(username=${req.portalUser.username}) panel_user_id=${req.portalUser.panel_user_id}`);
    res.json({ token });
  } catch (err) {
    console.error('生成 skillctl token 失败:', err);
    res.status(500).json({ error: '生成 skillctl token 失败: ' + err.message });
  }
});

// GET /api/usage/statistics — 当前用户的 Token 用量统计（代理 1Panel usage API）
// 内存缓存 30s，按用户维度，避免并发/频繁刷新重复打 1Panel
const usageCache = new Map(); // key: userId → { data, expireAt }
const USAGE_CACHE_TTL = 30 * 1000;

router.get('/api/usage/statistics', verifyUser, async (req, res) => {
  try {
    if (!req.portalUser.panel_user_id) {
      return res.json({ data: null, hint: '尚未关联 1Panel 用户' });
    }

    // 命中缓存直接返回
    const cached = usageCache.get(req.portalUser.id);
    if (cached && cached.expireAt > Date.now()) {
      return res.json({ data: cached.data });
    }

    let usageRes;
    try {
      usageRes = await panel.post('/api/v2/core/enterprise/ai-proxy/usage/statistics', {
        info: '',
        userId: req.portalUser.panel_user_id,
        provider: '',
        model: '',
      });
    } catch (e) {
      console.error('[usage/statistics] 1Panel 网络异常:', e.message);
      return res.status(502).json({ error: '1Panel 不可达', code: 'PANEL_UNREACHABLE' });
    }

    if (usageRes.status < 200 || usageRes.status >= 300) {
      return res.status(502).json({ error: `1Panel 返回 HTTP ${usageRes.status}`, code: 'PANEL_REJECTED' });
    }

    const biz = inspectPanelBiz(usageRes);
    if (!biz.ok) {
      return res.status(502).json({ error: '1Panel 业务错误', reason: biz.message, code: 'PANEL_REJECTED' });
    }

    const payload = getPanelPayload(usageRes.data);
    const dataRaw = payload && typeof payload === 'object' ? payload : {};
    // 只返回前端需要的字段，过滤掉 name 为空的脏条目
    const clean = (arr) =>
      Array.isArray(arr) ? arr.filter(v => v && v.name) : [];

    const data = {
      summary: dataRaw.summary || null,
      trends: clean(dataRaw.trends),
      models: clean(dataRaw.models),
      providers: clean(dataRaw.providers),
    };

    // 写入缓存
    usageCache.set(req.portalUser.id, { data, expireAt: Date.now() + USAGE_CACHE_TTL });

    res.json({ data });
  } catch (err) {
    console.error('获取用量统计失败:', err);
    res.status(500).json({ error: '获取用量统计失败' });
  }
});

// GET /api/version — 返回当前版本号
const pkg = require('../package.json');
router.get('/api/version', (req, res) => {
  res.json({ version: pkg.version });
});

module.exports = router;
