-- 004: 模型列表缓存表
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

CREATE INDEX IF NOT EXISTS idx_portal_models_group ON portal_models(group_name);
CREATE INDEX IF NOT EXISTS idx_portal_models_name ON portal_models(model_name);
CREATE INDEX IF NOT EXISTS idx_portal_models_active ON portal_models(is_active) WHERE is_active = TRUE;
