-- 016: portal_users 增加 auto_created_from 字段,标记由哪个 OAuth provider 自动创建
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS auto_created_from VARCHAR(50);

COMMENT ON COLUMN portal_users.auto_created_from IS '由哪个 OAuth provider 自动创建,NULL=非自动创建或注册创建';
