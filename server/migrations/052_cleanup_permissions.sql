-- 052: 清理失效权限位（向前兼容：只删确认无人使用的权限，连旧授权一起清）
--
-- 1) menu:admin-invocation-formats —— 调用方式管理已内嵌进「模型管理」页，独立菜单权限在开发期曾被 seed 进存量库，
--    此迁移把它连旧角色授权一起删掉。
-- 2) mcp:sync —— 旧版按资源同步的孤儿权限：无后端路由引用、无前端按钮引用，仅会因「继承」产生无法在 UI 移除的隐形权限。
--
-- 注意：「model:sync」仍被 POST /api/models/sync 路由 requirePermission 守卫，属于在用权限，不删。
-- 「invocation_format:*」四个操作权限仍被 /api/admin/invocation-formats 路由校验，也不删。

DELETE FROM role_permissions rp USING permissions p
WHERE rp.permission_id = p.id
  AND p.key IN ('menu:admin-invocation-formats', 'mcp:sync');

DELETE FROM permissions WHERE key IN ('menu:admin-invocation-formats', 'mcp:sync');