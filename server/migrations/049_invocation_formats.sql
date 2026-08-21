-- 049: 调用方式统一管理
CREATE TABLE IF NOT EXISTS invocation_formats (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  method VARCHAR(10) NOT NULL DEFAULT 'POST',
  endpoint VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 预置 7 种调用方式
INSERT INTO invocation_formats (name, method, endpoint, sort_order) VALUES
  ('Chat Completions', 'POST', '/v1/chat/completions', 10),
  ('Responses',       'POST', '/v1/responses',         20),
  ('Anthropic Messages', 'POST', '/v1/messages',       30),
  ('Embeddings',      'POST', '/v1/embeddings',        40),
  ('Images',          'POST', '/v1/images/generations', 50),
  ('Health Check',    'GET',  '/healthz',               60),
  ('List Models',     'GET',  '/v1/models',             70)
ON CONFLICT (name) DO NOTHING;

-- 权限种子
INSERT INTO permissions (module, action, key, name) VALUES
  ('invocation_format', 'view',   'invocation_format:view',   '调用方式查看'),
  ('invocation_format', 'create', 'invocation_format:create', '调用方式新增'),
  ('invocation_format', 'edit',   'invocation_format:edit',   '调用方式编辑'),
  ('invocation_format', 'delete', 'invocation_format:delete', '调用方式删除')
ON CONFLICT (key) DO NOTHING;

-- 权限种子（不种菜单权限了 —— 嵌入模型管理页，由 invocation_format:* 控制按钮权限）
INSERT INTO permissions (module, action, key, name) VALUES
  ('invocation_format', 'view',   'invocation_format:view',   '调用方式查看'),
  ('invocation_format', 'create', 'invocation_format:create', '调用方式新增'),
  ('invocation_format', 'edit',   'invocation_format:edit',   '调用方式编辑'),
  ('invocation_format', 'delete', 'invocation_format:delete', '调用方式删除')
ON CONFLICT (key) DO NOTHING;
