-- 002: 技能版本历史表
CREATE TABLE IF NOT EXISTS skill_versions (
    id SERIAL PRIMARY KEY,
    skill_id VARCHAR(100) NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    version VARCHAR(20) NOT NULL,
    file_path VARCHAR(500),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(skill_id, version)
);
CREATE INDEX IF NOT EXISTS idx_skill_versions_skill_id ON skill_versions(skill_id, created_at DESC);
