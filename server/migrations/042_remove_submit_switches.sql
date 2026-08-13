-- 042: 提交技能改为权限位(skill:create)控制 + 提交流程固定「本地写 + 同步 1Panel 事务」,
-- 移除管理员开关 portal_skill_submit_enabled / panel_skill_upload_enabled。清理对应死配置键。
DELETE FROM system_config WHERE key IN ('portal_skill_submit_enabled', 'panel_skill_upload_enabled');
