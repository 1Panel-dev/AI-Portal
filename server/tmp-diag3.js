require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, ssl: false,
});

(async () => {
  try {
    await pool.query('SELECT 1'); // 连通性测试
    const all = await pool.query(
      "SELECT id, username, name, panel_user_id, gateway_user_id, status, created_at FROM portal_users ORDER BY id"
    );
    console.log('=== All portal_users (' + all.rowCount + ') ===');
    console.table(all.rows);
  } catch (e) { console.error('DB error name=' + e.name + ' msg=' + e.message + ' code=' + e.code); }
  finally { await pool.end(); }
})();
