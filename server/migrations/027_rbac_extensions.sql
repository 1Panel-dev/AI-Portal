-- 027: RBAC 扩展字段
-- 合并: 027_portal_users_is_admin + 035_roles_name_unique + 038_roles_inherit_from

-- portal_users 加 is_portal_admin 列（Portal 超管标记，跳过权限检查）
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS is_portal_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- roles.name 加 UNIQUE 约束（防角色名重复，配合应用层校验）
-- 幂等处理：先检查约束是否存在再添加
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roles_name_unique') THEN
    ALTER TABLE roles ADD CONSTRAINT roles_name_unique UNIQUE (name);
  END IF;
END $$;

-- roles 表加 inherit_from 列,持久化角色继承来源
-- 值: 'custom'(自定义从零) | 'admin'(继承管理员) | 'user'(继承普通用户)
ALTER TABLE roles ADD COLUMN IF NOT EXISTS inherit_from VARCHAR(20) NOT NULL DEFAULT 'custom';
