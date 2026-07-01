-- 015: 站点品牌 + 公告横幅可配置
-- 复用 system_config (key/value),不开新表

-- 站点品牌
INSERT INTO system_config (key, value, updated_at) VALUES
  ('site_name',    'AI门户', CURRENT_TIMESTAMP),
  ('site_logo',    '',              CURRENT_TIMESTAMP),
  ('site_favicon', '',              CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;

-- 公告横幅(marquee 滚动条):通用欢迎语
INSERT INTO system_config (key, value, updated_at) VALUES
  ('banner_enabled', 'true', CURRENT_TIMESTAMP),
  ('banner_html',
$$欢迎使用 <span class="banner-emphasis">AI门户</span> —— 企业 AI 自助门户，探索模型、申请密钥、安装技能，一站式开启 AI 之旅。$$,
   CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;

-- 首次访问详细公告 dialog
INSERT INTO system_config (key, value, updated_at) VALUES
  ('dialog_enabled', 'true',                  CURRENT_TIMESTAMP),
  ('dialog_title',   '欢迎使用 AI门户',     CURRENT_TIMESTAMP),
  ('dialog_html',
$$<p>欢迎来到 <strong>AI门户</strong> —— 企业 AI 自助门户。</p>
<p>在这里你可以：</p>
<ul>
  <li>🧠 <strong>模型广场</strong> — 浏览所有可调用的 AI 模型，一键复制模型名称</li>
  <li>🔑 <strong>API Key 管理</strong> — 申请、重置、管理你的 API 密钥</li>
  <li>📦 <strong>技能市场</strong> — 发现并安装 AI 技能，拓展工作能力</li>
</ul>
<p>如果你是首次使用，请先<a href="/register">注册账号</a>，然后在个人中心创建 API Key 即可开始调用模型。</p>
<p class="dialog-footnote">如有任何问题，请联系系统管理员。</p>$$,
   CURRENT_TIMESTAMP),
  -- 版本号:admin 每次保存公告时递增,前端用 vN 作 localStorage key 后缀,
  -- 实现「公告变更后,曾点过'不再提示'的用户重新看到 dialog」
  ('dialog_version', '1', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
