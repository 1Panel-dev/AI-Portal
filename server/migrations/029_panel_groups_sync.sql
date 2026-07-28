-- 029: 1Panel 用户组/模型组同步缓存（只读参考）
CREATE TABLE IF NOT EXISTS panel_user_groups (
    panel_group_id INTEGER PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    qps_limit INTEGER DEFAULT 0,
    token_limit INTEGER DEFAULT 0,
    model_group_ids JSONB,
    model_group_names JSONB,
    api_key_count INTEGER DEFAULT 0,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS panel_model_groups (
    panel_group_id INTEGER PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    models JSONB,
    selection_strategy VARCHAR(50),
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
