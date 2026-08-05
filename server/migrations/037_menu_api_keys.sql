-- 037: 用户侧菜单对齐前端页面结构
-- 1) 新增 API Key 管理菜单权限位(独立于基础信息)
-- 2) menu:profile 显示名改为基础信息(对应 ProfileView 的 基础信息 tab)

INSERT INTO permissions (module, action, key, name) VALUES
('menu', 'api-keys', 'menu:api-keys', 'API Key 管理')
ON CONFLICT (key) DO NOTHING;

-- 给 user 内置角色配 API Key 管理菜单权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'user' AND r.is_system = TRUE
  AND p.key = 'menu:api-keys'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- menu:profile 显示名改为基础信息(对齐 ProfileView 基础信息 tab)
UPDATE permissions SET name = '基础信息' WHERE key = 'menu:profile';