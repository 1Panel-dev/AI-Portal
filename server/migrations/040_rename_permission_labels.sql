-- 权限位显示名修正(与功能对齐):
-- group:assign 原名「资源组授权」, 与菜单 menu:admin-assignments 同名混淆 → 改名「授权成员」;
-- key:edit 实际守卫「重置 API Key」(POST /api/keys/reset), 不是编辑 → 改名「API Key 重置」。
UPDATE permissions SET name = '授权成员' WHERE key = 'group:assign';
UPDATE permissions SET name = 'API Key 重置' WHERE key = 'key:edit';
