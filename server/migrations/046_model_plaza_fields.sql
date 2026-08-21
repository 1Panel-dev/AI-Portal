-- 046: 模型扩展字段 + 模型-标签关联表
-- Phase 1: portal_models 加字段（IF NOT EXISTS 安全增量）

ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS api_model_name VARCHAR(200);
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS context_window INTEGER;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS max_output_tokens INTEGER;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS cache_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS multimodal BOOLEAN DEFAULT FALSE;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS invocation_formats JSONB DEFAULT '["tool"]';
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Phase 2: 模型-标签关联表
CREATE TABLE IF NOT EXISTS model_tags (
  model_id INTEGER NOT NULL REFERENCES portal_models(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (model_id, tag_id)
);
