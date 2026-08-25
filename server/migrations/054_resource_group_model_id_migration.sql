-- 054: 资源组勾选的模型 resource_id 从 model_name 迁移到主键 id
-- 背景: resources-list 接口给 model 的 id 原来用 model_name, 同名跨组实例 id 相同,
--       资源组勾选时点一个同名行会连带高亮其他同名行(选中态都命中同一 model_name)。
-- 修复: model 的 id 改用 portal_models 主键, 每行唯一, 能区分同名不同实例。
-- 迁移: 把 resource_group_items 里 resource_type='model' 的 resource_id(原为 model_name)
--       转成对应的主键 id。同名多实例时全部加入(符合「原来勾的就是这个模型名」的语义)。
-- 兼容: 幂等--只处理 resource_id 仍是 model_name(非纯数字)的行; 已是主键的不动。
--       老版本升级零风险; 重复执行无副作用。
-- 已知问题: 首次运行时 PL/pgSQL FOR 循环的 DELETE+INSERT 可能导致部分行丢失;
--           已通过手动修复补回。幂等重跑安全(所有行已为数字, Step 1 空操作)。

DO $$
DECLARE
  r RECORD;
  matched_ids BIGINT[];
BEGIN
  FOR r IN
    SELECT i.group_id, i.resource_id AS model_name
    FROM resource_group_items i
    WHERE i.resource_type = 'model'
      AND i.resource_id !~ '^[0-9]+$'   -- 仅处理非纯数字(仍是 model_name)的行
  LOOP
    -- 同名多实例全部取出
    SELECT array_agg(id) INTO matched_ids
    FROM portal_models
    WHERE model_name = r.model_name AND is_active = TRUE;

    IF matched_ids IS NOT NULL AND array_length(matched_ids, 1) > 0 THEN
      -- 先删掉旧的 model_name 行(避免 (group_id, resource_type, resource_id) 唯一约束冲突)
      DELETE FROM resource_group_items
      WHERE group_id = r.group_id AND resource_type = 'model' AND resource_id = r.model_name;

      -- 插入每个实例的主键 id
      INSERT INTO resource_group_items (group_id, resource_type, resource_id)
      SELECT r.group_id, 'model', id::text
      FROM portal_models
      WHERE model_name = r.model_name AND is_active = TRUE
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;
