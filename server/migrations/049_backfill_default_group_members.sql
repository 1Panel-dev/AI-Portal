-- 049: 把存量用户补齐到默认资源组
--
-- 背景: 045 曾在建默认组时把当时已有的用户全部入组,但只在首次迁移时执行一次;
--       后续由同步链路(1Panel 用户同步 / 网关用户同步 / 后台创建用户)新建的用户
--       当时没有调用 autoJoinDefaultGroup,导致这些用户不在任何资源组 —— 按
--       permission.js 的严格白名单语义,他们登录后看不到任何模型/技能/MCP。
-- 语义: 把当前所有尚未入默认组的用户补进来;管理员若想收敛,后续可在资源组页面手动移除。
-- 幂等: 迁移只执行一次;members 主键 (group_id, user_id) 冲突即忽略。
-- 前置: 若不存在 is_default=TRUE 的组,SELECT 不产生行,本迁移为空操作。

INSERT INTO resource_group_members (group_id, user_id)
SELECT g.id, u.id
FROM resource_groups g
CROSS JOIN portal_users u
WHERE g.is_default = TRUE
ON CONFLICT DO NOTHING;
