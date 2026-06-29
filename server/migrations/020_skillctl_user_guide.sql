-- 020: 个人中心 skillctl 改造 — 提交技能开关 + skillctl 文档 URL
INSERT INTO system_config (key, value, updated_at) VALUES
  ('portal_skill_submit_enabled', 'false', CURRENT_TIMESTAMP),
  ('site_skillctl_doc_url',       '',      CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
