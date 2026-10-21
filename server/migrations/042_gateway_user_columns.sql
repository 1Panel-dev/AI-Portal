-- 042: portal_users 网关身份列（独立于 panel_user_id —— 1Panel 用户链路保留, 两套 id 并存）
--   gateway_user_id        AI-Gateway 用户 id（归属回填/代建回填）
--   gateway_user_group_id  用户在网关所属用户组 id（授权 JOIN 第一层, 由组同步回填）
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS gateway_user_id INT;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS gateway_user_group_id INT;

CREATE INDEX IF NOT EXISTS idx_portal_users_gateway_user_id ON portal_users (gateway_user_id) WHERE gateway_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_users_gateway_group ON portal_users (gateway_user_group_id) WHERE gateway_user_group_id IS NOT NULL;
