-- 035: roles.name 加 UNIQUE 约束（防角色名重复，配合应用层校验）
ALTER TABLE roles ADD CONSTRAINT roles_name_unique UNIQUE (name);
