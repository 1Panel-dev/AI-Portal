-- 019: 预绑定白名单(首发不启用逻辑,仅占位 schema)
CREATE TABLE IF NOT EXISTS oauth_provider_allowlist (
    id           SERIAL PRIMARY KEY,
    provider     VARCHAR(50) NOT NULL,
    external_id  VARCHAR(255) NOT NULL,
    user_id      INTEGER NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, external_id)
);
