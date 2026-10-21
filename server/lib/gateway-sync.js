// server/lib/gateway-sync.js
// V2 独立网关同步编排（M2 模型域）
//
// syncModels()          统一入口:按 gateway_provider 分支
//   ├─ '1panel'     → panel.js syncModelsFromPanel()（V1 链路,冻结不动）
//   └─ 'ai-gateway' → syncGatewayModels()（本文件）
//
// syncGatewayModels 的写入骨架(批量 UPSERT / 反向 NOT EXISTS 软删 / 空响应不清表 /
// sync_log)与 panel.js _syncModelsFromPanel 保持同构,仅数据源换为适配器 listModels()。

'use strict';

const { getGateway, currentProviderName } = require('./gateway');
const pool = () => global.pool;

/**
 * 独立网关模型同步:adapter.listModels() → portal_models
 * 返回 { backendCount, modelCount, deactivatedCount, skipped? } —— 与 _syncModelsFromPanel 同形
 */
async function syncGatewayModels() {
  try {
    return await _syncGatewayModels();
  } catch (err) {
    console.error('[gateway-sync] 未捕获的异常:', err.message, '\n', err.stack);
    try {
      await pool().query(`
        INSERT INTO portal_sync_log (sync_type, status, message, total_count, success_count, details)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['models', 'error', `独立网关同步异常: ${err.message}`, 0, 0, { provider: 'ai-gateway', error: err.message }]);
    } catch (_) { /* 日志写入失败不中断 */ }
    throw err; // 抛出让上层(sync-now allSettled / 调度器 tick)按既有容错处理
  }
}

async function _syncGatewayModels() {
  const gw = await getGateway(pool());
  const rows = await gw.listModels();

  console.log(`[gateway-sync] AI-Gateway 返回 ${rows.length} 条模型记录,开始 UPSERT`);

  // 空响应不清表:网关临时返回空(鉴权抖动/实例重启)时跳过本轮,防止误软删全部本地数据
  if (rows.length === 0) {
    console.warn('[gateway-sync] 网关返回空模型列表,跳过本轮 UPSERT 与软删（防误删本地数据）');
    await pool().query(`
      INSERT INTO portal_sync_log (sync_type, status, message, total_count, success_count, details)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, ['models', 'skipped', '独立网关返回空模型列表,跳过本轮', 0, 0, { provider: 'ai-gateway', skipped: true }]);
    return { backendCount: 0, modelCount: 0, deactivatedCount: 0, skipped: true };
  }

  // 批量写入(8 列 × N 行,与 _syncModelsFromPanel 同构):
  //   panel_backend_id ← accountId(M5 改名 gateway_account_id)
  //   is_active ← enabled; display_name ← model_name; is_public 显式 FALSE(新模型由管理员上架)
  //   ON CONFLICT (group_name, model_name) 不触碰 display_name/is_public —— 管理员手动上架状态不被覆盖
  const COLS = 8;
  const valuesSql = rows
    .map((_, rowIdx) => {
      const base = rowIdx * COLS;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, CURRENT_TIMESTAMP, $${base + 3}, FALSE)`;
    })
    .join(', ');
  const flatParams = rows.flatMap(r => [
    r.accountId ?? null,
    r.groupName,
    r.modelName,
    r.provider || '',
    r.baseUrl || '',
    r.modelType || '',
    JSON.stringify(r.raw ?? {}),
    r.enabled !== false,
  ]);

  let successCount = 0;
  if (rows.length > 0) {
    await pool().query(
      `INSERT INTO portal_models (
        panel_backend_id, group_name, model_name, provider, base_url, model_type,
        raw_data, is_active, synced_at, display_name, is_public
      ) VALUES ${valuesSql}
      ON CONFLICT (group_name, model_name) DO UPDATE SET
        panel_backend_id = EXCLUDED.panel_backend_id,
        provider = EXCLUDED.provider,
        base_url = EXCLUDED.base_url,
        model_type = EXCLUDED.model_type,
        raw_data = EXCLUDED.raw_data,
        is_active = EXCLUDED.is_active,
        synced_at = CURRENT_TIMESTAMP`,
      flatParams
    );
    successCount = rows.length;
    console.log(`[gateway-sync] UPSERT 完成,写入/更新 ${successCount} 条模型记录`);
  }

  // 软删除:本轮存活的 (group_name, model_name) 之外全部下架(切换数据源后 1Panel 旧行由此清理,预期行为)
  let deactivatedCount = 0;
  const keyValuesSql = rows
    .map((_, i) => `($${i * 2 + 1}::varchar, $${i * 2 + 2}::varchar)`)
    .join(', ');
  const keyParams = rows.flatMap(r => [r.groupName, r.modelName]);
  const result = await pool().query(
    `UPDATE portal_models
     SET is_active = false, updated_at = CURRENT_TIMESTAMP
     WHERE is_active = true
       AND (group_name, model_name) NOT IN (VALUES ${keyValuesSql})`,
    keyParams
  );
  deactivatedCount = result.rowCount;
  if (deactivatedCount > 0) {
    console.log(`[gateway-sync] 软删除 ${deactivatedCount} 个本轮未出现的模型`);
  }

  const backendCount = new Set(rows.map(r => r.accountId).filter(v => v != null)).size;
  await pool().query(`
    INSERT INTO portal_sync_log (sync_type, status, message, total_count, success_count, details)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, ['models', 'success',
      deactivatedCount > 0 ? `独立网关模型同步完成,下架 ${deactivatedCount} 个` : '独立网关模型同步完成',
      rows.length, successCount,
      { provider: 'ai-gateway', backendCount, modelCount: successCount, deactivatedCount }]);

  return { backendCount, modelCount: successCount, deactivatedCount };
}

/**
 * 统一入口:按 gateway_provider 分支(所有模型同步触发点统一改调此函数)
 *  - '1panel'(默认) → V1 链路 syncModelsFromPanel
 *  - 'ai-gateway'    → 独立网关 syncGatewayModels + syncGatewayGroups(模型+组同一 tick)
 */
async function syncModels() {
  const provider = currentProviderName();
  if (provider === 'ai-gateway') {
    const modelsResult = await syncGatewayModels();
    // 组缓存与归属回填跟随同一 tick(授权 JOIN 数据源),失败不阻断模型同步但记日志
    try {
      await syncGatewayGroups();
    } catch (e) {
      console.error('[gateway-sync] 组同步失败(模型同步不受影响):', e.message);
    }
    return modelsResult;
  }
  const { syncModelsFromPanel } = require('../panel');
  return syncModelsFromPanel();
}

/**
 * 统一入口(组域):按 gateway_provider 分支
 *  - '1panel'     → panel.js syncPanelGroups()(用户组/模型组/key组ID回填, V1 链路)
 *  - 'ai-gateway' → syncGatewayGroups()(网关组缓存 + 用户归属回填)
 */
async function syncGroups() {
  const provider = currentProviderName();
  if (provider === 'ai-gateway') {
    return syncGatewayGroups();
  }
  const { syncPanelGroups } = require('../panel');
  return syncPanelGroups();
}

/**
 * 独立网关组同步(M3 授权域):
 *   1. adapter.listUserGroups() → gateway_user_groups(UPSERT + 软删 + 空响应不清表)
 *   2. adapter.listModelGroups() → gateway_model_groups(同上)
 *   3. adapter.listUsers() → 归属回填:按 username 匹配 portal_users,
 *      回填 gateway_user_id + gateway_user_group_id(授权 JOIN 第一层)
 * 返回 { userGroups, modelGroups, backfilled, skipped? }
 */
async function syncGatewayGroups() {
  try {
    return await _syncGatewayGroups();
  } catch (err) {
    console.error('[gateway-sync] 组同步未捕获异常:', err.message, '\n', err.stack);
    try {
      await pool().query(`
        INSERT INTO portal_sync_log (sync_type, status, message, total_count, success_count, details)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['groups', 'error', `独立网关组同步异常: ${err.message}`, 0, 0, { provider: 'ai-gateway', error: err.message }]);
    } catch (_) { /* 日志写入失败不中断 */ }
    throw err;
  }
}

async function _syncGatewayGroups() {
  const gw = await getGateway(pool());

  // ---- 1. 用户组 ----
  const userGroups = await gw.listUserGroups();
  if (userGroups.length > 0) {
    for (const g of userGroups) {
      await pool().query(`
        INSERT INTO gateway_user_groups (
          gateway_group_id, name, enabled, is_default, model_group_ids,
          max_concurrency, api_key_max_concurrency, token_plan_id, synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)
        ON CONFLICT (gateway_group_id) DO UPDATE SET
          name=EXCLUDED.name, enabled=EXCLUDED.enabled, is_default=EXCLUDED.is_default,
          model_group_ids=EXCLUDED.model_group_ids, max_concurrency=EXCLUDED.max_concurrency,
          api_key_max_concurrency=EXCLUDED.api_key_max_concurrency,
          token_plan_id=EXCLUDED.token_plan_id, synced_at=CURRENT_TIMESTAMP
      `, [
        g.groupId, g.name, g.enabled, g.isDefault,
        JSON.stringify(g.modelGroupIds || []),
        g.maxConcurrency || 0, g.apiKeyMaxConcurrency || 0, g.tokenPlanId ?? null,
      ]);
    }
    // 软删:本轮未出现的组置 enabled=false(防空响应误删由上方空列表防护覆盖;
    // 这里 userGroups 非空,软删安全)
    const ids = userGroups.map(g => g.groupId);
    await pool().query(
      'UPDATE gateway_user_groups SET enabled = FALSE, synced_at = CURRENT_TIMESTAMP WHERE NOT (gateway_group_id = ANY($1)) AND enabled = TRUE',
      [ids]
    );
  }

  // ---- 2. 模型组 ----
  const modelGroups = await gw.listModelGroups();
  if (modelGroups.length > 0) {
    for (const g of modelGroups) {
      await pool().query(`
        INSERT INTO gateway_model_groups (gateway_group_id, name, protocol_type, models, synced_at)
        VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)
        ON CONFLICT (gateway_group_id) DO UPDATE SET
          name=EXCLUDED.name, protocol_type=EXCLUDED.protocol_type,
          models=EXCLUDED.models, synced_at=CURRENT_TIMESTAMP
      `, [g.groupId, g.name, g.protocolType, JSON.stringify(g.models || [])]);
    }
    const ids = modelGroups.map(g => g.groupId);
    await pool().query(
      'UPDATE gateway_model_groups SET synced_at = CURRENT_TIMESTAMP WHERE NOT (gateway_group_id = ANY($1))',
      [ids]
    );
    // 模型组无启用语义,不引用即无效——物理删除未引用组? 保守起见保留(组删除由网关侧软删通过
    // user_groups 的 model_group_ids 收敛; 此处仅做插入/更新, 不删除历史组缓存)
  }

  // ---- 3. 用户归属回填(按 username 匹配; gateway username = 门户 username) ----
  let backfilled = 0;
  let orphanCleared = 0;
  const gwUsers = await gw.listUsers();
  if (gwUsers.length > 0) {
    const uids = gwUsers.map(u => u.userId);
    const unames = gwUsers.map(u => u.username);
    const gids = gwUsers.map(u => u.groupId ?? null);
    const r = await pool().query(`
      UPDATE portal_users pu SET
        gateway_user_id = u.uid,
        gateway_user_group_id = u.gid
      FROM (SELECT * FROM unnest($1::int[], $2::text[], $3::int[]) AS t(uid, uname, gid)) u
      WHERE lower(pu.username) = lower(u.uname)
    `, [uids, unames, gids]);
    backfilled = r.rowCount;

    // 反向清理:门户记录了网关用户 id 但该用户已不在网关(网关侧被删) → 清空脏引用,
    // 否则 Key 代操作会 404 user was not found（listUsers 为全量翻页, 清理安全）
    const c = await pool().query(
      'UPDATE portal_users SET gateway_user_id = NULL, gateway_user_group_id = NULL WHERE gateway_user_id IS NOT NULL AND NOT (gateway_user_id = ANY($1::int[]))',
      [uids]
    );
    orphanCleared = c.rowCount;
  }

  await pool().query(`
    INSERT INTO portal_sync_log (sync_type, status, message, total_count, success_count, details)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, ['groups', 'success',
      `独立网关组同步完成: 用户组 ${userGroups.length} / 模型组 ${modelGroups.length}` + (backfilled ? `,归属回填 ${backfilled}` : '') + (orphanCleared ? `,清理失联归属 ${orphanCleared}` : ''),
      userGroups.length + modelGroups.length, userGroups.length + modelGroups.length,
      { provider: 'ai-gateway', userGroups: userGroups.length, modelGroups: modelGroups.length, backfilled, orphanCleared }]);

  console.log(`[gateway-sync] 组同步完成: 用户组 ${userGroups.length} / 模型组 ${modelGroups.length} / 归属回填 ${backfilled} / 清理失联 ${orphanCleared}`);
  return { userGroups: userGroups.length, modelGroups: modelGroups.length, backfilled, orphanCleared };
}

module.exports = { syncModels, syncGatewayModels, syncGroups, syncGatewayGroups };
