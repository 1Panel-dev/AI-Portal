/**
 * 数据库迁移运行器
 *
 * 自动检测并执行未运行的迁移文件。
 * 迁移文件位于 server/migrations/ 目录，按文件名排序执行。
 * 已执行的迁移记录在 schema_migrations 表中。
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) PRIMARY KEY,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getRunMigrations(pool) {
  const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  return new Set(result.rows.map(r => r.version));
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

async function run(pool) {
  await ensureMigrationsTable(pool);
  const runMigrations = await getRunMigrations(pool);
  const files = getMigrationFiles();

  let count = 0;
  for (const file of files) {
    const version = file.replace('.sql', '');
    if (runMigrations.has(version)) continue;

    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    console.log(`🔄 执行迁移: ${version}`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
        [version]
      );
      await client.query('COMMIT');
      console.log(`✅ 迁移完成: ${version}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    count++;
  }

  if (count === 0) {
    console.log('✅ 数据库已是最新');
  } else {
    console.log(`✅ 共执行 ${count} 个迁移`);
  }
}

module.exports = { run };
