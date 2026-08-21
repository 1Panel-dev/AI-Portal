-- 050: 回填 portal_models.invocation_formats 为当前调用方式的规范名称
--
-- 背景:历史数据里 portal_models.invocation_formats 混入了多种残渣——
--   * 占位符 "tool"(046 默认值)、无效名 "healthz"
--   * 旧版小写短名 "chat" / "images" / "embeddings"
--   * 改名前的旧全名 "Chat Completions" / "Anthropic Messages"(表中已重命名为 "Chat" / "Anthropic")
-- 前端按「精确名称匹配」无法命中, 导致模型明明勾了很多调用方式, 广场却只兜底展示第一个。
--
-- 策略:每个数组元素能比对到 invocation_formats(name=值 / id::text=值 / lower(name)=lower(值))
-- 则保留其规范 name, 否则丢弃("tool"/"healthz" 等); 结果已被现有格式引用的才写回; 全部落空置 NULL。
-- 改名前的旧全名与简称无法可靠单向映射,故丢弃,管理员可在编辑弹窗重新勾选。

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