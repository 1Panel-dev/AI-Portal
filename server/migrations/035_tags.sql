-- 043: 标签体系
-- 合并: 043_tags + 044_tag_resource_types + 045_tag_permissions_fix

-- 1. 全局标签库
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

-- 2. 标签适用资源类型表
CREATE TABLE IF NOT EXISTS tag_resource_types (
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL REFERENCES resource_types(key) ON DELETE CASCADE,
  PRIMARY KEY (tag_id, resource_type)
);

-- 存量预置标签先归入模型
INSERT INTO tag_resource_types (tag_id, resource_type)
SELECT t.id, 'model' FROM tags t
WHERE t.name IN ('推荐', '多模态', '文本', 'Embedding', '重排')
ON CONFLICT DO NOTHING;

-- "推荐"标签同时适用于技能(预置;其他标签可在标签管理后台手动设置)
INSERT INTO tag_resource_types (tag_id, resource_type)
SELECT t.id, 'skill' FROM tags t
WHERE t.name = '推荐'
ON CONFLICT DO NOTHING;

-- 3. 标签权限（查看/新增/编辑/删除/菜单）
INSERT INTO permissions (module, action, key, name) VALUES
  ('tag', 'view', 'tag:view', '标签查看'),
  ('tag', 'create', 'tag:create', '标签新增'),
  ('tag', 'edit', 'tag:edit', '标签编辑'),
  ('tag', 'delete', 'tag:delete', '标签删除'),
  ('menu', 'admin-tags', 'menu:admin-tags', '标签管理')
ON CONFLICT (key) DO NOTHING;
