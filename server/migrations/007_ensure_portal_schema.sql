-- 007: 确保门户表结构完整
-- 如果开发库曾经删除过门户表，但 schema_migrations 已记录 003-006，
-- 这个迁移会重新创建并补齐数据库结构。

CREATE TABLE IF NOT EXISTS portal_users (
    id SERIAL PRIMARY KEY,
    panel_user_id INTEGER UNIQUE,
    username VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL DEFAULT '',
    password_hash VARCHAR(255) NOT NULL DEFAULT '',
    session_timeout INTEGER DEFAULT 86400,
    status VARCHAR(20) DEFAULT 'active',
    role VARCHAR(20) DEFAULT 'user',
    last_login_at TIMESTAMP,
    synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS panel_user_id INTEGER;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS session_timeout INTEGER DEFAULT 86400;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_users_username_unique ON portal_users(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_users_panel_id_unique ON portal_users(panel_user_id) WHERE panel_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_users_status ON portal_users(status);

CREATE TABLE IF NOT EXISTS portal_models (
    id SERIAL PRIMARY KEY,
    panel_backend_id INTEGER,
    group_name VARCHAR(100) NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    provider VARCHAR(100) NOT NULL DEFAULT '',
    base_url VARCHAR(500) NOT NULL DEFAULT '',
    model_type VARCHAR(50) NOT NULL DEFAULT '',
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_name, model_name)
);

ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS panel_backend_id INTEGER;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS provider VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS base_url VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS model_type VARCHAR(50) NOT NULL DEFAULT '';
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE portal_models DROP CONSTRAINT IF EXISTS portal_models_model_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_models_group_model_unique ON portal_models(group_name, model_name);
CREATE INDEX IF NOT EXISTS idx_portal_models_group ON portal_models(group_name);
CREATE INDEX IF NOT EXISTS idx_portal_models_name ON portal_models(model_name);
CREATE INDEX IF NOT EXISTS idx_portal_models_active ON portal_models(is_active) WHERE is_active = TRUE;

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

ALTER TABLE portal_api_keys ADD COLUMN IF NOT EXISTS panel_key_id INTEGER;
ALTER TABLE portal_api_keys ADD COLUMN IF NOT EXISTS panel_user_id INTEGER;
ALTER TABLE portal_api_keys ADD COLUMN IF NOT EXISTS api_key_mask VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE portal_api_keys ADD COLUMN IF NOT EXISTS api_key_cipher TEXT NOT NULL DEFAULT '';
ALTER TABLE portal_api_keys ADD COLUMN IF NOT EXISTS group_id INTEGER DEFAULT 1;
ALTER TABLE portal_api_keys ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Enable';
ALTER TABLE portal_api_keys ADD COLUMN IF NOT EXISTS remark TEXT DEFAULT '';
ALTER TABLE portal_api_keys ADD COLUMN IF NOT EXISTS token_limit BIGINT DEFAULT 0;
ALTER TABLE portal_api_keys ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE portal_api_keys ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP;
ALTER TABLE portal_api_keys ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_api_keys_panel_unique ON portal_api_keys(panel_key_id) WHERE panel_key_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_api_keys_user ON portal_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_portal_api_keys_panel_user ON portal_api_keys(panel_user_id);

CREATE TABLE IF NOT EXISTS portal_sync_log (
    id SERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT '1panel',
    message TEXT,
    total_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE portal_sync_log ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT '1panel';
ALTER TABLE portal_sync_log ADD COLUMN IF NOT EXISTS total_count INTEGER DEFAULT 0;
ALTER TABLE portal_sync_log ADD COLUMN IF NOT EXISTS success_count INTEGER DEFAULT 0;
ALTER TABLE portal_sync_log ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0;
ALTER TABLE portal_sync_log ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_sync_log_type ON portal_sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_log_created ON portal_sync_log(created_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_portal_users_updated_at ON portal_users;
CREATE TRIGGER update_portal_users_updated_at
    BEFORE UPDATE ON portal_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_timestamp_column();

DROP TRIGGER IF EXISTS update_portal_models_updated_at ON portal_models;
CREATE TRIGGER update_portal_models_updated_at
    BEFORE UPDATE ON portal_models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_timestamp_column();

DROP TRIGGER IF EXISTS update_portal_api_keys_updated_at ON portal_api_keys;
CREATE TRIGGER update_portal_api_keys_updated_at
    BEFORE UPDATE ON portal_api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_timestamp_column();
