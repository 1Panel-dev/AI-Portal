-- 034: 1Panel 用户组/模型组缓存表加 is_active，支持软删（修对抗报告 I4）
ALTER TABLE panel_user_groups ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE panel_model_groups ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
