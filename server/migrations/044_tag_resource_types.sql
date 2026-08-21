-- 044: 标签适用资源类型
CREATE TABLE IF NOT EXISTS tag_resource_types (
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL REFERENCES resource_types(key) ON DELETE CASCADE,
  PRIMARY KEY (tag_id, resource_type)
);

-- 存量预置标签先归入模型，后续可在标签管理中调整为多种资源类型。
-- 030 已 seed resource_types('model')，此处直接插入；ON CONFLICT 保证幂等。
INSERT INTO tag_resource_types (tag_id, resource_type)
SELECT t.id, 'model' FROM tags t
WHERE t.name IN ('推荐', '多模态', '文本', 'Embedding', '重排')
ON CONFLICT DO NOTHING;
