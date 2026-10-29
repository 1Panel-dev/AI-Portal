const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');
const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: false,
  connectionTimeoutMillis: 5000,
});

(async () => {
  console.log('Connecting to', process.env.DB_HOST + ':' + process.env.DB_PORT, process.env.DB_NAME);
  try {
    await client.connect();
    console.log('OK');
    const all = await client.query('SELECT id, username, name, gateway_user_id, panel_user_id, status, created_at FROM portal_users ORDER BY id');
    console.table(all.rows);
    console.log('\n--- Gateway API keys ---');
    const keys = await client.query('SELECT id, user_id, name, gateway_key_id, panel_key_id, created_at FROM portal_api_keys ORDER BY id');
    console.table(keys.rows);
  } catch (e) { console.error('ERR:', e.stack); }
  finally { try { await client.end(); } catch {} }
})();
