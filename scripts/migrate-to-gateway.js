// scripts/migrate-to-gateway.js
// V2 存量迁移: 把门户存量活跃用户批量代建到独立网关并回填归属（幂等, 可重跑）
//
// 用法:
//   node scripts/migrate-to-gateway.js --dry-run   # 只预演不写入
//   node scripts/migrate-to-gateway.js             # 实际执行
//
// 前置条件:
//   1. 后台「独立网关」配置已保存且 provider=ai-gateway（连接测试通过）
//   2. 网关侧已建好默认用户组（gateway_default_user_group_id 已配置）
// 行为:
//   - 对每个 status='active' 的门户用户:
//       网关有同名用户 → 回填 gateway_user_id/gateway_user_group_id（归属同步语义）
//         ⚠ 若该网关用户 role=admin（网关管理员撞名）→ 回填但告警:
//            网关管理代操作仅允许 role=user, 该用户无法由门户代发 Key（M4 已确认的网关约束）
//       网关无同名用户 → 代建（role=user, 入默认组）→ 回填
//   - 禁用/已删除用户不迁移
//   - 已有 gateway_user_id 且网关侧仍存在 → 跳过（幂等）

'use strict';

// scripts/ 下无独立 node_modules, 显式指向 server/node_modules
const SERVER_NM = p => require('path').join(__dirname, '..', 'server', 'node_modules', p);
require(SERVER_NM('dotenv')).config({ path: require('path').join(__dirname, '..', '.env') });
global.pool = new (require(SERVER_NM('pg')).Pool)({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const { getGateway } = require('../server/lib/gateway');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`=== V2 存量用户迁移 → 独立网关${DRY_RUN ? '（DRY-RUN 预演）' : ''} ===`);
  if (DRY_RUN) console.log('(dry-run 模式: 只读不写)\n');

  const gw = await getGateway(global.pool);

  // 1. 读全量网关用户（username → {userId, groupId, role}），供匹配与幂等判断
  const gwUsers = await gw.listUsers();
  const byName = new Map();
  for (const u of gwUsers) {
    byName.set(String(u.username).toLowerCase(), u);
  }
  console.log(`网关侧现有用户: ${gwUsers.length}\n`);

  // 2. 读门户活跃用户
  const { rows: portalUsers } = await global.pool.query(`
    SELECT id, username, name, gateway_user_id, status
    FROM portal_users
    WHERE status = 'active'
    ORDER BY id
  `);
  console.log(`门户活跃用户: ${portalUsers.length}\n`);

  let created = 0, backfilled = 0, skipped = 0, warnings = 0, failed = 0;

  for (const u of portalUsers) {
    const nameLower = String(u.username).toLowerCase();
    const gwUser = byName.get(nameLower);

    // 幂等: 已回填且网关侧存在同名同 id → 跳过
    if (u.gateway_user_id && gwUser && gwUser.userId === u.gateway_user_id) {
      console.log(`⏭️  跳过(已同步): ${u.username}(门户#${u.id}) → gwUserId=${u.gateway_user_id}`);
      skipped++;
      continue;
    }

    if (!gwUser) {
      // 网关无同名用户 → 代建
      if (DRY_RUN) {
        console.log(`[dry-run] 将代建: ${u.username}(门户#${u.id}) → 网关默认组`);
        created++;
        continue;
      }
      try {
        const createdUser = await gw.createUser({
          username: u.username,
          password: require('crypto').randomBytes(18).toString('base64url'),
          note: `AI-Portal 存量迁移: ${u.name || u.username}`,
        });
        await global.pool.query(
          'UPDATE portal_users SET gateway_user_id = $1, gateway_user_group_id = $2 WHERE id = $3',
          [createdUser.userId, createdUser.groupId ?? null, u.id]
        );
        console.log(`✅ 代建成功: ${u.username}(门户#${u.id}) → gwUserId=${createdUser.userId} gwGroupId=${createdUser.groupId}`);
        created++;
        byName.set(nameLower, { userId: createdUser.userId, username: u.username, groupId: createdUser.groupId, role: 'user', enabled: true });
      } catch (e) {
        console.error(`❌ 代建失败: ${u.username}(门户#${u.id}): ${e.message} (code=${e.code || '-'})`);
        failed++;
      }
      continue;
    }

    // 网关有同名用户 → 回填（含 role 检查）
    if (gwUser.role && gwUser.role !== 'user') {
      console.warn(`⚠️  回填（撞名管理员）: ${u.username}(门户#${u.id}) → 网关#${gwUser.userId} role=${gwUser.role} —— 网关管理代操作仅允许 role=user, 该用户无法由门户代发 Key`);
      warnings++;
    }
    if (DRY_RUN) {
      console.log(`[dry-run] 将回填: ${u.username}(门户#${u.id}) → gwUserId=${gwUser.userId} gwGroupId=${gwUser.groupId ?? '-'}`);
      backfilled++;
      continue;
    }
    await global.pool.query(
      'UPDATE portal_users SET gateway_user_id = $1, gateway_user_group_id = $2 WHERE id = $3',
      [gwUser.userId, gwUser.groupId ?? null, u.id]
    );
    console.log(`✅ 回填成功: ${u.username}(门户#${u.id}) → gwUserId=${gwUser.userId} gwGroupId=${gwUser.groupId ?? '-'}`);
    backfilled++;
  }

  console.log(`\n=== 完成${DRY_RUN ? '(dry-run)' : ''}: 代建 ${created} / 回填 ${backfilled} / 跳过 ${skipped} / 告警 ${warnings} / 失败 ${failed} ===`);
  if (failed > 0) process.exitCode = 1;
  await global.pool.end();
}

main().catch(e => {
  console.error('迁移脚本异常:', e.message, '\n', e.stack);
  process.exit(1);
});
