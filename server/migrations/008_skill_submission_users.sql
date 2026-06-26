-- 008: Bind skill submissions to portal users.
ALTER TABLE skill_submissions ADD COLUMN IF NOT EXISTS submitted_by_user_id INTEGER REFERENCES portal_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_submitted_by_user_id ON skill_submissions(submitted_by_user_id);
