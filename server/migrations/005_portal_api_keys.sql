-- 005: API Key 缓存表
CREATE TABLE IF NOT EXISTS portal_api_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
    panel_key_id INTEGER UNIQUE,
    panel_user_id INTEGER,
    api_key_mask VARCHAR(255) NOT NULL DEFAULT '',
    api_key_cipher TEXT NOT NULL DEFAULT '',
    group_id INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'Enable',
    remark TEXT DEFAULT '',
    token_limit BIGINT DEFAULT 0,
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_portal_api_keys_user ON portal_api_keys(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_api_keys_panel_unique ON portal_api_keys(panel_key_id) WHERE panel_key_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_api_keys_panel_user ON portal_api_keys(panel_user_id);
