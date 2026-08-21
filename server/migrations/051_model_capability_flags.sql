-- 051: 模型能力扩展字段 —— 工具调用 / 图片输入（模型编辑可勾选的独立能力）
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS tool_calling BOOLEAN DEFAULT FALSE;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS image_input   BOOLEAN DEFAULT FALSE;