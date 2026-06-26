-- 013: 模型「调用示例」配置项
-- 复用现有 system_config (key/value) 表，无需新表
-- 占位符约定:
--   {{base_url}}   被替换为 model_example_endpoint
--   {{model_name}} 被替换为模型名（前端按当前选中模型注入）
--   {{api_key}}    用户 API Key（前端默认填 sk-xxx,管理员可改模板）

INSERT INTO system_config (key, value, updated_at) VALUES
  ('model_example_endpoint', '', CURRENT_TIMESTAMP),
  ('model_example_template',
$$curl -X POST {{base_url}}/chat/completions \
  -H "Authorization: Bearer {{api_key}}" \
  -H "Content-Type: application/json" \
  -d '{"model":"{{model_name}}","messages":[{"role":"user","content":"你好"}]}'$$,
   CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
