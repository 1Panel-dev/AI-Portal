-- 030: 内置角色 + 权限原子种子 + 默认关联 + 资源类型种子

-- 资源类型种子（model/skill/mcp）
INSERT INTO resource_types (key, name, sort_order, intersect_panel) VALUES
('model', '模型', 1, TRUE),
('skill', 'Skill', 2, FALSE),
('mcp', 'MCP', 3, FALSE)
ON CONFLICT (key) DO NOTHING;

-- 权限原子（模块×CRUD）
INSERT INTO permissions (module, action, key, name) VALUES
('model', 'view', 'model:view', '模型查看'),
('model', 'sync', 'model:sync', '模型同步'),
('key', 'view', 'key:view', 'API Key 查看'),
('key', 'create', 'key:create', 'API Key 创建'),
('key', 'edit', 'key:edit', 'API Key 编辑'),
('key', 'delete', 'key:delete', 'API Key 删除'),
('skill', 'view', 'skill:view', '技能查看'),
('skill', 'create', 'skill:create', '技能创建'),
('skill', 'edit', 'skill:edit', '技能编辑'),
('skill', 'delete', 'skill:delete', '技能删除'),
('mcp', 'view', 'mcp:view', 'MCP 查看'),
('mcp', 'sync', 'mcp:sync', 'MCP 同步'),
('user', 'view', 'user:view', '用户查看'),
('user', 'create', 'user:create', '用户创建'),
('user', 'edit', 'user:edit', '用户编辑'),
('user', 'delete', 'user:delete', '用户删除'),
('role', 'view', 'role:view', '角色查看'),
('role', 'create', 'role:create', '角色创建'),
('role', 'edit', 'role:edit', '角色编辑'),
('role', 'delete', 'role:delete', '角色删除'),
('group', 'view', 'group:view', '资源组查看'),
('group', 'create', 'group:create', '资源组创建'),
('group', 'edit', 'group:edit', '资源组编辑'),
('group', 'delete', 'group:delete', '资源组删除'),
('system', 'config', 'system:config', '系统配置')
ON CONFLICT (key) DO NOTHING;

-- 内置角色
INSERT INTO roles (name, description, is_system) VALUES
('admin', '超级管理员（标记用，实际走 is_portal_admin）', TRUE),
('user', '普通用户', TRUE)
ON CONFLICT DO NOTHING;

-- user 角色默认权限：model:view + key:* + skill:view/create + mcp:view
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'user' AND r.is_system = TRUE
  AND p.key IN ('model:view','key:view','key:create','key:edit','key:delete','skill:view','skill:create','mcp:view')
ON CONFLICT (role_id, permission_id) DO NOTHING;
