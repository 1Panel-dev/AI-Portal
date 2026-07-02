/**
 * 企业微信 OAuth adapter
 * 文档来源:docs/superpowers/specs/2026-06-24-third-party-oauth-login-design.md §4.3
 *
 * 本文件含两类内容:
 *   - 纯函数 / 元信息:buildAuthUrl / inspectWecomBiz / configSchema(本任务实现)
 *   - 副作用接口:exchangeCode / testConnection(下一任务实现,需 token-cache 注入)
 */

const configSchema = {
  fields: [
    { key: 'corpid', label: '企业 ID (CorpID)', type: 'text', required: true },
    { key: 'agentid', label: '应用 AgentID', type: 'text', required: true },
    { key: 'secret', label: '应用 Secret', type: 'password', required: true, sensitive: true },
  ],
};

function isInsideWecomClient(userAgent = '') {
  return /wxwork/i.test(userAgent);
}

/**
 * 生成跳转 URL
 * - 企微客户端内 UA → snsapi_base 静默授权
 * - 浏览器 UA → 扫码登录页(前端通常用 JSSDK 内嵌,此 URL 作为降级 fallback)
 */
function buildAuthUrl({ config, state, redirectUri, userAgent }) {
  const encodedRedirect = encodeURIComponent(redirectUri);
  if (isInsideWecomClient(userAgent)) {
    return `https://open.weixin.qq.com/connect/oauth2/authorize` +
      `?appid=${encodeURIComponent(config.corpid)}` +
      `&redirect_uri=${encodedRedirect}` +
      `&response_type=code` +
      `&scope=snsapi_base` +
      `&state=${encodeURIComponent(state)}` +
      `&agentid=${encodeURIComponent(config.agentid)}` +
      `#wechat_redirect`;
  }
  return `https://login.work.weixin.qq.com/wwlogin/sso/login` +
    `?login_type=CorpApp` +
    `&appid=${encodeURIComponent(config.corpid)}` +
    `&agentid=${encodeURIComponent(config.agentid)}` +
    `&redirect_uri=${encodedRedirect}` +
    `&state=${encodeURIComponent(state)}`;
}

/**
 * 企微响应业务码校验
 * 沿用项目的"HTTP 200 + body.errcode" 范式,与 1Panel 的 body.code 一个性质
 */
function inspectWecomBiz(body) {
  if (!body || typeof body.errcode === 'undefined') {
    throw new Error('企微响应缺少 errcode 字段');
  }
  if (body.errcode !== 0) {
    throw new Error(`errcode=${body.errcode} ${body.errmsg || ''}`.trim());
  }
  return body;
}

const { createTokenCache } = require('./token-cache');
const tokenCache = createTokenCache();

// 企微 API 调用加超时,防止网络异常时请求永久挂起(用户卡在"登录中...")
const WECOM_FETCH_TIMEOUT = 10000; // 10 秒
async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WECOM_FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function _fetchTokenFromWecom(config) {
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken` +
    `?corpid=${encodeURIComponent(config.corpid)}` +
    `&corpsecret=${encodeURIComponent(config.secret)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error(`[wecom.gettoken] HTTP ${res.status} body=${t.slice(0, 500)}`);
    throw new Error(`gettoken HTTP ${res.status}`);
  }
  const body = await res.json();
  // access_token 是敏感凭证,只打印前8位用于核对,不落全量日志
  const masked = { ...body, access_token: body.access_token ? body.access_token.slice(0, 8) + '...(masked)' : null };
  console.log(`[wecom.gettoken] response:`, JSON.stringify(masked));
  inspectWecomBiz(body);   // 检查 errcode
  return { token: body.access_token, expiresIn: body.expires_in || 7200 };
}

function _tokenKey(config) {
  return `wecom:${config.corpid}:${config.agentid}`;
}

/**
 * 用 code 换 userid + profile
 * 流程:
 *   1. 拿 access_token(走 token-cache)
 *   2. /cgi-bin/auth/getuserinfo 拿 userid
 *   3. (best-effort) /cgi-bin/user/get 拿 name/avatar
 * external_id 取字段优先级:
 *   userid    — 应用可见范围内的成员(典型自建应用场景)
 *   open_userid — 应用授权访问外部联系人
 *   openid    — 老版本应用 / 部分可见范围外成员
 * 这个顺序一旦确定不能改,改了会导致所有历史绑定失效(见设计稿 §11.7)
 */
async function exchangeCode({ config, code }) {
  const token = await tokenCache.getToken(_tokenKey(config), () => _fetchTokenFromWecom(config));

  // 1. 拿 userid
  const u1 = `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo` +
    `?access_token=${encodeURIComponent(token)}&code=${encodeURIComponent(code)}`;
  const r1 = await fetchWithTimeout(u1);
  if (!r1.ok) {
    const t = await r1.text().catch(() => '');
    console.error(`[wecom.exchangeCode] getuserinfo HTTP ${r1.status} body=${t.slice(0, 500)}`);
    throw new Error(`getuserinfo HTTP ${r1.status}`);
  }
  const b1 = await r1.json();
  console.log(`[wecom.exchangeCode] getuserinfo response:`, JSON.stringify(b1));
  inspectWecomBiz(b1);

  const externalId = b1.userid || b1.open_userid || b1.openid || '';
  if (!externalId) {
    throw new Error('企微响应未包含 userid / open_userid / openid');
  }
  console.log(`[wecom.exchangeCode] getuserinfo ok: userid=${b1.userid || '-'} open_userid=${b1.open_userid || '-'} openid=${b1.openid || '-'} → externalId=${externalId}`);

  // 2. 拉 profile(best-effort,需要应用对该成员有可见权限)
  // 失败的常见原因:60011 应用可见范围外、60012 通讯录权限不足。失败不阻断登录,
  // username 生成会 fallback 到 externalId。
  let profile = { name: '', avatar: '' };
  if (b1.userid) {
    try {
      const u2 = `https://qyapi.weixin.qq.com/cgi-bin/user/get` +
        `?access_token=${encodeURIComponent(token)}&userid=${encodeURIComponent(b1.userid)}`;
      const r2 = await fetchWithTimeout(u2);
      if (r2.ok) {
        const b2 = await r2.json();
        console.log(`[wecom.exchangeCode] user/get response:`, JSON.stringify(b2));
        if (b2.errcode === 0) {
          profile = { name: b2.name || '', avatar: b2.avatar || '' };
          console.log(`[wecom.exchangeCode] user/get ok: userid=${b1.userid} name=${profile.name || '(空)'} avatar=${profile.avatar ? '有' : '无'}`);
        } else {
          console.warn(`[wecom.exchangeCode] user/get errcode=${b2.errcode} ${b2.errmsg || ''} userid=${b1.userid}`);
        }
      } else {
        console.warn(`[wecom.exchangeCode] user/get HTTP ${r2.status} (non-fatal) userid=${b1.userid}`);
      }
    } catch (e) {
      console.warn(`[wecom.exchangeCode] user/get failed (non-fatal): userid=${b1.userid} ${e.message}`);
    }
  }

  return { externalId, profile };
}

/**
 * 测试连接:能否拿到 access_token
 * 不走缓存(避免脏数据,且 testConnection 用的 config 可能跟 DB 里不一样)
 */
async function testConnection(config) {
  if (!config.corpid || !config.agentid || !config.secret) {
    throw new Error('corpid / agentid / secret 都不能为空');
  }
  await _fetchTokenFromWecom(config);
  return { ok: true };
}

function _getTokenCache() {
  return tokenCache;
}

module.exports = {
  provider: 'wecom',
  displayName: '企业微信',
  configSchema,
  buildAuthUrl,
  inspectWecomBiz,
  isInsideWecomClient,
  exchangeCode,
  testConnection,
  _getTokenCache,
};
