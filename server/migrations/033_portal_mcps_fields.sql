-- 033: portal_mcps 补全字段（供非管理员 MCP 广场页使用）
-- 032 初版只存了 name/type，广场页依赖 status/port/base_url/sse_path/output_transport
ALTER TABLE portal_mcps ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT '';
ALTER TABLE portal_mcps ADD COLUMN IF NOT EXISTS port INTEGER;
ALTER TABLE portal_mcps ADD COLUMN IF NOT EXISTS base_url TEXT DEFAULT '';
ALTER TABLE portal_mcps ADD COLUMN IF NOT EXISTS sse_path TEXT DEFAULT '';
ALTER TABLE portal_mcps ADD COLUMN IF NOT EXISTS output_transport VARCHAR(50) DEFAULT '';
