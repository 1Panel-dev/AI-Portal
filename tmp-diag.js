// One-off diagnostic: check LuoYePiaoLing user
const { Pool } = require('pg');
const pool = new Pool({
  host: '192.168.11.231', port: 15432, user: 'root',
  password: 'Password123@postgres', database: 'ai_portal_test',
  ssl: false,
});

(async () => {
  try {
    // 1. 找用户
    const u = await pool.query(
      "SELECT id, username, name, panel_user_id, gateway_user_id, status, is_portal_admin, created_at FROM portal_users WHERE username ILIKE '%luoye%' OR username ILIKE '%piao%' OR name ILIKE '%落叶%' OR name ILIKE '%飘零%'"
    );
    console.log('=== Users matching "luoye/落叶/飘零" ===');
    console.table(u.rows);

    if (!u.rows.length) { console.log('NOT FOUND'); process.exit(0); }

    const user = u.rows[0];
    console.log('\n=== API Keys of this user ===');
    const keys = await pool.query(
      "SELECT id, name, gateway_key_id, panel_key_id, LENGTH(COALESCE(api_key_cipher,'')) AS keylen, created_at FROM portal_api_keys WHERE user_id = $1 ORDER BY id",
      [user.id]
    );
    console.table(keys.rows);

    // 2. 查最近哪些活跃用户的 gateway_user_id 是同一个（可能合并了？）
    if (user.gateway_user_id) {
      console.log('\n=== 同 gateway_user_id 的其他门户用户 ===');
      const sameGwd = await pool.query(
        "SELECT id, username, name, status, gateway_user_id, created_at FROM portal_users WHERE gateway_user_id = $1 AND id != $2",
        [user.gateway_user_id, user.id]
      );
      console.table(sameGwd.rows);
    }

    // 3. 看用户群/模型组
    if (user.gateway_user_id) {
      console.log('\n=== 网关用户组 ===');
      const groups = await pool.query(
        "SELECT * FROM gateway_user_groups WHERE gateway_group_id = (SELECT gateway_user_group_id FROM portal_users WHERE id = $1)",
        [user.id]
      );
      console.table(groups.rows);
    }
  } catch (e) { console.error('DB error:', e.message); }
  finally { await pool.end(); }
})();
