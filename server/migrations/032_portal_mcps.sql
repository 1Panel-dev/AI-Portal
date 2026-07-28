-- 032: MCP 本地缓存表（同步自 1Panel /api/v2/ai/mcp/search）
CREATE TABLE IF NOT EXISTS portal_mcps (
    id SERIAL PRIMARY KEY,
    panel_mcp_id VARCHAR(255) NOT NULL,
    name VARCHAR(500) NOT NULL DEFAULT '',
    type VARCHAR(100) DEFAULT '',
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(panel_mcp_id)
);
CREATE INDEX IF NOT EXISTS idx_portal_mcps_active ON portal_mcps(is_active);
