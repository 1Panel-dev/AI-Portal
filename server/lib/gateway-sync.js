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
 *  - 'ai-gateway'    → 独立网关 syncGatewayModels
 */
async function syncModels() {
  const provider = currentProviderName();
  if (provider === 'ai-gateway') {
    return syncGatewayModels();
  }
  const { syncModelsFromPanel } = require('../panel');
  return syncModelsFromPanel();
}

module.exports = { syncModels, syncGatewayModels };
