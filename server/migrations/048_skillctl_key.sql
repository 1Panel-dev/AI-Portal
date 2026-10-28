-- 048: skillctl Key 管理列
-- 1Panel 已废弃 enterprise/users/api/update，改为 auth 域的独立 API Key 管理:
--   POST /api/v2/core/auth/api/keys/create   新建(id + revision + apiKey)
--   POST /api/v2/core/auth/api/keys/status   启用/停用(id + revision + status)
--   POST /api/v2/core/auth/api/keys/revoke   撤销(id + revision)
-- create 是「新建」而非「轮换」，要停用/撤销必须持有 1Panel 返回的 id 与其 revision，
-- 因此除 token 本身外还需持久化 key_id / revision / status。

ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS skillctl_key_id TEXT;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS skillctl_key_revision INT DEFAULT 0;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS skillctl_key_status VARCHAR(20);

COMMENT ON COLUMN portal_users.skillctl_key_id IS '1Panel auth/api/keys 返回的 Key id(UUID),用于停用/撤销';
COMMENT ON COLUMN portal_users.skillctl_key_revision IS '1Panel Key 乐观锁版本号,每次 status/revoke 递增';
COMMENT ON COLUMN portal_users.skillctl_key_status IS '1Panel Key 状态: Enable / Disable';
