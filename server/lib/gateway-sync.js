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
    // 若存在默认资源组,把新上架模型自动追加到默认组 items(保持"默认全量"语义)
    try {
      const { syncDefaultGroupItems } = require('./default-group');
      await syncDefaultGroupItems(global.pool);
    } catch (e) {
      console.error('[gateway-sync] 默认资源组自动追加失败(不阻断):', e.message);
    }
    return modelsResult;
  }
  const { syncModelsFromPanel } = require('../panel');
  const r = await syncModelsFromPanel();
  // 1Panel 模式同样保持默认组"全量"语义
  try {
    const { syncDefaultGroupItems } = require('./default-group');
    await syncDefaultGroupItems(global.pool);
  } catch (e) {
    console.error('[gateway-sync] 默认资源组自动追加失败(不阻断):', e.message);
  }
  return r;
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
  let ownershipFixed = 0;
  const gwUsers = await gw.listUsers();
  if (gwUsers.length > 0) {
    // 预清理:gateway_user_id 归属修正 — 和 syncGatewayUsers 同样的保护
    // syncGatewayGroups / syncGatewayUsers 在 sync-now 并发跑,有唯一索引后必须先清脏引用
    const gwUsernameByGwId = new Map();
    for (const gu of gwUsers) gwUsernameByGwId.set(gu.userId, gu.username.toLowerCase());
    const allGw = await pool().query(
      'SELECT id, username, gateway_user_id FROM portal_users WHERE gateway_user_id IS NOT NULL'
    );
    for (const row of allGw.rows) {
      const gwOwner = gwUsernameByGwId.get(row.gateway_user_id);
      if (gwOwner && gwOwner !== row.username.toLowerCase()) {
        await pool().query(
          'UPDATE portal_users SET gateway_user_id = NULL, gateway_user_group_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [row.id]
        );
        ownershipFixed++;
      }
    }

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

// ============ 用户域 ============

/**
 * 统一入口(用户域):按 gateway_provider 分支
 *  - '1panel'     → admin.js doSyncUsers()(V1 链路,冻结不动)
 *  - 'ai-gateway' → syncGatewayUsers()(网关用户全量同步 + Key 同步)
 */
async function syncUsers() {
  const provider = currentProviderName();
  if (provider === 'ai-gateway') {
    return syncGatewayUsers();
  }
  // 1Panel 链路保留在 admin.js doSyncUsers() —— 由调用方自行分支
  // 返回 null 表示「不是 gateway 模式,跳过」
  return null;
}

/**
 * 独立网关用户全量同步:
 *   1. adapter.listUsers() → 拉网关全量用户
 *   2. 按 username 匹配 portal_users → 存在则回填 gateway_user_id/gateway_user_group_id,不存在则新建
 *   3. enabled 状态双向同步(网关 disable → 本地 status=disabled)
 *   4. API Key 同步:listKeysOfUser() 拉每个网关用户的 Key,写 portal_api_keys(gateway_key_id)
 * 返回 { synced, bound, keySynced, orphanCleared, skipped? }
 */
async function syncGatewayUsers() {
  try {
    return await _syncGatewayUsers();
  } catch (err) {
    console.error('[gateway-sync] 用户同步未捕获异常:', err.message, '\n', err.stack);
    try {
      await pool().query(`
        INSERT INTO portal_sync_log (sync_type, status, message, total_count, success_count, details)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['users', 'error', `独立网关用户同步异常: ${err.message}`, 0, 0, { provider: 'ai-gateway', error: err.message }]);
    } catch (_) { /* 日志写入失败不中断 */ }
    throw err;
  }
}

async function _syncGatewayUsers() {
  const gw = await getGateway(pool());
  const bcrypt = require('bcrypt');
  const gwUsers = await gw.listUsers();

  console.log(`[gateway-sync] AI-Gateway 返回 ${gwUsers.length} 条用户记录,开始同步`);

  // 空响应不清表:网关临时返回空(鉴权抖动/实例重启)时跳过,防止误清理
  if (gwUsers.length === 0) {
    console.warn('[gateway-sync] 网关返回空用户列表,跳过本轮同步');
    await pool().query(`
      INSERT INTO portal_sync_log (sync_type, status, message, total_count, success_count, details)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, ['users', 'skipped', '独立网关返回空用户列表,跳过本轮', 0, 0, { provider: 'ai-gateway', skipped: true }]);
    return { synced: 0, bound: 0, keySynced: 0, orphanCleared: 0, skipped: true };
  }

  // 拉本地全量 portal_users
  const localRes = await pool().query(
    'SELECT id, username, gateway_user_id, gateway_user_group_id, panel_user_id FROM portal_users'
  );
  const localByUsername = new Map();
  const localGwIds = new Set();
  for (const row of localRes.rows) {
    localByUsername.set(row.username.toLowerCase(), row);
    if (row.gateway_user_id) localGwIds.add(row.gateway_user_id);
  }

  const DEFAULT_PWD = process.env.SYNC_USER_DEFAULT_PASSWORD || 'ChangeMe@Portal123';
  let synced = 0, bound = 0, ownershipFixed = 0;
  const gwIds = [];

  // ---- 预清理:gateway_user_id 归属修正 ----
  // 网关侧用户 id 可能变更(如 gw_id=2 从 m4test 变成 zhangsan),但门户旧行还占着该 id。
  // 现在有唯一索引 ON CONFLICT(gateway_user_id)会直接报错,所以提前:如果某 gateway_user_id
  // 被持有它的本地行的 username 与网关侧 username 对不上 → 清空该脏引用。
  // 注:这轮清理只针对「gateway_user_id 非空且 username 与网关侧不匹配」的行,
  // 后续循环会以正确的 username 重新回填 gateway_user_id。
  const gwUsernameByGwId = new Map();
  for (const gu of gwUsers) gwUsernameByGwId.set(gu.userId, gu.username.toLowerCase());
  const allGwUsers = await pool().query(
    'SELECT id, username, gateway_user_id FROM portal_users WHERE gateway_user_id IS NOT NULL'
  );
  for (const row of allGwUsers.rows) {
    const gwOwnerUsername = gwUsernameByGwId.get(row.gateway_user_id);
    // 网关侧还有这个 id,但本地持有者 username 对不上 → 清空,让真正的 owner 在后续循环里回填
    if (gwOwnerUsername && gwOwnerUsername !== row.username.toLowerCase()) {
      await pool().query(
        'UPDATE portal_users SET gateway_user_id = NULL, gateway_user_group_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [row.id]
      );
      ownershipFixed++;
    }
    // 如果 gwOwnerUsername 为 undefined,说明网关侧已无此 id → 后面 orphanCleared 会统一清
  }

  for (const gu of gwUsers) {
    gwIds.push(gu.userId);
    const local = localByUsername.get(gu.username.toLowerCase());

    if (local) {
      // 已存在 → 回填 gateway_user_id / gateway_user_group_id + 状态
      const newStatus = gu.enabled ? 'active' : 'disabled';
      await pool().query(`
        UPDATE portal_users SET
          gateway_user_id = $1,
          gateway_user_group_id = $2,
          status = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [gu.userId, gu.groupId ?? null, newStatus, local.id]);
      bound++;
    } else {
      // 新建:网关用户首次进入门户
      const passwordHash = await bcrypt.hash(DEFAULT_PWD, 12);
      try {
        const ins = await pool().query(`
          INSERT INTO portal_users (
            gateway_user_id, gateway_user_group_id, username, name, display_name,
            password_hash, role, status, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,'user',$7,CURRENT_TIMESTAMP)
          ON CONFLICT (username) DO UPDATE SET
            gateway_user_id = EXCLUDED.gateway_user_id,
            gateway_user_group_id = EXCLUDED.gateway_user_group_id,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `, [
          gu.userId, gu.groupId ?? null, gu.username, gu.username, gu.username,
          passwordHash, gu.enabled ? 'active' : 'disabled',
        ]);
        if (ins.rowCount) {
          // 分配内置 user 角色
          await pool().query(`
            INSERT INTO user_roles (user_id, role_id)
            SELECT $1, id FROM roles WHERE name = 'user' AND is_system = TRUE
            ON CONFLICT DO NOTHING
          `, [ins.rows[0].id]);
          synced++;
        }
      } catch (e) {
        console.error(`[gateway-sync] 创建网关用户 ${gu.username} 失败:`, e.message);
      }
    }
  }

  // 反向清理:本地记录 gateway_user_id 但网关侧已删除 → 清空脏引用
  let orphanCleared = 0;
  const c = await pool().query(
    'UPDATE portal_users SET gateway_user_id = NULL, gateway_user_group_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE gateway_user_id IS NOT NULL AND NOT (gateway_user_id = ANY($1::int[]))',
    [gwIds]
  );
  orphanCleared = c.rowCount;

  // ---- API Key 同步:listKeysOfUser() ----
  let keySynced = 0;
  try {
    const localGwUsers = await pool().query(
      'SELECT id, gateway_user_id FROM portal_users WHERE gateway_user_id IS NOT NULL'
    );
    for (const u of localGwUsers.rows) {
      try {
        const gwKeys = await gw.listKeysOfUser(u.gateway_user_id);
        if (!gwKeys.length) continue;

        const existing = await pool().query(
          'SELECT gateway_key_id FROM portal_api_keys WHERE user_id = $1 AND gateway_key_id IS NOT NULL',
          [u.id]
        );
        const existingGwKeyIds = new Set(existing.rows.map(r => r.gateway_key_id));

        for (const gk of gwKeys) {
          if (existingGwKeyIds.has(gk.keyId)) continue;
          await pool().query(`
            INSERT INTO portal_api_keys (
              user_id, gateway_key_id, api_key_mask, status, remark, raw_data, synced_at
            ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,CURRENT_TIMESTAMP)
            ON CONFLICT (gateway_key_id) DO UPDATE SET
              api_key_mask = EXCLUDED.api_key_mask,
              status = EXCLUDED.status,
              raw_data = EXCLUDED.raw_data,
              synced_at = CURRENT_TIMESTAMP
          `, [u.id, gk.keyId, gk.mask || '', gk.enabled ? 'Enable' : 'Disable', gk.name || '', JSON.stringify(gk.raw || {})]);
          keySynced++;
        }
      } catch (e) {
        console.warn(`[gateway-sync] 用户 ${u.id} (gwId=${u.gateway_user_id}) Key 同步跳过:`, e.message);
      }
    }
  } catch (e) {
    console.error('[gateway-sync] API Key 同步异常(不阻断用户主体):', e.message);
  }

  const msgParts = [`独立网关用户同步完成: 绑定 ${bound} / 新增 ${synced}`];
  if (ownershipFixed) msgParts.push(`归属修正 ${ownershipFixed}`);
  if (keySynced) msgParts.push(`Key ${keySynced}`);
  if (orphanCleared) msgParts.push(`清理失联 ${orphanCleared}`);

  await pool().query(`
    INSERT INTO portal_sync_log (sync_type, status, message, total_count, success_count, details)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, ['users', 'success', msgParts.join(', '), gwUsers.length, bound + synced,
      { provider: 'ai-gateway', gwUsers: gwUsers.length, synced, bound, ownershipFixed, keySynced, orphanCleared }]);

  console.log(`[gateway-sync] 用户同步完成: 绑定 ${bound} / 新增 ${synced}${ownershipFixed ? ` / 归属修正 ${ownershipFixed}` : ''} / Key ${keySynced} / 清理失联 ${orphanCleared}`);
  return { gwUsers: gwUsers.length, synced, bound, ownershipFixed, keySynced, orphanCleared };
}

module.exports = { syncModels, syncGatewayModels, syncGroups, syncGatewayGroups, syncUsers, syncGatewayUsers };
