-- 043: V2 独立网关配置种子
-- gateway_provider 默认 '1panel'：升级后行为与 V1 完全一致，切换是运营动作
INSERT INTO system_config (key, value, updated_at) VALUES
  ('gateway_provider', '1panel', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
