-- 055: 通用资源-标签关联表，替代冗余的 model_tags
-- 对测试库：model_tags 已存在且有数据，本脚本建 resource_tags + 迁数据
-- 对 release-1.0.4 升级：model_tags 不存在，resource_tags 由 046 直接建好，本脚本幂等

-- 建表
CREATE TABLE IF NOT EXISTS resource_tags (
  resource_type VARCHAR(50) NOT NULL,
  resource_id   INTEGER    NOT NULL,
  tag_id        INTEGER    NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at   TIMESTAMP  DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (resource_type, resource_id, tag_id)
);

-- 迁存量：如果 model_tags 表存在且有数据，复制到 resource_tags
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'model_tags' AND table_schema = 'public') THEN
    INSERT INTO resource_tags (resource_type, resource_id, tag_id)
    SELECT 'model', model_id, tag_id FROM model_tags
    ON CONFLICT DO NOTHING;

    -- 清理旧表（model_tags 已被 resource_tags 替代）
    DROP TABLE IF EXISTS model_tags;
  END IF;
END $$;
