-- 046: portal_api_keys.gateway_key_id 唯一索引
-- 支撑 gateway-sync.js 中 `ON CONFLICT (gateway_key_id) DO UPDATE` 的幂等 Key UPSERT。
-- 迁移 043_gateway_key_column.sql 只建了普通索引（WHERE gateway_key_id IS NOT NULL），
-- 缺少 UNIQUE —— 单线程 currentGwKeyIds.has() 虽然掩盖了问题，但并发 / 重试 / 定时器重入时
-- 会直接抛 PostgreSQL 错误「there is no unique constraint matching ON CONFLICT」。

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_api_keys_gateway_unique
  ON portal_api_keys (gateway_key_id)
  WHERE gateway_key_id IS NOT NULL;
