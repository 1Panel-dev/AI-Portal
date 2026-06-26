const { Pool } = require('pg');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;
const DB_NAME = process.env.DB_NAME || 'ai_portal';
const DB_USER = process.env.DB_USER || 'aiportal';
const DB_PASSWORD = process.env.DB_PASSWORD || 'Password123@aiportal';
// 数据库 SSL 已弃用：连接需要 TLS 时请在 PG/网关侧处理（如使用 pgbouncer / 1Panel 内网）
const DB_SSL = false;

async function createDatabase() {
  const targetPool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: DB_SSL,
  });

  try {
    await targetPool.query("SET client_encoding = 'UTF8'");
    await targetPool.query('SELECT 1');
    console.log(`✅ 数据库 ${DB_NAME} 连接成功`);
    await targetPool.end();
    return true;
  } catch (err) {
    await targetPool.end();
    console.log('连接错误详情:', err.code, err.message);
    console.log('错误对象:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2).substring(0, 500));

    if (err.message.includes('does not exist') || err.message.includes('不存在')) {
      console.log(`📦 数据库 ${DB_NAME} 不存在，尝试创建...`);
    } else if (err.message.includes('password') || err.message.includes('认证') || err.message.includes('authentication')) {
      console.error('❌ 数据库连接失败: 用户名或密码错误');
      console.error('   请检查 .env 中的 DB_USER 和 DB_PASSWORD');
      return false;
    } else if (err.message.includes('connect') || err.message.includes('ECONNREFUSED')) {
      console.error(`❌ 无法连接到数据库服务器: ${DB_HOST}:${DB_PORT}`);
      console.error('   请检查:');
      console.error('   1. 数据库服务器是否运行');
      console.error('   2. .env 中的 DB_HOST 和 DB_PORT 是否正确');
      return false;
    } else {
      console.error('❌ 数据库连接失败:', err.message);
    }
  }

  const adminPool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: 'postgres',
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: DB_SSL,
  });

  try {
    await adminPool.query(`CREATE DATABASE "${DB_NAME}"`);
    console.log(`✅ 数据库 ${DB_NAME} 创建成功`);
    await adminPool.end();
    return true;
  } catch (err) {
    await adminPool.end();
    if (err.message.includes('already exists')) {
      console.log(`📦 数据库 ${DB_NAME} 已存在`);
      return true;
    }
    console.error('❌ 创建数据库失败:', err.message);
    console.error('\n提示: 请手动创建数据库');
    console.error(`  CREATE DATABASE ${DB_NAME};`);
    console.error('\n或使用已有数据库，修改 .env 中的 DB_NAME');
    return false;
  }
}

async function initSchema() {
  const migrator = require('./lib/migrator');
  await migrator.run(global.pool);
}

async function ensureDefaultAdmin() {
  try {
    // 检查是否存在 admin 用户
    const result = await global.pool.query(
      "SELECT id, username, role FROM portal_users WHERE username = $1",
      ['admin']
    );

    if (result.rowCount === 0) {
      // 仅当显式配置 INIT_ADMIN_PASSWORD 时才创建默认管理员
      // 生产环境必须显式配置，避免 admin/admin123 弱口令
      const initPwd = process.env.INIT_ADMIN_PASSWORD;
      if (!initPwd) {
        console.log('ℹ️  未发现 admin 用户，且未配置 INIT_ADMIN_PASSWORD —— 跳过创建默认管理员');
        console.log('   如需自动创建，请在环境变量中设置 INIT_ADMIN_PASSWORD=<强密码>');
        return;
      }
      if (initPwd.length < 8) {
        console.error('❌ INIT_ADMIN_PASSWORD 长度不足 8 位，拒绝创建默认管理员');
        return;
      }

      console.log('🔑 创建默认管理员账号...');

      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash(initPwd, 12);

      await global.pool.query(
        `INSERT INTO portal_users (username, name, password_hash, role, status, created_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        ['admin', '系统管理员', passwordHash, 'admin', 'active']
      );

      console.log('✅ 默认管理员账号已创建 (username: admin)');
      console.log('⚠️  请登录后立即修改管理员密码！');
    } else {
      const user = result.rows[0];
      if (user.role !== 'admin') {
        console.log('⚠️  检测到 admin 用户角色不是 admin，正在修正...');
        await global.pool.query(
          "UPDATE portal_users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2",
          ['admin', 'admin']
        );
        console.log('✅ admin 用户角色已修正');
      } else {
        console.log('✅ 管理员账号已存在 (username: admin)');
      }

      // 确保只有一个管理员
      const adminCount = await global.pool.query(
        "SELECT COUNT(*) as count FROM portal_users WHERE role = 'admin' AND username != $1",
        ['admin']
      );

      if (parseInt(adminCount.rows[0].count) > 0) {
        console.log('⚠️  发现多个管理员账号，正在清理...');
        await global.pool.query(
          "UPDATE portal_users SET role = 'user' WHERE role = 'admin' AND username != $1",
          ['admin']
        );
        console.log('✅ 已清理多余的管理员账号，仅保留 admin');
      }
    }
  } catch (err) {
    console.error('❌ 创建管理员账号失败:', err.message);
  }
}

async function initDatabase() {
  const dbReady = await createDatabase();
  if (!dbReady) return false;

  global.pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: DB_SSL,
  });

  await global.pool.query("SET client_encoding = 'UTF8'");
  await initSchema();

  // 确保默认管理员账号存在
  await ensureDefaultAdmin();

  return true;
}

module.exports = {
  initDatabase,
  createDatabase,
  initSchema,
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_SSL,
};
