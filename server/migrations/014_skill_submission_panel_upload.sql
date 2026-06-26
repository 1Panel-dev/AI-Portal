-- 014: track optional 1Panel upload metadata for user skill submissions
ALTER TABLE skill_submissions ADD COLUMN IF NOT EXISTS panel_skill_id INTEGER;
ALTER TABLE skill_submissions ADD COLUMN IF NOT EXISTS panel_status VARCHAR(50);
ALTER TABLE skill_submissions ADD COLUMN IF NOT EXISTS panel_raw_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE skill_submissions ADD COLUMN IF NOT EXISTS panel_uploaded_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_skill_submissions_panel_skill_id
  ON skill_submissions(panel_skill_id) WHERE panel_skill_id IS NOT NULL;
