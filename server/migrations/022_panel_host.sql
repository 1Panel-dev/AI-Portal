-- 022: portal_users 加 panel_host 列，追踪用户来源 1Panel 实例
-- 切实例时靠此字段区分新旧用户，配合同步逻辑做禁用/新增

ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS panel_host VARCHAR(500);

-- 存量已有 panel_user_id 的用户：取当前配置的 panel_base_url 回填
-- 注意：这里只做 schema 变更，回填逻辑在同步接口首次运行时兜底（见 admin.js）
-- 迁移里不写 UPDATE，因为迁移层无法安全地拿到运行时配置
