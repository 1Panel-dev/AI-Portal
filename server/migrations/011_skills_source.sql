-- 011: skills 表加 source / panel_skill_id / risk_level / panel_status
-- 目的: 支持从 1Panel skills-hub 同步聚合, 与本地技能并存展示

ALTER TABLE skills ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'local';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS panel_skill_id INTEGER;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20);
ALTER TABLE skills ADD COLUMN IF NOT EXISTS panel_status VARCHAR(20);
ALTER TABLE skills ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP;

-- panel_skill_id 唯一索引(允许 NULL,即本地技能可以多条 NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_panel_unique
  ON skills(panel_skill_id) WHERE panel_skill_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);
