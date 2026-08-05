const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('❌ 缺少 JWT_SECRET 环境变量，请在 .env 中配置');
  console.error('   示例: JWT_SECRET=your-random-secret-key');
  process.exit(1);
}

const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { error: '登录尝试次数过多，请5分钟后重试' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        jwt.verify(token, JWT_SECRET);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  },
});

const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { error: '上传过于频繁，请10分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 验证普通用户权限（Phase 2: 认 admin_token + SELECT 加 is_portal_admin）
const verifyUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // 兼容两种 token: portal_user 和 admin（spec 核查修正3）
    if (decoded.type === 'portal_user' || decoded.type === 'admin') {
      const result = await global.pool.query(`
        SELECT id, panel_user_id, username, name, role, status, is_portal_admin, last_login_at, created_at
        FROM portal_users
        WHERE id = $1
      `, [decoded.id]);

      if (result.rowCount === 0 || result.rows[0].status !== 'active') {
        return res.status(401).json({ error: '用户不存在或已禁用' });
      }

      req.portalUser = result.rows[0];
      req.user = decoded;
      next();
    } else {
      return res.status(401).json({ error: 'Token 无效' });
    }
  } catch (err) {
    return res.status(401).json({ error: 'Token 无效或已过期' });
  }
};

// 可选用户中间件（供三广场用: 访客放行, 登录用户附 req.portalUser 用于过滤）
const optionalUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();
  try {
    const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
    if (decoded.type === 'portal_user' || decoded.type === 'admin') {
      const result = await global.pool.query(
        'SELECT id, panel_user_id, is_portal_admin FROM portal_users WHERE id = $1 AND status = $2',
        [decoded.id, 'active']
      );
      if (result.rowCount) req.portalUser = result.rows[0];
    }
  } catch {
    // 无效 token 静默放行（访客语义）
  }
  next();
};

// 权限中间件（依赖 verifyUser 设的 req.portalUser）
function requirePermission(permissionKey) {
  return async (req, res, next) => {
    if (!req.portalUser) {
      return res.status(401).json({ error: '未登录' });
    }
    if (req.portalUser.is_portal_admin) return next();
    const { hasPermission } = require('./lib/permission');
    const ok = await hasPermission(req.portalUser.id, permissionKey);
    if (!ok) return res.status(403).json({ code: 'FORBIDDEN', error: '权限不足' });
    next();
  };
}

// 生成 portal user token
function signPortalToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, type: 'portal_user', role: user.role },
    JWT_SECRET,
    { expiresIn: '1d' }
  );
}

// 生成 admin token
function signAdminToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: 'admin', type: 'admin' },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// 短 JWT ticket，5 分钟有效
const TICKET_TTL = '5m';

// 5 分钟黑名单（防止 ticket 重放；内存 Map，jti 用一次即作废）
const usedJti = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of usedJti) if (v < now) usedJti.delete(k);
}, 60_000).unref?.();

/**
 * 登录成功的 ticket（给 /api/auth/oauth/complete 换 token 用）
 * payload: { userId, role }
 */
function signOauthTicket(payload) {
  const jti = crypto.randomBytes(8).toString('hex');
  return jwt.sign({ ...payload, type: 'oauth_ticket', jti }, JWT_SECRET, { expiresIn: TICKET_TTL });
}

/**
 * 首次扫码的"绑定 ticket"（给 /bind/login 或 /bind/skip 用）
 * payload: { provider, externalId, profile }
 */
function signOauthBindingTicket(payload) {
  const jti = crypto.randomBytes(8).toString('hex');
  return jwt.sign({ ...payload, type: 'oauth_binding', jti }, JWT_SECRET, { expiresIn: TICKET_TTL });
}

/**
 * 校验 ticket 并消费（一次性）
 * expectedType: 'oauth_ticket' | 'oauth_binding'
 */
function consumeTicket(token, expectedType) {
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); }
  catch { throw new Error('OAUTH_TICKET_INVALID'); }
  if (decoded.type !== expectedType) throw new Error('OAUTH_TICKET_INVALID');
  if (!decoded.jti || usedJti.has(decoded.jti)) throw new Error('OAUTH_TICKET_INVALID');
  // 标记 jti 已用（过期时间 5 分钟）
  usedJti.set(decoded.jti, Date.now() + 5 * 60 * 1000);
  return decoded;
}

module.exports = {
  JWT_SECRET,
  downloadLimiter,
  loginLimiter,
  uploadLimiter,
  verifyUser,
  optionalUser,
  requirePermission,
  signPortalToken,
  signAdminToken,
  signOauthTicket,
  signOauthBindingTicket,
  consumeTicket,
};
