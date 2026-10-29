// One-off diagnostic: check LuoYePiaoLing user
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || '192.168.11.231',
  port: Number(process.env.DB_PORT || 15432),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Password123@postgres',
  database: process.env.DB_NAME || 'ai_portal_test',
  ssl: false,
});

(async () => {
  try {
    const u = await pool.query(
      "SELECT id, username, name, panel_user_id, gateway_user_id, status, is_portal_admin, created_at FROM portal_users WHERE username ILIKE '%luoye%' OR username ILIKE '%piao%' OR name ILIKE '%落叶%' OR name ILIKE '%飘零%'"
    );
    console.log('=== Users matching luoye/piao/落叶/飘零 ===');
    console.table(u.rows);

    if (!u.rows.length) { console.log('NOT FOUND'); process.exit(0); }

    const user = u.rows[0];
    console.log('\n=== API Keys ===');
    const keys = await pool.query(
      "SELECT id, name, gateway_key_id, panel_key_id, LENGTH(COALESCE(api_key_cipher,'')) AS keylen, created_at FROM portal_api_keys WHERE user_id = $1 ORDER BY id",
      [user.id]
    );
    console.table(keys.rows);

    if (user.gateway_user_id) {
      console.log('\n=== 同 gateway_user_id 的其他门户用户 ===');
      const sameGwd = await pool.query(
        "SELECT id, username, name, status, gateway_user_id, created_at FROM portal_users WHERE gateway_user_id = $1 AND id != $2",
        [user.gateway_user_id, user.id]
      );
      console.table(sameGwd.rows);
    }

    if (user.panel_user_id) {
      console.log('\n=== 同 panel_user_id 的其他门户用户 ===');
      const samePanel = await pool.query(
        "SELECT id, username, name, panel_user_id, gateway_user_id, status, created_at FROM portal_users WHERE panel_user_id = $1 AND id != $2",
        [user.panel_user_id, user.id]
      );
      console.table(samePanel.rows);
    }
  } catch (e) { console.error('DB error:', e.message); }
  finally { await pool.end(); }
})();
