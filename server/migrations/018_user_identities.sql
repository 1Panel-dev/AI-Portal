-- 018: 本地账号 ↔ 三方身份的绑定关系
CREATE TABLE IF NOT EXISTS user_identities (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
    provider     VARCHAR(50) NOT NULL,
    external_id  VARCHAR(255) NOT NULL,
    profile      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_identities_provider ON user_identities(provider);
