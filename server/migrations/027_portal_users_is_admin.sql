-- 027: portal_users 加 is_portal_admin 列（Portal 超管标记，跳过权限检查）
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS is_portal_admin BOOLEAN NOT NULL DEFAULT FALSE;
