-- 045: 补齐标签增删查权限（043 存量环境可能只有 tag:edit）
INSERT INTO permissions (module, action, key, name) VALUES
  ('tag', 'view', 'tag:view', '标签查看'),
  ('tag', 'create', 'tag:create', '标签新增'),
  ('tag', 'delete', 'tag:delete', '标签删除')
ON CONFLICT (key) DO NOTHING;
