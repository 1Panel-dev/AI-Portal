const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const router = express.Router();
const oauthRegistry = require('../oauth');
const { createStateStore } = require('../lib/state-store');

// 与 app.js 同款的 BASE_PATH 归一化:确保以 / 开头并以 / 结尾。
// app.js 内置这个逻辑但 BASE_PATH 是局部变量不导出,这里复用 process.env 自己做一次
// (单进程内只算一次,缓存)
const NORMALIZED_BASE_PATH = (function normalize() {
  let p = process.env.BASE_PATH || '/';
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p = p + '/';
  return p;
})();
const {
  signOauthTicket,
  signOauthBindingTicket,
  signPortalToken,
  signAdminToken,
  consumeTicket,
  loginLimiter,
} = require('../auth');
const { buildCandidateUsername, generateUniqueUsername } = require('../oauth/username-generator');
const { findPanelUser, createPanelUser } = require('../panel');
const stateStore = createStateStore(10 * 60 * 1000);   // 10 min TTL

function formatUserForResponse(row) {
  return {
    id: row.id,
    panel_user_id: row.panel_user_id,
    username: row.username,
    name: row.name,
    role: row.role,
    status: row.status,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    auto_created_from: row.auto_created_from || null,
    has_password: !!(row.password_hash && row.password_hash.length > 0),
  };
}

/**
 * 用 HTML + window.top.location 实现顶层跳转
 * 用途:JSSDK 内嵌二维码扫码后,回调到达 iframe 时需要把顶层窗口跳走;
 *      非 iframe 场景下 window.top === window,等价于普通顶层跳转
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function respondWithTopRedirect(res, targetUrl) {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>登录中…</title></head>
<body>
<script>
  var target = ${JSON.stringify(targetUrl).replace(/</g, '\\u003c')};
  try { window.top.location.href = target; } catch (e) { window.location.href = target; }
</script>
<noscript>请<a href="${escapeHtml(targetUrl)}">点此继续</a></noscript>
</body></html>`);
}

/**
 * 拼回调地址。基于 req.protocol + req.host + BASE_PATH。
 * 注意:app.js 已设 trust proxy,nginx https 反代时 req.protocol 能识别为 https。
 */
function buildRedirectUri(req, provider) {
  return `${req.protocol}://${req.get('host')}${NORMALIZED_BASE_PATH}api/auth/oauth/${provider}/callback`;
}

/**
 * 列出启用的 provider(供前端 LoginView / ProfileView 渲染按钮)
 */
router.get('/api/auth/oauth/providers', async (req, res) => {
  try {
    const r = await global.pool.query(
      'SELECT provider, display_name, sort_order FROM oauth_providers WHERE enabled = TRUE ORDER BY sort_order ASC'
    );
    res.json({
      providers: r.rows.map(row => ({
        provider: row.provider,
        display_name: row.display_name,
        sort_order: row.sort_order,
      }))
    });
  } catch (err) {
    console.error('[oauth/providers] failed:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

router.get('/api/auth/oauth/:provider/url', async (req, res) => {
  try {
    const provider = req.params.provider;
    const adapter = oauthRegistry.getAdapter(provider);
    if (!adapter) {
      return res.status(404).json({ code: 'OAUTH_PROVIDER_NOT_FOUND', error: 'provider 未注册' });
    }

    // 查 DB 拿配置 + enabled
    const r = await global.pool.query(
      'SELECT enabled, config FROM oauth_providers WHERE provider=$1', [provider]
    );
    if (r.rowCount === 0 || !r.rows[0].enabled) {
      return res.status(403).json({ code: 'OAUTH_PROVIDER_DISABLED', error: '该登录方式未启用' });
    }
    const config = r.rows[0].config || {};

    const intent = (req.query.intent === 'bind') ? 'bind' : 'login';
    const returnPath = String(req.query.return || '/profile').slice(0, 200);

    // intent=bind 需要鉴权当前用户,把 user_id 关联到 state
    let bindUserId = null;
    if (intent === 'bind') {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: '未登录,无法发起绑定' });
      }
      const { JWT_SECRET } = require('../auth');
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
        if (decoded.type !== 'portal_user' && decoded.type !== 'admin') {
          return res.status(401).json({ error: 'Token 无效' });
        }
        bindUserId = decoded.id;
      } catch {
        return res.status(401).json({ error: 'Token 无效或已过期' });
      }
    }

    const redirectUri = buildRedirectUri(req, provider);
    console.log(`[oauth/url] provider=${provider} intent=${intent} redirect_uri=${redirectUri} ua="${req.get('User-Agent') || ''}"`);
    const state = stateStore.put({
      provider, intent, returnPath, bindUserId,
    });

    const userAgent = req.get('User-Agent') || '';
    const url = adapter.buildAuthUrl({ config, state, redirectUri, userAgent });

    // 前端统一 window.location.href = data.url 跳转
    // 浏览器场景:login.work.weixin.qq.com/wwlogin/sso/login(98152 文档章节 2)
    // 企微客户端内:open.weixin.qq.com/connect/oauth2/authorize?scope=snsapi_base(98176 静默授权)
    // UA 分流仍然在 adapter.buildAuthUrl 内做,前端无需关心
    res.json({ url, state });
  } catch (err) {
    console.error('[oauth/url] failed:', err);
    res.status(500).json({ error: '生成登录地址失败' });
  }
});

/**
 * OAuth 回调入口
 * 注意：全部用 respondWithTopRedirect 返回，不用 302（适配 iframe 嵌入场景）
 */
router.get('/api/auth/oauth/:provider/callback', async (req, res) => {
  const provider = req.params.provider;
  const code = req.query.code;
  const state = req.query.state;

  const errorUrl = (reason) => {
    return `${NORMALIZED_BASE_PATH}oauth/error?reason=${encodeURIComponent(reason)}`;
  };

  try {
    // 1. 校验 state
    const stateData = stateStore.take(String(state || ''));
    if (!stateData || stateData.provider !== provider) {
      return respondWithTopRedirect(res, errorUrl('state_invalid'));
    }

    const adapter = oauthRegistry.getAdapter(provider);
    if (!adapter) {
      return respondWithTopRedirect(res, errorUrl('provider_disabled'));
    }
    const cfgRow = await global.pool.query(
      'SELECT enabled, config FROM oauth_providers WHERE provider=$1', [provider]
    );
    if (cfgRow.rowCount === 0 || !cfgRow.rows[0].enabled) {
      return respondWithTopRedirect(res, errorUrl('provider_disabled'));
    }
    const config = cfgRow.rows[0].config || {};

    // 2. 用 code 换 userid
    let externalId, profile;
    try {
      ({ externalId, profile } = await adapter.exchangeCode({ config, code: String(code || '') }));
    } catch (err) {
      console.error(`[oauth/callback] exchange failed:`, err.message);
      return respondWithTopRedirect(res, errorUrl('exchange_failed'));
    }

    // const base = NORMALIZED_BASE_PATH 已由模块顶部提供(见第 14 行)
    // 所有回调重定向用 NORMALIZED_BASE_PATH + 相对路径即可:

    // 3. 分支：intent=bind（已登录用户主动绑定）
    if (stateData.intent === 'bind') {
      if (!stateData.bindUserId) {
        return respondWithTopRedirect(res, errorUrl('state_invalid'));
      }
      const existing = await global.pool.query(
        'SELECT user_id FROM user_identities WHERE provider=$1 AND external_id=$2',
        [provider, externalId]
      );
      if (existing.rowCount > 0) {
        if (existing.rows[0].user_id === stateData.bindUserId) {
          return respondWithTopRedirect(res, `${NORMALIZED_BASE_PATH}profile?bound=1`);
        }
        return respondWithTopRedirect(res, errorUrl('already_bound'));
      }
      // Note: bindUserId is always a portal_users.id (admin and portal_users are unified;
      // signAdminToken is only ever issued from a portal_users row — see portal.js login flow).
      await global.pool.query(
        `INSERT INTO user_identities (user_id, provider, external_id, profile)
         VALUES ($1, $2, $3, $4)`,
        [stateData.bindUserId, provider, externalId, profile || {}]
      );
      return respondWithTopRedirect(res, `${NORMALIZED_BASE_PATH}profile?bound=1`);
    }

    // 4. 分支：intent=login
    const identityRow = await global.pool.query(
      `SELECT ui.user_id, pu.role, pu.status
       FROM user_identities ui JOIN portal_users pu ON pu.id = ui.user_id
       WHERE ui.provider=$1 AND ui.external_id=$2`,
      [provider, externalId]
    );

    if (identityRow.rowCount > 0) {
      // 已绑定 → 签 ticket → 跳 /oauth/complete
      const u = identityRow.rows[0];
      if (u.status !== 'active') {
        return respondWithTopRedirect(res, errorUrl('account_disabled'));
      }
      const ticket = signOauthTicket({ userId: u.user_id, role: u.role });
      const url = `${NORMALIZED_BASE_PATH}oauth/complete?ticket=${encodeURIComponent(ticket)}` +
        `&return=${encodeURIComponent(stateData.returnPath || '/profile')}`;
      return respondWithTopRedirect(res, url);
    }

    // 未绑定：首发不支持 require_pre_binding=true 路径，直接走"引导绑定"
    if (config.require_pre_binding === true) {
      return respondWithTopRedirect(res, errorUrl('feature_not_ready'));
    }
    const bindTicket = signOauthBindingTicket({ provider, externalId, profile: profile || {} });
    const url = `${NORMALIZED_BASE_PATH}oauth/bind?ticket=${encodeURIComponent(bindTicket)}` +
      `&return=${encodeURIComponent(stateData.returnPath || '/profile')}`;
    return respondWithTopRedirect(res, url);

  } catch (err) {
    console.error('[oauth/callback] unexpected error:', err);
    return respondWithTopRedirect(res, errorUrl('exchange_failed'));
  }
});

// ============================================================
// POST /api/auth/oauth/complete — 已绑定用户拿 ticket 换正式 token
// ============================================================
router.post('/api/auth/oauth/complete', express.json(), async (req, res) => {
  try {
    const ticket = req.body && req.body.ticket;
    if (!ticket) return res.status(400).json({ code: 'OAUTH_TICKET_INVALID', error: 'ticket 缺失' });
    let decoded;
    try { decoded = consumeTicket(ticket, 'oauth_ticket'); }
    catch { return res.status(401).json({ code: 'OAUTH_TICKET_INVALID', error: 'ticket 无效或已过期' }); }

    const r = await global.pool.query(
      'SELECT * FROM portal_users WHERE id=$1', [decoded.userId]
    );
    if (r.rowCount === 0 || r.rows[0].status !== 'active') {
      return res.status(401).json({ error: '用户不存在或已禁用' });
    }
    const user = r.rows[0];
    await global.pool.query(
      'UPDATE portal_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]
    );

    const token = (user.role === 'admin')
      ? signAdminToken(user)
      : signPortalToken(user);
    res.json({ token, user: formatUserForResponse(user) });
  } catch (err) {
    console.error('[oauth/complete] failed:', err);
    res.status(500).json({ error: '登录失败' });
  }
});

// ============================================================
// POST /api/auth/oauth/bind/login — 首次扫码 → 绑定到已有账号
// 套 loginLimiter,防穷举密码
// ============================================================
router.post('/api/auth/oauth/bind/login', loginLimiter, express.json(), async (req, res) => {
  try {
    const { ticket, username, password } = req.body || {};
    if (!ticket || !username || !password) {
      return res.status(400).json({ error: '参数不完整' });
    }
    let decoded;
    try { decoded = consumeTicket(ticket, 'oauth_binding'); }
    catch { return res.status(401).json({ code: 'OAUTH_TICKET_INVALID', error: 'ticket 无效' }); }

    const r = await global.pool.query(
      `SELECT * FROM portal_users WHERE username=$1 AND status='active'`, [String(username).trim()]
    );
    if (r.rowCount === 0) return res.status(401).json({ error: '用户名或密码错误' });
    const user = r.rows[0];
    const valid = await bcrypt.compare(String(password), user.password_hash || '');
    if (!valid) return res.status(401).json({ error: '用户名或密码错误' });

    // 重复绑定保护:该 external_id 已绑过其他人
    const exists = await global.pool.query(
      'SELECT user_id FROM user_identities WHERE provider=$1 AND external_id=$2',
      [decoded.provider, decoded.externalId]
    );
    if (exists.rowCount > 0 && exists.rows[0].user_id !== user.id) {
      return res.status(409).json({ code: 'OAUTH_ALREADY_BOUND', error: '该企业微信账号已被其他用户绑定' });
    }

    if (exists.rowCount === 0) {
      await global.pool.query(
        `INSERT INTO user_identities (user_id, provider, external_id, profile)
         VALUES ($1, $2, $3, $4)`,
        [user.id, decoded.provider, decoded.externalId, decoded.profile || {}]
      );
    }
    await global.pool.query(
      'UPDATE portal_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]
    );
    const token = (user.role === 'admin') ? signAdminToken(user) : signPortalToken(user);
    res.json({ token, user: formatUserForResponse(user) });
  } catch (err) {
    console.error('[oauth/bind/login] failed:', err);
    res.status(500).json({ error: '绑定失败' });
  }
});

// ============================================================
// POST /api/auth/oauth/bind/skip — 首次扫码 → 自动用企微信息创建新账号
// ============================================================
router.post('/api/auth/oauth/bind/skip', express.json(), async (req, res) => {
  try {
    const { ticket } = req.body || {};
    if (!ticket) return res.status(400).json({ error: 'ticket 缺失' });

    let decoded;
    try { decoded = consumeTicket(ticket, 'oauth_binding'); }
    catch { return res.status(401).json({ code: 'OAUTH_TICKET_INVALID', error: 'ticket 无效' }); }

    // 重复:防止用户在 preview 接口和 skip 接口之间状态漂移导致重复创建
    const existing = await global.pool.query(
      'SELECT user_id FROM user_identities WHERE provider=$1 AND external_id=$2',
      [decoded.provider, decoded.externalId]
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ code: 'OAUTH_ALREADY_BOUND', error: '该企业微信账号已绑定,请直接登录' });
    }

    // 生成 username
    const candidate = buildCandidateUsername(decoded.externalId, decoded.profile && decoded.profile.name);
    const username = await generateUniqueUsername(global.pool, candidate);
    const displayName = (decoded.profile && decoded.profile.name) || username;

    // 随机密码(用户用不到,后续可在个人中心 set)
    const randomPassword = crypto.randomBytes(16).toString('base64').slice(0, 32);
    const passwordHash = await bcrypt.hash(randomPassword, 12);

    // 同步到 1Panel(失败不阻断)
    let panelUserId = null;
    let sessionTimeout = 86400;
    try {
      const panelUser = await findPanelUser(username);
      if (panelUser) {
        panelUserId = panelUser.id;
        sessionTimeout = panelUser.sessionTimeout || 86400;
      } else {
        try {
          await createPanelUser({ username, password: randomPassword, name: displayName });
          const created = await findPanelUser(username);
          if (created) {
            panelUserId = created.id;
            sessionTimeout = created.sessionTimeout || 86400;
          }
        } catch (e) {
          console.error('[oauth/bind/skip] 1Panel 创建用户失败,仍创建本地:', e.message);
        }
      }
    } catch (e) {
      console.error('[oauth/bind/skip] 1Panel 查询失败,仍创建本地:', e.message);
    }

    const ins = await global.pool.query(
      `INSERT INTO portal_users
         (panel_user_id, username, name, password_hash, session_timeout, status, role, auto_created_from)
       VALUES ($1, $2, $3, $4, $5, 'active', 'user', $6)
       RETURNING *`,
      [panelUserId, username, displayName, passwordHash, sessionTimeout, decoded.provider]
    );
    const user = ins.rows[0];
    await global.pool.query(
      `INSERT INTO user_identities (user_id, provider, external_id, profile)
       VALUES ($1, $2, $3, $4)`,
      [user.id, decoded.provider, decoded.externalId, decoded.profile || {}]
    );

    const token = signPortalToken(user);
    res.json({
      token,
      user: formatUserForResponse(user),
      auto_created: true,
      suggested_set_password: true,
    });
  } catch (err) {
    console.error('[oauth/bind/skip] failed:', err);
    res.status(500).json({ error: '创建账号失败' });
  }
});

// ============================================================
// GET /api/auth/oauth/bind/preview-username?ticket=... — 告诉用户"跳过"会创建什么用户名
// 注意:此接口不消费 ticket(用 jwt.verify 不带 jti 检查),否则后续 skip 会失败
// ============================================================
router.get('/api/auth/oauth/bind/preview-username', async (req, res) => {
  try {
    const ticket = req.query.ticket;
    if (!ticket) return res.status(400).json({ error: 'ticket 缺失' });
    const { JWT_SECRET } = require('../auth');
    const jwt = require('jsonwebtoken');
    let decoded;
    try { decoded = jwt.verify(String(ticket), JWT_SECRET); }
    catch { return res.status(401).json({ code: 'OAUTH_TICKET_INVALID', error: 'ticket 无效' }); }
    if (decoded.type !== 'oauth_binding') {
      return res.status(401).json({ code: 'OAUTH_TICKET_INVALID', error: 'ticket 类型错误' });
    }
    const candidate = buildCandidateUsername(decoded.externalId, decoded.profile && decoded.profile.name);
    const username = await generateUniqueUsername(global.pool, candidate);
    res.json({
      suggested_username: username,
      display_name: (decoded.profile && decoded.profile.name) || username,
    });
  } catch (err) {
    console.error('[oauth/bind/preview-username] failed:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

module.exports = { router, respondWithTopRedirect };
