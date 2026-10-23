-- 047: portal_users.gateway_user_id 唯一索引
-- gateway_user_id 语义上是网关用户 id,一个网关用户 id 只能对应一个门户用户。
-- 之前只有普通索引(WHERE IS NOT NULL),导致历史脏数据出现:gateway 侧 gw_id=2 从 m4test 变成 zhangsan,
-- 但门户 m4test 的旧回填未清理 + syncGatewayUsers 又给 zhangsan 新建了同一 gw_id 的行。
-- 本迁移:1. 先清理重复(保留 id 最大的那条,清空其余 gateway_* 字段)
--        2. 建 UNIQUE INDEX,让后续 ON CONFLICT 兜底 + 数据库级防止再出现
-- 注:不能用 CONCURRENTLY — 迁移框架在事务块里跑,CREATE INDEX CONCURRENTLY 会报错

-- Step 1: 清理现有重复(保留 id 最大的,清空其余 gateway_* 字段)
DO $$
DECLARE
  rec RECORD;
  clean_cnt INT := 0;
BEGIN
  FOR rec IN
    SELECT gateway_user_id, ARRAY_AGG(id ORDER BY id) AS ids
    FROM portal_users
    WHERE gateway_user_id IS NOT NULL
    GROUP BY gateway_user_id
    HAVING COUNT(*) > 1
  LOOP
    UPDATE portal_users
    SET gateway_user_id = NULL, gateway_user_group_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ANY(rec.ids) AND id <> (SELECT MAX(id) FROM unnest(rec.ids) AS id);
    clean_cnt := clean_cnt + 1;
  END LOOP;
  RAISE NOTICE '清理了 % 组重复 gateway_user_id', clean_cnt;
END $$;

-- Step 2: 建唯一索引(非 CONCURRENTLY,因迁移在事务块)
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_users_gateway_user_unique
  ON portal_users (gateway_user_id)
  WHERE gateway_user_id IS NOT NULL;
