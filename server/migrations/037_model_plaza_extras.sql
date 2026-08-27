-- 047: 模型广场扩展
-- 合并: 047_model_edit_permission + 048_model_display_name + 049_invocation_formats
--       + 050_backfill_invocation_formats + 051_model_capability_flags + 052_cleanup_permissions

-- 1. model:edit 权限种子
INSERT INTO permissions (module, action, key, name) VALUES
  ('model', 'edit', 'model:edit', '模型编辑')
ON CONFLICT (key) DO NOTHING;

-- 2. 模型展示名
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) NOT NULL DEFAULT '';
UPDATE portal_models SET display_name = model_name WHERE display_name = '';

-- 3. 调用方式表 + 种子数据
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

INSERT INTO invocation_formats (name, method, endpoint, sort_order) VALUES
  ('Chat Completions', 'POST', '/v1/chat/completions', 10),
  ('Responses',       'POST', '/v1/responses',         20),
  ('Anthropic Messages', 'POST', '/v1/messages',       30),
  ('Embeddings',      'POST', '/v1/embeddings',        40),
  ('Images',          'POST', '/v1/images/generations', 50),
  ('Health Check',    'GET',  '/healthz',               60),
  ('List Models',     'GET',  '/v1/models',             70)
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (module, action, key, name) VALUES
  ('invocation_format', 'view',   'invocation_format:view',   '调用方式查看'),
  ('invocation_format', 'create', 'invocation_format:create', '调用方式新增'),
  ('invocation_format', 'edit',   'invocation_format:edit',   '调用方式编辑'),
  ('invocation_format', 'delete', 'invocation_format:delete', '调用方式删除')
ON CONFLICT (key) DO NOTHING;

-- 4. 回填 invocation_formats（清理历史残渣）
DO $$
DECLARE
  m RECORD;
  el TEXT;
  match_name TEXT;
  out_arr JSONB := '[]'::jsonb;
BEGIN
  FOR m IN
    SELECT id, invocation_formats FROM portal_models
    WHERE invocation_formats IS NOT NULL AND jsonb_typeof(invocation_formats) = 'array'
  LOOP
    out_arr := '[]'::jsonb;
    FOR el IN SELECT jsonb_array_elements_text(m.invocation_formats) LOOP
      SELECT f.name INTO match_name FROM invocation_formats f
      WHERE f.name = el OR f.id::text = el OR lower(f.name) = lower(el)
      LIMIT 1;
      IF match_name IS NOT NULL AND NOT (out_arr @> to_jsonb(match_name)) THEN
        out_arr := out_arr || to_jsonb(match_name);
      END IF;
    END LOOP;
    IF jsonb_array_length(out_arr) > 0 AND out_arr <> m.invocation_formats THEN
      UPDATE portal_models SET invocation_formats = out_arr WHERE id = m.id;
    ELSIF jsonb_array_length(out_arr) = 0 AND m.invocation_formats IS NOT NULL THEN
      UPDATE portal_models SET invocation_formats = NULL WHERE id = m.id;
    END IF;
  END LOOP;
END $$;

-- 5. 模型能力字段
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS tool_calling BOOLEAN DEFAULT FALSE;
ALTER TABLE portal_models ADD COLUMN IF NOT EXISTS image_input   BOOLEAN DEFAULT FALSE;

-- 6. 清理失效权限位
DELETE FROM role_permissions rp USING permissions p
WHERE rp.permission_id = p.id
  AND p.key IN ('menu:admin-invocation-formats', 'mcp:sync');
DELETE FROM permissions WHERE key IN ('menu:admin-invocation-formats', 'mcp:sync');
