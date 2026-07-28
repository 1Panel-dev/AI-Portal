-- 028: 资源组 - 资源类型注册表 + 资源组 + 成员 + 资源项
CREATE TABLE IF NOT EXISTS resource_types (
    key VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    intersect_panel BOOLEAN NOT NULL DEFAULT FALSE,
    config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resource_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resource_group_members (
    group_id INTEGER NOT NULL REFERENCES resource_groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS resource_group_items (
    group_id INTEGER NOT NULL REFERENCES resource_groups(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL REFERENCES resource_types(key) ON DELETE CASCADE,
    resource_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, resource_type, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_rgi_type_id ON resource_group_items(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_rgm_user_id ON resource_group_members(user_id);
