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

// 用户上传的品牌资源(logo / favicon)对外暴露
// 走持久卷, 走 /uploads/branding/<filename>, 不需要 BASE_PATH 占位符
const uploadsDir = path.join(__dirname, '../data/uploads');
if (fs.existsSync(uploadsDir)) {
  app.use('/uploads', express.static(uploadsDir, {
    maxAge: '1h',           // 文件名带时间戳, 改完前端拿到新 url 自动换图
    fallthrough: true,
  }));
}

app.use(require('./routes/admin'));
app.use(require('./routes/marketplace'));
app.use(require('./routes/portal'));
app.use(require('./routes/oauth').router);

if (SERVE_STATIC) {
  // 关键:index.html 不能直接走 express.static,要先拦下来做 BASE_PATH 占位符替换
  // 缓存替换结果,避免每次请求都读盘+正则
  const indexPath = path.join(STATIC_PATH, 'index.html');
  let cachedIndexHtml = null;
  const renderIndexHtml = () => {
    if (cachedIndexHtml) return cachedIndexHtml;
    if (!fs.existsSync(indexPath)) return null;
    const raw = fs.readFileSync(indexPath, 'utf-8');
    cachedIndexHtml = raw.split('__BASE_PATH__').join(BASE_PATH);
    return cachedIndexHtml;
  };
  const sendIndex = (req, res) => {
    const html = renderIndexHtml();
    if (!html) return res.status(500).send('index.html missing');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-cache');  // index.html 不能强缓存,避免改了 BASE_PATH 用户拿到旧值
    res.send(html);
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
