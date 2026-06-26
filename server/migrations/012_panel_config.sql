-- 012: 1Panel 网关配置(供管理后台 UI 配置和热重载)
-- 全部存到现有 system_config 表(key/value 模式),无需新表

INSERT INTO system_config (key, value, updated_at) VALUES
  ('panel_base_url', '', CURRENT_TIMESTAMP),
  ('panel_api_key', '', CURRENT_TIMESTAMP),
  ('panel_api_timeout', '10000', CURRENT_TIMESTAMP),
  ('panel_sync_enabled', 'true', CURRENT_TIMESTAMP),
  ('panel_sync_interval_minutes', '10', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
