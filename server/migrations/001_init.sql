-- 001: 初始化表结构
-- 创建技能表
CREATE TABLE IF NOT EXISTS skills (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    avatar CHAR(1) DEFAULT 'S',
    avatar_color VARCHAR(20) DEFAULT 'av-teal',
    downloads BIGINT DEFAULT 0,
    stars BIGINT DEFAULT 0,
    version VARCHAR(20) DEFAULT 'v1.0.0',
    category VARCHAR(50) NOT NULL,
    tag VARCHAR(50),
    author VARCHAR(100) NOT NULL,
    install_command VARCHAR(500),
    install_url VARCHAR(500),
    file_path VARCHAR(500),
    created_at DATE DEFAULT CURRENT_DATE,
    updated_at DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT TRUE
);

-- 创建分类统计视图
CREATE OR REPLACE VIEW category_stats AS
SELECT
    category,
    COUNT(*) as skill_count,
    SUM(downloads) as total_downloads
FROM skills
WHERE is_active = TRUE
GROUP BY category;

-- 创建下载量统计表
CREATE TABLE IF NOT EXISTS download_stats (
    id SERIAL PRIMARY KEY,
    skill_id VARCHAR(100) REFERENCES skills(id) ON DELETE CASCADE,
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_agent VARCHAR(500),
    ip_hash VARCHAR(64)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_author ON skills(author);
CREATE INDEX IF NOT EXISTS idx_skills_downloads ON skills(downloads DESC);
CREATE INDEX IF NOT EXISTS idx_skills_created_at ON skills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_download_stats_skill_id ON download_stats(skill_id);

-- 搜索优化索引
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_skills_title_trgm ON skills USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_skills_description_trgm ON skills USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug);
CREATE INDEX IF NOT EXISTS idx_skills_active ON skills(is_active) WHERE is_active = TRUE;

-- 更新时间自动更新触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_DATE;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_skills_updated_at ON skills;
CREATE TRIGGER update_skills_updated_at
    BEFORE UPDATE ON skills
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 技能提交表（待审核）
CREATE TABLE IF NOT EXISTS skill_submissions (
    id SERIAL PRIMARY KEY,
    skill_id VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    avatar CHAR(1) DEFAULT 'S',
    avatar_color VARCHAR(20) DEFAULT 'av-teal',
    category VARCHAR(50) NOT NULL,
    author VARCHAR(100) NOT NULL,
    install_command VARCHAR(500),
    install_url VARCHAR(500),
    file_path VARCHAR(500),
    package_name VARCHAR(255),
    version VARCHAR(20) DEFAULT 'v1.0.0',
    status VARCHAR(20) DEFAULT 'pending',
    submitted_by VARCHAR(100),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMP,
    review_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON skill_submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON skill_submissions(submitted_at DESC);

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
