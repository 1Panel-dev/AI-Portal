-- 006: 同步日志表
CREATE TABLE IF NOT EXISTS portal_sync_log (
    id SERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT '1panel',
    message TEXT,
    total_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_log_type ON portal_sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_log_created ON portal_sync_log(created_at DESC);
