-- 003: 门户用户表
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_users_username_unique ON portal_users(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_users_panel_id_unique ON portal_users(panel_user_id) WHERE panel_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_users_status ON portal_users(status);
