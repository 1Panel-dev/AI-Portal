require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, ssl: false,
});

(async () => {
  try {
    // 所有门户用户
    const all = await pool.query(
      "SELECT id, username, name, panel_user_id, gateway_user_id, status, created_at FROM portal_users ORDER BY id"
    );
    console.log('=== All portal_users ===');
    console.table(all.rows);

    // 再模糊搜 name 包含常见关键字（飘零、落叶、Luo、Piao、ling、Ling）
    const kw = await pool.query(
      "SELECT id, username, name, panel_user_id, gateway_user_id FROM portal_users WHERE LOWER(coalesce(username,'') || ' ' || coalesce(name,'')) ~ '(luoye|piao|ling|飘零|落叶)'"
    );
    console.log('\n=== Keyword matches ===');
    console.table(kw.rows);
  } catch (e) { console.error('DB error:', e.message); }
  finally { await pool.end(); }
})();
