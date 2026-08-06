-- 038: roles 表加 inherit_from 列,持久化角色继承来源
-- 值: 'custom'(自定义从零) | 'admin'(继承管理员) | 'user'(继承普通用户)
-- 创建角色时确定,编辑时只读展示
ALTER TABLE roles ADD COLUMN IF NOT EXISTS inherit_from VARCHAR(20) NOT NULL DEFAULT 'custom';
