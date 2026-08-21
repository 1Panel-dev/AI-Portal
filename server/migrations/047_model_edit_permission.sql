-- 047: 补齐 model:edit 权限种子（030 只种了 model:view / model:sync）
INSERT INTO permissions (module, action, key, name) VALUES
  ('model', 'edit', 'model:edit', '模型编辑')
ON CONFLICT (key) DO NOTHING;
