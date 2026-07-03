-- 021: skillctl 登录 token 缓存
-- users/api/update 每调一次轮换 token,所以生成后落库,读取只查库不调 1Panel。
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS skillctl_token TEXT DEFAULT '';
