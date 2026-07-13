-- 025: 下载统计表加 user_id
ALTER TABLE download_stats ADD COLUMN IF NOT EXISTS user_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_download_stats_user_id ON download_stats(user_id);
