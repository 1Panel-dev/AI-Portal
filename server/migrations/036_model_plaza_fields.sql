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
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS invocation_formats JSONB DEFAULT '["Chat Completions"]';
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Phase 2: 通用资源-标签关联表（model/skill/mcp 统一用 resource_type 区分）
CREATE TABLE IF NOT EXISTS resource_tags (
  resource_type VARCHAR(50) NOT NULL,
  resource_id   INTEGER    NOT NULL,
  tag_id        INTEGER    NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at   TIMESTAMP  DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (resource_type, resource_id, tag_id)
);
