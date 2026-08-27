-- 040: 权限重构
-- 合并: 040_rename_permission_labels + 041_split_permissions + 042_remove_submit_switches

-- 1. 权限位显示名修正
UPDATE permissions SET name = '授权成员' WHERE key = 'group:assign';
UPDATE permissions SET name = 'API Key 重置' WHERE key = 'key:edit';

-- 2. 按功能细分权限（一个功能按钮 = 一个独立权限位）
INSERT INTO permissions (module, action, key, name) VALUES
('skill', 'review', 'skill:review', '技能审核'),
('group', 'panel-sync', 'group:panel-sync', '面板同步'),
('skill', 'publish', 'skill:publish', '技能上架/下架'),
('user', 'password', 'user:password', '修改密码'),
('user', 'batch-password', 'user:batch-password', '批量改密'),
('user', 'assign', 'user:assign', '分配角色')
ON CONFLICT (key) DO NOTHING;

-- 3. 存量角色补授（历史数据关键）
-- skill:edit → skill:review + skill:publish
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, rv.id
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id AND p.key = 'skill:edit'
JOIN permissions rv ON rv.key = 'skill:review'
ON CONFLICT (role_id, permission_id) DO NOTHING;

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

-- 4. 提交技能改为权限位控制，移除管理员开关
DELETE FROM system_config WHERE key IN ('portal_skill_submit_enabled', 'panel_skill_upload_enabled');
