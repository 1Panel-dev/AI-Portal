-- 041: V2 独立网关授权缓存表（只读同步自 AI-Gateway，对齐 panel_user_groups/panel_model_groups 范式）
-- 数据源: GET /admin/user-groups + GET /admin/model-groups（gateway-sync.syncGatewayGroups）

CREATE TABLE IF NOT EXISTS gateway_user_groups (
  gateway_group_id        INT PRIMARY KEY,
  name                    TEXT NOT NULL,
  enabled                 BOOLEAN DEFAULT TRUE,
  is_default              BOOLEAN DEFAULT FALSE,
  model_group_ids         JSONB DEFAULT '[]',
  max_concurrency         INT DEFAULT 0,
  api_key_max_concurrency INT DEFAULT 0,
  token_plan_id           INT,
  synced_at               TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gateway_model_groups (
  gateway_group_id INT PRIMARY KEY,
  name             TEXT NOT NULL,
  protocol_type    TEXT,
  models           JSONB DEFAULT '[]',
  synced_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gateway_user_groups_active ON gateway_user_groups (enabled) WHERE enabled = TRUE;
