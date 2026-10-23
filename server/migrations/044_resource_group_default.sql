-- 044: 资源组默认组标记
-- 设计:
--   - 一张表只允许一个默认组(is_default = TRUE),由唯一部分索引保证
--   - 默认组语义: 新用户注册时自动加入;创建时自动把当前活跃模型写入 items;新模型上架时自动追加
--   - 管理员可编辑默认组的 items(收敛授权);如需换组,把新组设为默认即可(原子切换)

ALTER TABLE resource_groups ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- 唯一部分索引: 全表最多一行 is_default = TRUE
CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_groups_default
  ON resource_groups (is_default) WHERE is_default = TRUE;

COMMENT ON COLUMN resource_groups.is_default IS '默认资源组:新用户注册时自动加入;创建/模型上架时自动同步活跃模型';
