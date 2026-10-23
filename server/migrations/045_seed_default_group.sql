-- 045: 种子默认资源组(开箱即全量可见,管理员可编辑收敛)
--
-- 背景: 资源组是严格白名单(permission.js getVisibleResourcesForUser: 不在任何资源组 -> 各类型空数组),
--       无默认组时新用户/存量用户什么都看不到,管理员必须手动建组+授权。
-- 语义: 默认组创建即包含全部活跃资源(model=主键id / skill=slug / mcp=主键id),
--       并把存量用户全部入组; 新用户由注册链路 autoJoinDefaultGroup 自动加入。
-- 收敛: auto_sync_items 开关(默认开)控制资源同步后是否自动追加新资源;
--       管理员想手工收敛默认组时先关开关,否则编辑结果会被下一次同步放大回去。
-- 幂等: 仅当不存在 is_default=TRUE 的组时才创建; items/members 均 ON CONFLICT DO NOTHING。

-- 自动追加开关(与 044 的 is_default 同族;044 已执行故放本迁移)
ALTER TABLE resource_groups ADD COLUMN IF NOT EXISTS auto_sync_items BOOLEAN NOT NULL DEFAULT TRUE;

-- 创建默认组(仅当不存在 is_default=TRUE 的组;后续语句按 is_default=TRUE 命中,无论本次创建或既有)
INSERT INTO resource_groups (name, description, is_default)
SELECT '默认资源组', '开箱默认组:全部用户可访问全部活跃资源;可在此编辑收敛授权范围', TRUE
WHERE NOT EXISTS (SELECT 1 FROM resource_groups WHERE is_default = TRUE);

-- 填充 items(三类型全量;组可能来自本次种子或既有默认组)
INSERT INTO resource_group_items (group_id, resource_type, resource_id)
SELECT g.id, 'model', m.id::text
FROM resource_groups g
JOIN portal_models m ON m.is_active = TRUE
WHERE g.is_default = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO resource_group_items (group_id, resource_type, resource_id)
SELECT g.id, 'skill', s.slug
FROM resource_groups g
JOIN skills s ON s.is_active = TRUE
WHERE g.is_default = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO resource_group_items (group_id, resource_type, resource_id)
SELECT g.id, 'mcp', c.id::text
FROM resource_groups g
JOIN portal_mcps c ON c.is_active = TRUE
WHERE g.is_default = TRUE
ON CONFLICT DO NOTHING;

-- 存量用户全部加入默认组
INSERT INTO resource_group_members (group_id, user_id)
SELECT g.id, u.id
FROM resource_groups g
CROSS JOIN portal_users u
WHERE g.is_default = TRUE
ON CONFLICT DO NOTHING;
