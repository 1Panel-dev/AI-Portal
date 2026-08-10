-- 039: 新增资源组授权权限位
-- 资源组管理(group:edit)负责配置组内资源; 资源组授权(group:assign)负责管理授权给谁(组成员)。
-- 两者解耦, 避免「资源组管理」和「资源组授权」共用 group:edit。

INSERT INTO permissions (module, action, key, name)
VALUES ('group', 'assign', 'group:assign', '资源组授权')
ON CONFLICT (key) DO NOTHING;
