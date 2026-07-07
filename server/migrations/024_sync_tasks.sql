-- 024: 同步任务表，支持异步同步的进度追踪
CREATE TABLE IF NOT EXISTS portal_sync_tasks (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR(64) UNIQUE NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'users',
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  message TEXT,
  result JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_tasks_status ON portal_sync_tasks(status, created_at);

-- 自动更新时间戳（复用在 007 中定义的触发器函数）
DROP TRIGGER IF EXISTS update_sync_tasks_updated_at ON portal_sync_tasks;
CREATE TRIGGER update_sync_tasks_updated_at
  BEFORE UPDATE ON portal_sync_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_timestamp_column();
