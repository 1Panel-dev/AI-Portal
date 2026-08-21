-- 043: 全局标签库
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  color VARCHAR(20) NOT NULL DEFAULT '#005eeb',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tags (name, color, sort_order) VALUES
  ('推荐', '#005eeb', 10),
  ('多模态', '#7c3aed', 20),
  ('文本', '#0f766e', 30),
  ('Embedding', '#c2410c', 40),
  ('重排', '#be123c', 50)
ON CONFLICT (name) DO NOTHING;

-- 标签查看权限（菜单入口 + 列表展示用）
INSERT INTO permissions (module, action, key, name) VALUES
  ('tag', 'view', 'tag:view', '标签查看')
ON CONFLICT (key) DO NOTHING;

-- 标签新增权限
INSERT INTO permissions (module, action, key, name) VALUES
  ('tag', 'create', 'tag:create', '标签新增')
ON CONFLICT (key) DO NOTHING;

-- 标签编辑权限
INSERT INTO permissions (module, action, key, name) VALUES
  ('tag', 'edit', 'tag:edit', '标签编辑')
ON CONFLICT (key) DO NOTHING;

-- 标签删除权限
INSERT INTO permissions (module, action, key, name) VALUES
  ('tag', 'delete', 'tag:delete', '标签删除')
ON CONFLICT (key) DO NOTHING;

-- 菜单权限
INSERT INTO permissions (module, action, key, name) VALUES
  ('menu', 'admin-tags', 'menu:admin-tags', '标签管理')
ON CONFLICT (key) DO NOTHING;
