-- 按功能细分权限(合并原 041+042):一个功能按钮 = 一个独立权限位,消除粗粒度权限的勾选联动。
-- 原 skill:edit 同时含「审核 + 上架/下架」; user:edit 同时含「改密 + 批量改密 + 分配角色」;
-- group:edit 同时含「面板同步」。拆成独立权限位,各自可单独授予。

INSERT INTO permissions (module, action, key, name) VALUES
('skill', 'review', 'skill:review', '技能审核'),
('group', 'panel-sync', 'group:panel-sync', '面板同步'),
('skill', 'publish', 'skill:publish', '技能上架/下架'),
('user', 'password', 'user:password', '修改密码'),
('user', 'batch-password', 'user:batch-password', '批量改密'),
('user', 'assign', 'user:assign', '分配角色')
ON CONFLICT (key) DO NOTHING;

-- 存量角色补授(历史数据关键):原粗权限拆细后,已持旧权限的角色补齐新权限位,保证行为不变。
-- skill:edit → skill:review
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, rv.id
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id AND p.key = 'skill:edit'
JOIN permissions rv ON rv.key = 'skill:review'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- skill:edit → skill:publish
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, sp.id
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id AND p.key = 'skill:edit'
JOIN permissions sp ON sp.key = 'skill:publish'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- user:edit → user:password / user:batch-password / user:assign
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, n.id
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id AND p.key = 'user:edit'
JOIN permissions n ON n.key IN ('user:password', 'user:batch-password', 'user:assign')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- group:edit → group:panel-sync
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, gs.id
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id AND p.key = 'group:edit'
JOIN permissions gs ON gs.key = 'group:panel-sync'
ON CONFLICT (role_id, permission_id) DO NOTHING;
