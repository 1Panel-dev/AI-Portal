-- 031: 存量数据迁移
-- 1. 存量 admin 升级为 Portal 超管
UPDATE portal_users SET is_portal_admin = TRUE WHERE role = 'admin';

-- 2. 存量普通用户分配 user 内置角色（防漏：COALESCE 覆盖 NULL/异常值）
INSERT INTO user_roles (user_id, role_id)
SELECT p.id, r.id FROM portal_users p, roles r
WHERE COALESCE(p.role, 'user') <> 'admin' AND p.status = 'active' AND r.name = 'user' AND r.is_system = TRUE
ON CONFLICT (user_id, role_id) DO NOTHING;
