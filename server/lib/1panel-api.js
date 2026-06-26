/**
 * 1Panel API 客户端
 *
 * 1Panel 自定义 Token 认证：
 *   Token = md5('1panel' + API-Key + UnixTimestamp)
 *
 * 配置优先级:数据库 > 环境变量
 * 配置热重载:管理后台保存后调用 reload(pool)
 *
 * 使用方式：
 *   1. 在 .env 或管理后台配置 PANEL_BASE_URL / PANEL_API_KEY
 *   2. const panel = require('./lib/1panel-api');
 *   3. await panel.init(pool);  // 启动时调用一次
 *   4. const res = await panel.post('/api/v2/...', { ... });
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');

// ============ 配置(运行时可变) ============
// 初值取自环境变量,init/reload 时被 DB 覆盖

let currentConfig = {
  apiKey: process.env.PANEL_API_KEY || '',
  baseUrl: process.env.PANEL_BASE_URL || '',
  timeout: parseInt(process.env.PANEL_API_TIMEOUT || '10000', 10),
};

// 配置变更回调:同步调度器订阅,配置改了重启调度器
const changeListeners = new Set();

function onConfigChange(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

async function loadFromDB(pool) {
  try {
    const result = await pool.query(
      "SELECT key, value FROM system_config WHERE key LIKE 'panel_%'"
    );
    const map = {};
    for (const row of result.rows) map[row.key] = row.value;
    if (map.panel_base_url) currentConfig.baseUrl = map.panel_base_url;
    if (map.panel_api_key) currentConfig.apiKey = map.panel_api_key;
    if (map.panel_api_timeout) {
      const t = parseInt(map.panel_api_timeout, 10);
      if (!Number.isNaN(t) && t > 0) currentConfig.timeout = t;
    }
  } catch {
    // 表可能不存在(首次启动迁移之前),忽略
  }
}

async function init(pool) {
  await loadFromDB(pool);
}

async function reload(pool) {
  await loadFromDB(pool);
  // 通知调度器
  for (const fn of changeListeners) {
    try { fn(); } catch (e) { console.error('[1panel-api] 配置变更回调异常:', e.message); }
  }
}

function getConfig() {
  const key = currentConfig.apiKey;
  const masked = key ? (key.length > 4 ? '****' + key.slice(-4) : '****') : '';
  return {
    baseUrl: currentConfig.baseUrl,
    apiKey: masked,
    apiKeyConfigured: !!key,
    timeout: currentConfig.timeout,
  };
}

function getRawConfig() {
  return { ...currentConfig };
}

// ============ Token 生成 ============

function generateToken(apiKey, timestamp) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const raw = `1panel${apiKey}${ts}`;
  const token = crypto.createHash('md5').update(raw).digest('hex');
  return { token, timestamp: ts };
}

// ============ HTTP 请求 ============

function parseBaseUrl(baseUrl) {
  if (!baseUrl) {
    throw new Error('请配置 PANEL_BASE_URL，例如: http://192.168.1.100:33846');
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    baseUrl = `http://${baseUrl}`;
  }
  const url = new URL(baseUrl);
  return {
    protocol: url.protocol.replace(':', ''),
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    prefix: url.pathname.replace(/\/+$/, ''),
  };
}

function request(method, path, body = null, options = {}) {
  return new Promise((resolve, reject) => {
    const apiKey = options.apiKey || currentConfig.apiKey;
    const baseUrl = options.baseUrl || currentConfig.baseUrl;
    const timeout = options.timeout || currentConfig.timeout;
    const startedAt = Date.now();

    if (!apiKey) {
      logPanelCall({ method, path, kind: 'config', detail: 'PANEL_API_KEY 未配置', elapsedMs: 0 });
      return reject(new Error('请配置 PANEL_API_KEY(在管理后台 → 系统配置 → 1Panel 网关)'));
    }

    const { token, timestamp } = generateToken(apiKey);
    let parsed;
    try {
      parsed = parseBaseUrl(baseUrl);
    } catch (err) {
      logPanelCall({ method, path, kind: 'config', detail: err.message, elapsedMs: 0 });
      return reject(err);
    }
    const { protocol, hostname, port, prefix } = parsed;
    const fullPath = `${prefix}${path}`;

    let bodyBuffer = null;
    if (body) {
      bodyBuffer = Buffer.from(JSON.stringify(body), 'utf-8');
    }

    const client = protocol === 'https' ? https : http;
    const req = client.request(
      {
        hostname, port, path: fullPath, method,
        headers: {
          '1Panel-Token': token,
          '1Panel-Timestamp': String(timestamp),
          'Content-Type': 'application/json',
          ...(bodyBuffer ? { 'Content-Length': bodyBuffer.length } : {}),
        },
        timeout,
      },
      handleResponse({ method, path, startedAt, resolve })
    );

    attachRequestHandlers(req, { method, fullPath, path, timeout, startedAt, reject });

    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

function handleResponse({ method, path, startedAt, resolve }) {
  return (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
      const elapsedMs = Date.now() - startedAt;
      const buf = Buffer.concat(chunks);
      // 二进制响应(zip / octet-stream): 直接返回 Buffer,不破坏内容
      const ct = String(res.headers['content-type'] || '').toLowerCase();
      const isBinary = ct.includes('application/zip')
                    || ct.includes('application/octet-stream')
                    || ct.includes('application/x-zip');
      if (isBinary) {
        logPanelCall({ method, path, kind: 'binary', httpStatus: res.statusCode, bytes: buf.length, elapsedMs });
        resolve({ status: res.statusCode, data: buf, headers: res.headers });
        return;
      }
      const raw = buf.toString('utf-8');
      let data;
      try { data = JSON.parse(raw); } catch { data = raw; }
      logPanelCall({ method, path, kind: 'http', httpStatus: res.statusCode, body: data, elapsedMs });
      resolve({ status: res.statusCode, data, headers: res.headers });
    });
  };
}

function attachRequestHandlers(req, { method, fullPath, path, timeout, startedAt, reject }) {
  req.on('error', (err) => {
    const elapsedMs = Date.now() - startedAt;
    logPanelCall({ method, path, kind: 'unreachable', detail: err.code || err.message, elapsedMs });
    reject(new Error(`请求失败: ${err.message}`));
  });
  req.on('timeout', () => {
    const elapsedMs = Date.now() - startedAt;
    req.destroy();
    logPanelCall({ method, path, kind: 'timeout', detail: `${timeout}ms`, elapsedMs });
    reject(new Error(`请求超时 (${timeout}ms): ${method} ${fullPath}`));
  });
}

function buildMultipartBody(fields = {}, files = []) {
  const boundary = `----AI-Portal${crypto.randomBytes(12).toString('hex')}`;
  const chunks = [];
  const push = (value) => chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf-8'));

  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
    push(value);
    push('\r\n');
  }

  for (const file of files) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n`);
    push(`Content-Type: ${file.contentType || 'application/octet-stream'}\r\n\r\n`);
    push(file.content);
    push('\r\n');
  }

  push(`--${boundary}--\r\n`);
  return { boundary, bodyBuffer: Buffer.concat(chunks) };
}

function requestMultipart(method, path, { fields = {}, files = [] } = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const apiKey = options.apiKey || currentConfig.apiKey;
    const baseUrl = options.baseUrl || currentConfig.baseUrl;
    const timeout = options.timeout || currentConfig.timeout;
    const startedAt = Date.now();

    if (!apiKey) {
      logPanelCall({ method, path, kind: 'config', detail: 'PANEL_API_KEY 未配置', elapsedMs: 0 });
      return reject(new Error('请配置 PANEL_API_KEY(在管理后台 → 系统配置 → 1Panel 网关)'));
    }

    const { token, timestamp } = generateToken(apiKey);
    let parsed;
    try {
      parsed = parseBaseUrl(baseUrl);
    } catch (err) {
      logPanelCall({ method, path, kind: 'config', detail: err.message, elapsedMs: 0 });
      return reject(err);
    }
    const { protocol, hostname, port, prefix } = parsed;
    const fullPath = `${prefix}${path}`;
    const { boundary, bodyBuffer } = buildMultipartBody(fields, files);
    const client = protocol === 'https' ? https : http;
    const req = client.request(
      {
        hostname, port, path: fullPath, method,
        headers: {
          '1Panel-Token': token,
          '1Panel-Timestamp': String(timestamp),
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': bodyBuffer.length,
        },
        timeout,
      },
      handleResponse({ method, path, startedAt, resolve })
    );

    attachRequestHandlers(req, { method, fullPath, path, timeout, startedAt, reject });
    req.write(bodyBuffer);
    req.end();
  });
}

// ============ 统一日志 ============
//
// 所有 1Panel 调用最终落到 request(),这里集中输出一行结构化日志,方便:
//   - 排查"为什么页面没数据" → grep '[panel-call]' → 看是哪个端点+什么错
//   - 量化失败率 → 抓 ❌ 行算占比
//   - 区分 HTTP 错误 / 业务码错误 / 网络不可达 / 超时 这四类失败模式
//
// 格式约定:
//   [panel-call] METHOD path → ✅ HTTP=200 code=0 12ms
//   [panel-call] METHOD path → ❌ http     HTTP=500 0ms
//   [panel-call] METHOD path → ❌ business HTTP=200 code=401 "API 接口禁止访问" 126ms
//   [panel-call] METHOD path → ❌ unreachable ECONNREFUSED 3ms
//   [panel-call] METHOD path → ❌ timeout 10000ms 10001ms
function logPanelCall({ method, path, kind, httpStatus, body, bytes, detail, elapsedMs }) {
  const head = `[panel-call] ${method} ${path}`;
  try {
    if (kind === 'http') {
      const bizCode = body && typeof body === 'object' ? body.code : undefined;
      const bizMsg = body && typeof body === 'object' ? (body.message || body.msg) : undefined;
      const httpOk = httpStatus >= 200 && httpStatus < 300;
      // 业务层失败:1Panel 习惯 HTTP 200 + body.code 表达,code 落在 HTTP 错误段才算失败
      const bizFail = Number.isFinite(Number(bizCode)) && Number(bizCode) >= 400;
      if (httpOk && !bizFail) {
        console.log(`${head} → ✅ HTTP=${httpStatus} code=${bizCode ?? '-'} ${elapsedMs}ms`);
      } else if (!httpOk) {
        console.error(`${head} → ❌ http HTTP=${httpStatus} ${bizMsg ? `"${String(bizMsg).slice(0, 80)}"` : ''} ${elapsedMs}ms`);
      } else {
        console.error(`${head} → ❌ business HTTP=${httpStatus} code=${bizCode} "${String(bizMsg || '').slice(0, 80)}" ${elapsedMs}ms`);
      }
    } else if (kind === 'binary') {
      const httpOk = httpStatus >= 200 && httpStatus < 300;
      (httpOk ? console.log : console.error)(`${head} → ${httpOk ? '✅' : '❌'} binary HTTP=${httpStatus} ${bytes}B ${elapsedMs}ms`);
    } else if (kind === 'unreachable') {
      console.error(`${head} → ❌ unreachable ${detail} ${elapsedMs}ms`);
    } else if (kind === 'timeout') {
      console.error(`${head} → ❌ timeout ${detail} ${elapsedMs}ms`);
    } else if (kind === 'config') {
      console.error(`${head} → ❌ config ${detail}`);
    }
  } catch (logErr) {
    // 日志出错不能影响业务
    console.error('[panel-call] 日志输出异常:', logErr.message);
  }
}

// ============ 便捷方法 ============

const api = {
  get(path, options) { return request('GET', path, null, options); },
  post(path, body, options) { return request('POST', path, body, options); },
  postMultipart(path, body, options) { return requestMultipart('POST', path, body, options); },
  put(path, body, options) { return request('PUT', path, body, options); },
  delete(path, options) { return request('DELETE', path, null, options); },

  generateToken,
  init,
  reload,
  getConfig,
  getRawConfig,
  onConfigChange,
};

module.exports = api;
