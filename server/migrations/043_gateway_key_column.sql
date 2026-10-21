-- 043: portal_api_keys 网关 Key id 列（独立于 panel_key_id —— 1Panel 存量 Key 的 id 语义保留）
--   网关模式新建/重置的 Key 写 gateway_key_id; panel_key_id 置 NULL
--   存量 1Panel Key 仅保留 panel_key_id（网关模式下这些 Key 已无效, 等待全员重建）
ALTER TABLE portal_api_keys ADD COLUMN IF NOT EXISTS gateway_key_id INT;

CREATE INDEX IF NOT EXISTS idx_portal_api_keys_gateway_key_id
  ON portal_api_keys (gateway_key_id) WHERE gateway_key_id IS NOT NULL;
