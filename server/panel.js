const panel = require('./lib/1panel-api');

function getPanelPayload(data) {
  return data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'data') ? data.data : data;
}

function getPanelItems(data) {
  const payload = getPanelPayload(data);
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.list)) return payload.list;
  if (payload && Array.isArray(payload.records)) return payload.records;
  return [];
}

function parseModelMap(modelMap) {
  if (!modelMap) return [];
  if (Array.isArray(modelMap)) return modelMap.map(String).filter(Boolean);

  if (typeof modelMap === 'object') {
    return Object.keys(modelMap).filter(Boolean);
  }

  try {
    const parsed = JSON.parse(modelMap);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    if (parsed && typeof parsed === 'object') return Object.keys(parsed).filter(Boolean);
  } catch {
    return String(modelMap).split(',').map(item => item.trim()).filter(Boolean);
  }

  return [];
}

async function findPanelUser(username) {
  const response = await panel.post('/api/v2/core/enterprise/users/search', {
    page: 1,
    pageSize: 20,
    info: username,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`1Panel 用户查询失败: ${response.status}`);
  }

  return getPanelItems(response.data).find(item => String(item.name || '').toLowerCase() === username) || null;
}

async function getPanelUserRoleId() {
  try {
    const r = await global.pool.query(
      "SELECT value FROM system_config WHERE key = 'panel_user_role_id'"
    );
    if (r.rowCount > 0) return parseInt(r.rows[0].value, 10) || 4;
  } catch { /* 表或行不存在时用默认值 */ }
  return 4;
}

// 获取 1Panel 角色列表,用于管理员配置默认角色
async function getPanelRoles() {
  try {
    const response = await panel.post('/api/v2/core/enterprise/roles/search', {
      page: 1,
      pageSize: 100,
    });
    const items = getPanelItems(response.data);
    return items.map(item => ({
      id: item.id,
      name: item.name,
    }));
  } catch (err) {
    console.error('[panel] 获取 1Panel 角色列表失败:', err.message);
    return [];
  }
}

async function createPanelUser({ username, password, name }) {
  const roleId = await getPanelUserRoleId();
  const response = await panel.post('/api/v2/core/enterprise/users', {
    name: username,
    password: Buffer.from(password, 'utf-8').toString('base64'),
    sessionTimeout: 86400,
    nodeRoles: [{ nodeId: 1, roleId }],
    description: '通过AI网关创建：' + (name || username),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`1Panel 用户创建失败: ${response.status}`);
  }

  return getPanelPayload(response.data) || {};
}

async function syncModelsFromPanel() {
  const response = await panel.post('/api/v2/core/enterprise/ai-proxy/backends/search', { info: '' });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`1Panel 模型同步失败: HTTP ${response.status}`);
  }

  // 关键：1Panel 习惯返回 HTTP 200 + body.code 表示业务状态
  // 1Panel 不同版本/路由的"成功"码不统一,实测过的有 0 / 200,失败码常见 401/403/500
  // 因此采用「黑名单」语义:HTTP 已成功,只要 body.code 不是 HTTP 错误码段(>=400) 就视为业务成功
  if (response.data && typeof response.data === 'object') {
    const code = Number(response.data.code);
    const msg = response.data.message || response.data.msg;
    if (Number.isFinite(code) && code >= 400) {
      throw new Error(`1Panel 业务错误 code=${code}: ${msg || '(无 message)'}`);
    }
  }

  const backends = getPanelItems(response.data);

  // 空响应 ≠ 真的没有 backends:再加一道防线,避免「鉴权通过但临时返回空」也触发软删
  // 仅当确实拿到 backends(>0) 时才执行 UPSERT + 软删;否则直接返回 0 不动 DB
  if (backends.length === 0) {
    console.warn('[syncModels] 1Panel 返回空 backends,跳过本轮 UPSERT 与软删（防误删本地数据）');
    return { backendCount: 0, modelCount: 0, deactivatedCount: 0, skipped: true };
  }

  // 先把所有 (backend, modelName) 组合扁平化为一份 rows 数组
  // 旧实现是嵌套 for + 逐行 await，N 个模型 = N 次串行 RTT
  // 新实现：一次 INSERT ... VALUES (...), (...), (...) 批量写入
  const rows = [];
  for (const backend of backends) {
    const groupName = backend.accountName || backend.provider || `Backend ${backend.id}`;
    const modelNames = parseModelMap(backend.modelMap);
    for (const modelName of modelNames) {
      rows.push([
        backend.id || null,
        groupName,
        modelName,
        backend.provider || '',
        backend.baseUrl || '',
        backend.apiType || '',
        backend,
        backend.enabled !== false,
      ]);
    }
  }

  let successCount = 0;
  if (rows.length > 0) {
    // 8 列 × N 行 → 拼出 ($1,$2,...,$8),($9,$10,...,$16),...
    const COLS = 8;
    const valuesSql = rows
      .map((_, rowIdx) => {
        const base = rowIdx * COLS;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, CURRENT_TIMESTAMP)`;
      })
      .join(', ');
    const flatParams = rows.flat();

    // ON CONFLICT 子句保持与旧实现完全一致，确保覆盖语义不变
    await global.pool.query(
      `INSERT INTO portal_models (
        panel_backend_id, group_name, model_name, provider, base_url, model_type,
        raw_data, is_active, synced_at
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
  }

  // 软删除：远端本轮 backends 中不存在的 (group_name, model_name) 组合,置 is_active = false
  // 用本轮 UPSERT 的明确集合做反向 NOT EXISTS,避开"时间窗口"判据的时钟/并发风险
  // 边界:rows.length === 0 时(远端清空所有 backends),全表软删
  let deactivatedCount = 0;
  if (rows.length > 0) {
    // 构造 VALUES ($1,$2),($3,$4),... 作为"本轮存活集合"
    const keyValuesSql = rows
      .map((_, i) => `($${i * 2 + 1}::varchar, $${i * 2 + 2}::varchar)`)
      .join(', ');
    const keyParams = rows.flatMap(r => [r[1], r[2]]); // r[1]=group_name, r[2]=model_name

    const result = await global.pool.query(
      `UPDATE portal_models
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE is_active = true
         AND (group_name, model_name) NOT IN (VALUES ${keyValuesSql})`,
      keyParams
    );
    deactivatedCount = result.rowCount;
  } else {
    // 远端无任何 backend → 全部下架
    const result = await global.pool.query(
      `UPDATE portal_models SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE is_active = true`
    );
    deactivatedCount = result.rowCount;
  }

  if (deactivatedCount > 0) {
    console.log(`[syncModels] 软删除 ${deactivatedCount} 个远端已下架模型`);
  }

  await global.pool.query(`
    INSERT INTO portal_sync_log (sync_type, status, message, total_count, success_count, details)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, ['models', 'success',
      deactivatedCount > 0 ? `模型同步完成,下架 ${deactivatedCount} 个` : '模型同步完成',
      backends.length, successCount,
      { backendCount: backends.length, deactivatedCount }]);

  return { backendCount: backends.length, modelCount: successCount, deactivatedCount };
}

/**
 * 从 1Panel skills-hub 同步技能到本地 skills 表
 *
 * 策略:
 *   - 只同步 status = 'published' 的技能(pending/draft 跳过,因为远端禁止下载)
 *   - source 字段标记为 'panel',与本地技能区分
 *   - panel_skill_id 作为关联键: 远端 id ↔ 本地表
 *   - 远端不存在的 source='panel' 技能软删除(is_active=false)
 *   - 不动 source='local' 的技能(本地审核流的不受影响)
 */
async function syncSkillsFromPanel() {
  const PAGE_SIZE = 100;
  const allItems = [];

  // 1Panel search 是分页接口,先把所有 published 的拿到
  let page = 1;
  while (true) {
    const response = await panel.post('/api/v2/core/enterprise/skills-hub/search', {
      page, pageSize: PAGE_SIZE, info: '', status: 'published',
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`1Panel 技能同步失败: ${response.status}`);
    }
    const payload = getPanelPayload(response.data) || {};
    const items = Array.isArray(payload.items) ? payload.items
                : Array.isArray(payload.list) ? payload.list
                : Array.isArray(payload) ? payload : [];
    allItems.push(...items);
    const total = typeof payload.total === 'number' ? payload.total : allItems.length;
    if (allItems.length >= total || items.length < PAGE_SIZE) break;
    page++;
  }

  // 二次过滤:确保都是 published(防御性)
  const published = allItems.filter(it => it.status === 'published');

  let upsertCount = 0;
  if (published.length > 0) {
    // 用事务,UPSERT 一条一条来——技能数据 100 个以内,串行 UPSERT 成本可接受,
    // 且每条字段映射有差异(slug/install_command 等需要根据 name 派生),不适合一次性批量 INSERT
    for (const item of published) {
      const skillId = `1panel-${item.id}`;       // 1panel- 前缀避免和本地 skill_id 撞
      const slug = `1panel-${item.name}`;         // slug 也加 1panel- 前缀,避免与本地 skill 同名冲突 UNIQUE 约束
      const title = item.name;                   // 远端没单独 title,name 兼任
      const installCommand = `f2chub install ${slug}`;
      const installUrl = `/api/skills/${slug}/download`;

      await global.pool.query(`
        INSERT INTO skills (
          id, title, slug, description, avatar, avatar_color,
          downloads, stars, version, category, tag, author,
          install_command, install_url, file_path,
          source, panel_skill_id, risk_level, panel_status,
          created_at, updated_at, is_active, synced_at
        ) VALUES (
          $1, $2, $3,
          COALESCE($4, ''),
          'S', 'av-blue',
          0, 0,
          COALESCE($5, 'v1.0.0'),
          'skill',
          NULL,
          COALESCE($6, '1Panel'),
          $7, $8, NULL,
          'panel', $9, $10, $11,
          CURRENT_DATE, CURRENT_DATE, TRUE, CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          version = EXCLUDED.version,
          category = EXCLUDED.category,
          risk_level = EXCLUDED.risk_level,
          panel_status = EXCLUDED.panel_status,
          is_active = TRUE,
          synced_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_DATE
      `, [
        skillId, title, slug, item.description, item.version,
        item.applicableAgent || '1Panel',
        installCommand, installUrl,
        item.id, item.riskLevel || null, item.status || null,
      ]);
      upsertCount++;
    }
  }

  // 软删除:远端不存在的 panel 技能(source='panel' 且本轮没同步到的)
  let deactivatedCount = 0;
  if (published.length > 0) {
    const presentIds = published.map(it => it.id);
    // 用 = ANY($1) 避免 IN 列表过长
    const result = await global.pool.query(
      `UPDATE skills
       SET is_active = FALSE, updated_at = CURRENT_DATE
       WHERE source = 'panel'
         AND is_active = TRUE
         AND (panel_skill_id IS NULL OR NOT (panel_skill_id = ANY($1::int[])))`,
      [presentIds]
    );
    deactivatedCount = result.rowCount;
  } else {
    // 远端 published 列表为空 → 所有 panel 技能下架
    const result = await global.pool.query(
      `UPDATE skills SET is_active = FALSE, updated_at = CURRENT_DATE
       WHERE source = 'panel' AND is_active = TRUE`
    );
    deactivatedCount = result.rowCount;
  }

  if (deactivatedCount > 0) {
    console.log(`[syncSkills] 软删除 ${deactivatedCount} 个 1Panel 已下架技能`);
  }

  await global.pool.query(`
    INSERT INTO portal_sync_log (sync_type, status, message, total_count, success_count, details)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, ['skills', 'success',
      deactivatedCount > 0 ? `技能同步完成,下架 ${deactivatedCount} 个` : '技能同步完成',
      allItems.length, upsertCount,
      { totalFetched: allItems.length, publishedCount: published.length, deactivatedCount }]);

  return { totalFetched: allItems.length, publishedCount: published.length, upsertCount, deactivatedCount };
}

/**
 * 通过 1Panel skills-hub/download 接口下载技能 zip
 * @param {number} panelSkillId
 * @returns {Promise<Buffer>} zip 二进制
 */
async function downloadPanelSkill(panelSkillId) {
  const response = await panel.post('/api/v2/core/enterprise/skills-hub/download', { id: panelSkillId });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`1Panel 技能下载失败: HTTP ${response.status}`);
  }
  const data = response.data;

  // 情况 1: 二进制 Buffer (1panel-api 检测到 application/zip 时直接返回 Buffer)
  if (Buffer.isBuffer(data)) {
    return data;
  }

  // 情况 2: JSON 错误响应({code, message, data})
  if (data && typeof data === 'object' && data.code && data.code >= 400) {
    throw new Error(`1Panel 下载失败: ${data.message || '未知错误'}`);
  }

  // 情况 3: JSON 包装的 base64/url(罕见,但保留兼容)
  const payload = getPanelPayload(data);
  if (payload && typeof payload === 'object') {
    if (payload.url) {
      throw new Error('1Panel 返回了 url 形式的下载链接,暂不支持自动跟随');
    }
    if (payload.content) {
      return Buffer.from(payload.content, 'base64');
    }
  }

  throw new Error('1Panel 下载返回格式无法识别');
}

module.exports = {
  panel,
  getPanelPayload,
  getPanelItems,
  parseModelMap,
  findPanelUser,
  createPanelUser,
  getPanelRoles,
  syncModelsFromPanel,
  syncSkillsFromPanel,
  downloadPanelSkill,
};
