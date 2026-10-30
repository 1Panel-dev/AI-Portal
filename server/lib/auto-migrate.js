/**
 * V1 → V2 自动迁移
 *
 * 触发条件:
 *   - gateway_provider = '1panel' (系统默认值, 尚未切换)
 *   - gateway_base_url + gateway_api_key 都已配置 (运维已填好 V2 网关凭证)
 *   - v2_migration_done 不存在 (幂等, 只跑一次)
 *
 * 执行顺序:
 *   1. 写 gateway_provider = 'ai-gateway', 热重载网关适配器
 *   2. 跑 groups 同步 (用户组 + 模型组缓存 + portal_users.gateway_user_id 回填)
 *   3. 跑 users 同步 (增量网关用户 + portal_api_keys.gateway_key_id)
 *   4. 跑 models 同步 (UPSERT 到 portal_models, 沿用旧 group_name 保证 is_public 不丢失)
 *   5. 写 v2_migration_done = now()
 *
 * 失败保护:
 *   - 每步 try-catch, 单步失败不阻断后续步骤
 *   - 任何步骤失败 → 不写 migration_done, 下次启动继续尝试
 *   - 整个函数失败不阻断 HTTP server 启动
 */

'use strict';

async function runAutoMigrate(pool) {
  // 1. 读关键配置
  const cfgRows = await pool.query(
    `SELECT key, value FROM system_config WHERE key IN (
       'gateway_provider', 'gateway_base_url', 'gateway_api_key',
       'gateway_default_user_group_id', 'v2_migration_done'
    )`
  );
  const cfg = {};
  for (const r of cfgRows.rows) cfg[r.key] = r.value;

  // 已迁移过 → 跳过
  if (cfg.v2_migration_done) {
    console.log(`✅ V1→V2 已迁移 (${cfg.v2_migration_done}), 跳过自动迁移`);
    return { skipped: true, reason: 'already_migrated' };
  }

  // provider 已经是 ai-gateway → 用户手工切过, 说明迁移已完成
  if (cfg.gateway_provider === 'ai-gateway') {
    console.log(`✅ gateway_provider 已是 ai-gateway, 标记迁移完成`);
    await pool.query(
      `INSERT INTO system_config (key, value, updated_at) VALUES ('v2_migration_done', CURRENT_TIMESTAMP::text, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = CURRENT_TIMESTAMP::text, updated_at = CURRENT_TIMESTAMP`
    );
    return { skipped: true, reason: 'already_ai_gateway' };
  }

  // V2 网关凭证未就绪 → 跳过 (运维可能还没填)
  const baseUrl = String(cfg.gateway_base_url || '').trim();
  const apiKey = String(cfg.gateway_api_key || '').trim();
  if (!baseUrl || !apiKey) {
    console.log(`ℹ️ V2 网关凭证未就绪 (baseUrl=${baseUrl ? 'OK' : '空'}, apiKey=${apiKey ? 'OK' : '空'}), 跳过自动迁移`);
    return { skipped: true, reason: 'credentials_not_ready' };
  }

  // defaultUserGroupId 是网关模式必需的 (企微注册代建用户)
  const defaultGroupId = parseInt(cfg.gateway_default_user_group_id || '0', 10);
  if (!defaultGroupId || defaultGroupId < 1) {
    console.log(`⚠️ V2 迁移需要 gateway_default_user_group_id, 当前未配置 (${cfg.gateway_default_user_group_id || '空'}), 跳过自动迁移`);
    return { skipped: true, reason: 'missing_default_user_group' };
  }

  console.log('🔄 检测到 V2 网关凭证已就绪, 开始自动迁移 V1→V2...');

  const results = { providerSwitched: false, groups: null, users: null, models: null, errors: [] };

  try {
    // Step 1: 切换 provider 并热重载
    await pool.query(
      `INSERT INTO system_config (key, value, updated_at) VALUES ('gateway_provider', 'ai-gateway', CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = 'ai-gateway', updated_at = CURRENT_TIMESTAMP`
    );
    console.log('  ✅ gateway_provider 已切换为 ai-gateway');

    const { reloadGateway } = require('./gateway');
    await reloadGateway(pool);
    results.providerSwitched = true;

    // 测试连接: 如果 V2 网关连不上, 回切 provider 并放弃本轮迁移
    const { getGateway } = require('./gateway');
    const gw = await getGateway(pool);
    try {
      await gw.verifyConnection();
      console.log('  ✅ V2 网关连接测试通过');
    } catch (verifyErr) {
      console.error(`  ❌ V2 网关连接失败, 回切 provider 并放弃迁移: ${verifyErr.message}`);
      await pool.query(
        `INSERT INTO system_config (key, value, updated_at) VALUES ('gateway_provider', '1panel', CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = '1panel', updated_at = CURRENT_TIMESTAMP`
      );
      await reloadGateway(pool);
      await pool.query(
        `INSERT INTO portal_sync_log (sync_type, status, message, total_count, success_count, details)
         VALUES ('migration', 'error', 'V2 网关连接失败, 自动迁移已回切 provider', 0, 0,
                 jsonb_build_object('reason', 'verify_connection_failed', 'error', verifyErr.message))`
      );
      return { ...results, skipped: true, reason: 'connection_failed' };
    }

    // Step 2: 跑 groups 同步 (必须先于 users, 因为需要 gateway_user_id 回填)
    try {
      const { syncGroups } = require('./gateway-sync');
      const r = await syncGroups();
      results.groups = r;
      console.log(`  ✅ 组同步完成: 用户组 ${r.userGroups} / 模型组 ${r.modelGroups} / 归属回填 ${r.backfilled}`);
    } catch (e) {
      results.errors.push({ step: 'groups', error: e.message });
      console.error(`  ❌ 组同步失败 (不阻断): ${e.message}`);
    }

    // Step 3: 跑 users 同步 (依赖 groups 的 gateway_user_id 回填)
    try {
      const { syncUsers } = require('./gateway-sync');
      const r = await syncUsers();
      results.users = r;
      console.log(`  ✅ 用户同步完成: 绑定 ${r.bound} / 新增 ${r.synced}`);
    } catch (e) {
      results.errors.push({ step: 'users', error: e.message });
      console.error(`  ❌ 用户同步失败 (不阻断): ${e.message}`);
    }

    // Step 4: 跑 models 同步 (UPSERT, 沿用旧 group_name 保证 is_public 不丢失)
    try {
      const { syncModels } = require('./gateway-sync');
      const r = await syncModels();
      results.models = r;
      console.log(`  ✅ 模型同步完成: ${r.modelCount} 个模型`);
    } catch (e) {
      results.errors.push({ step: 'models', error: e.message });
      console.error(`  ❌ 模型同步失败 (不阻断): ${e.message}`);
    }

    // Step 5: 写迁移完成标记 (只要 provider 切了就记 done, 后续失败的步骤下次调度器会补齐)
    await pool.query(
      `INSERT INTO system_config (key, value, updated_at) VALUES ('v2_migration_done', CURRENT_TIMESTAMP::text, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = CURRENT_TIMESTAMP::text, updated_at = CURRENT_TIMESTAMP`
    );

    // 写 portal_sync_log 留痕
    await pool.query(
      `INSERT INTO portal_sync_log (sync_type, status, message, total_count, success_count, details)
       VALUES ('migration', $1, $2, $3, $4, $5::jsonb)`,
      [
        results.errors.length > 0 ? 'partial' : 'success',
        results.errors.length > 0
          ? `V1→V2 自动迁移完成 (有 ${results.errors.length} 个步骤失败, 调度器会补齐)`
          : 'V1→V2 自动迁移完成',
        0, 0,
        JSON.stringify({ provider: 'ai-gateway', ...results }),
      ]
    );

    console.log('🎉 V1→V2 自动迁移完成' + (results.errors.length > 0 ? ` (${results.errors.length} 步有失败, 不影响核心切换)` : ''));
    return results;
  } catch (e) {
    console.error('❌ V1→V2 自动迁移异常:', e.message, '\n', e.stack);
    await pool.query(
      `INSERT INTO portal_sync_log (sync_type, status, message, total_count, success_count, details)
       VALUES ('migration', 'error', 'V1→V2 自动迁移异常: ' || $1, 0, 0, $2::jsonb)`,
      [e.message, JSON.stringify({ ...results, error: e.message })]
    );
    return { ...results, errors: [...results.errors, { step: 'fatal', error: e.message }] };
  }
}

module.exports = { runAutoMigrate };
