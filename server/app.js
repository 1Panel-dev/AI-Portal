const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const morgan = require('morgan');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('✅ 已加载 .env:', envPath);
} else {
  dotenv.config();
  console.log('⚠️ 使用默认 .env 配置');
}

// ===== JWT_SECRET 自动生成（用户未指定时） =====
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-in-production') {
  const secretsFile = path.join(__dirname, '.generated_secrets');
  if (fs.existsSync(secretsFile)) {
    const content = fs.readFileSync(secretsFile, 'utf-8');
    const match = content.match(/^JWT_SECRET=(.+)/m);
    if (match) process.env.JWT_SECRET = match[1];
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-in-production') {
    const crypto = require('crypto');
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    try {
      const dir = path.dirname(secretsFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(secretsFile, `JWT_SECRET=${process.env.JWT_SECRET}\n`, { mode: 0o600 });
      console.log('🔑 JWT_SECRET 已自动生成并持久化');
    } catch (err) {
      console.warn('⚠️ 无法持久化 JWT_SECRET:', err.message);
    }
  }
}

const app = express();
const PORT = process.env.PORT || 3002;
const SERVE_STATIC = process.env.SERVE_STATIC === 'true';
const STATIC_PATH = process.env.STATIC_PATH || path.join(__dirname, '../dist');
// nginx 反向代理前缀,默认 /(无前缀)
// 例:nginx 配 location /portal/ { proxy_pass http://127.0.0.1:3000/; } 时,设 BASE_PATH=/portal/
// 必须以 / 开头并以 / 结尾(浏览器 <base href> 规范要求)
let BASE_PATH = process.env.BASE_PATH || '/';
if (!BASE_PATH.startsWith('/')) BASE_PATH = '/' + BASE_PATH;
if (!BASE_PATH.endsWith('/')) BASE_PATH = BASE_PATH + '/';
console.log(`🛣️  BASE_PATH = ${BASE_PATH}`);

// OAuth 回调需要识别 X-Forwarded-Proto(nginx 反代到 http 时),否则 req.protocol 永远是 http
// 与 1Panel 生态部署一致:容器内 3000 端口,前面通常有 nginx 终止 TLS
app.set('trust proxy', 1);


if (!SERVE_STATIC) {
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || /^https?:\/\/localhost:\d+$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }));
}

app.use(express.json());
app.use(morgan('combined'));

// 确保上传目录存在（Docker volume 挂载会覆写镜像内空目录）
const uploadsRoot = path.join(__dirname, '../data/uploads');
[uploadsRoot, path.join(uploadsRoot, 'skills'), path.join(uploadsRoot, 'skills', '_tmp'), path.join(uploadsRoot, 'branding')].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 用户上传的品牌资源(logo / favicon)对外暴露
// 走持久卷, 走 /uploads/branding/<filename>, 不需要 BASE_PATH 占位符
const uploadsDir = uploadsRoot;
app.use('/uploads', express.static(uploadsDir, {
    maxAge: '1h',
    fallthrough: true,
  }));

app.use(require('./routes/admin'));
app.use(require('./routes/marketplace'));
app.use(require('./routes/portal'));
app.use(require('./routes/oauth').router);
app.use(require('./routes/mcp'));

if (SERVE_STATIC) {
  // 关键:index.html 不能直接走 express.static,要先拦下来做占位符替换
  // 替换三类占位符:__BASE_PATH__(路由前缀)、__SITE_NAME__(站名,进 <title>)、
  // __SITE_BRANDING_JSON__(站名/logo/favicon, 进内联脚本, 前端首屏直接用)。
  // 把站点品牌一起注入, 是为了让刷新首屏即显示正确站名/favicon, 不再"先闪默认值再 fetch 回填"。
  const indexPath = path.join(STATIC_PATH, 'index.html');
  let cachedIndexHtml = null;
  let cachedBranding = null;

  // 从 system_config 读站点品牌; 失败时回退默认值, 不阻塞首屏
  const readSiteBranding = async () => {
    if (cachedBranding) return cachedBranding;
    const fallback = { site_name: 'AI-Portal', site_logo: '', site_favicon: '' };
    try {
      if (!global.pool) return fallback;
      const result = await global.pool.query(
        `SELECT key, value FROM system_config WHERE key IN ('site_name', 'site_logo', 'site_favicon')`
      );
      const map = {};
      for (const row of result.rows) map[row.key] = row.value;
      cachedBranding = {
        site_name:    map.site_name    || 'AI-Portal',
        site_logo:    map.site_logo    || '',
        site_favicon: map.site_favicon || '',
      };
      return cachedBranding;
    } catch (err) {
      console.warn('注入站点品牌失败,沿用默认值:', err.message);
      return fallback;
    }
  };

  // 与前端 resolveAssetUrl 同语义: /uploads/xx.png → <BASE_PATH 去尾斜杠>/uploads/xx.png; 外链原样
  const resolveAssetUrl = (url) => {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return url.startsWith('/') ? BASE_PATH.replace(/\/$/, '') + url : url;
  };

  // HTML 文本转义(站名会进 <title>): 防 < > & " 把标签结构破坏
  const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // 内联 <script> 里塞 JSON,只需防 </script> 提前闭合(< 与 U+2028/2029 在 JSON 上下文里无害,但一并转义 < 更稳)
  const safeJsonForScript = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

  const renderIndexHtml = async () => {
    if (cachedIndexHtml) return cachedIndexHtml;
    if (!fs.existsSync(indexPath)) return null;
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const branding = await readSiteBranding();
    const brandingJson = safeJsonForScript({
      site_name: branding.site_name,
      site_logo: resolveAssetUrl(branding.site_logo),
      site_favicon: resolveAssetUrl(branding.site_favicon),
    });
    cachedIndexHtml = raw
      .split('__BASE_PATH__').join(BASE_PATH)
      .split('__SITE_NAME__').join(escapeHtml(branding.site_name))
      .split('__SITE_BRANDING_JSON__').join(brandingJson);
    return cachedIndexHtml;
  };
  const sendIndex = async (req, res) => {
    try {
      const html = await renderIndexHtml();
      if (!html) return res.status(500).send('index.html missing');
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'no-cache');  // index.html 不能强缓存,避免改了 BASE_PATH/站名 用户拿到旧值
      res.send(html);
    } catch (err) {
      // renderIndexHtml 在 await 之后抛错会变成 rejected promise,Express 4 不会自动捕获,这里兜住返 500
      console.error('渲染 index.html 失败:', err);
      res.status(500).send('index.html render failed');
    }
  };
  // admin 保存品牌后调它, 让下次请求重新读 system_config 并重渲染
  app.locals.invalidateIndexCache = () => {
    cachedIndexHtml = null;
    cachedBranding = null;
  };

  // 显式优先匹配 index.html / 根路径,确保走占位符替换而不是 express.static 直出
  app.get(['/', '/index.html'], sendIndex);

  // 静态资源(assets/xxx 等):正常直出,带强缓存
  app.use(express.static(STATIC_PATH, { index: false }));

  // 未匹配的 /api/* 必须返 JSON 404,不能被下面的 SPA fallback 兜成 index.html
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found', path: req.originalUrl });
  });

  // SPA fallback:其它所有路径都返回(替换后的)index.html
  app.get('*', sendIndex);
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误' });
});

module.exports = {
  app,
  PORT,
  SERVE_STATIC,
  STATIC_PATH,
};
