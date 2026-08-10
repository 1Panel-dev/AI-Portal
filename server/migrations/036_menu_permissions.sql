-- 036: 菜单权限种子（后端控制+用户侧）
-- 模块=menu, 页面一级, 分后台菜单和用户侧菜单
-- 与 030 的操作权限(module≠menu)独立

INSERT INTO permissions (module, action, key, name) VALUES
('menu', 'admin-stats', 'menu:admin-stats', '数据统计'),
('menu', 'admin-review', 'menu:admin-review', '审核管理'),
('menu', 'admin-models', 'menu:admin-models', '模型管理'),
('menu', 'admin-skills', 'menu:admin-skills', '技能管理'),
('menu', 'admin-mcps', 'menu:admin-mcps', 'MCP 管理'),
('menu', 'admin-groups', 'menu:admin-groups', '资源组管理'),
('menu', 'admin-assignments', 'menu:admin-assignments', '资源组授权'),
('menu', 'admin-users', 'menu:admin-users', '用户管理'),
('menu', 'admin-roles', 'menu:admin-roles', '角色权限'),
('menu', 'admin-config', 'menu:admin-config', '基础配置'),
('menu', 'admin-oauth', 'menu:admin-oauth', '第三方登录'),
('menu', 'admin-panel', 'menu:admin-panel', 'AI 网关同步'),
('menu', 'models', 'menu:models', '模型广场'),
('menu', 'skills', 'menu:skills', 'Skill 广场'),
('menu', 'mcp', 'menu:mcp', 'MCP 广场'),
('menu', 'docs', 'menu:docs', '在线文档'),
('menu', 'profile', 'menu:profile', '个人中心'),
('menu', 'my-skills', 'menu:my-skills', '我的技能'),
('menu', 'submit', 'menu:submit', '提交技能')
ON CONFLICT (key) DO NOTHING;

-- 给 user 内置角色配用户侧菜单权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'user' AND r.is_system = TRUE
  AND p.module = 'menu' AND p.key IN (
    'menu:models', 'menu:skills', 'menu:mcp', 'menu:docs',
    'menu:profile', 'menu:my-skills', 'menu:submit'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;