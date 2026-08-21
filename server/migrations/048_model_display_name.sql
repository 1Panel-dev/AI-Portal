-- 048: 模型卡片展示名（可编辑），不同步唯一键
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) NOT NULL DEFAULT '';

-- 存量模型: display_name 为空时回填 model_name，保证卡片立刻有展示名
UPDATE portal_models SET display_name = model_name WHERE display_name = '';