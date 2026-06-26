-- 017: OAuth provider 配置表
CREATE TABLE IF NOT EXISTS oauth_providers (
    provider     VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    config       JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO oauth_providers (provider, display_name, enabled, config, sort_order)
VALUES ('wecom', '企业微信', FALSE, '{}'::jsonb, 10)
ON CONFLICT (provider) DO NOTHING;
