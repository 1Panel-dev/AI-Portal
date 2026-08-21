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

  const original = String(modelMap);

  // 1. 尝试直接解析
  try {
    const parsed = JSON.parse(original);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    if (parsed && typeof parsed === 'object') return Object.keys(parsed).filter(Boolean);
  } catch (firstErr) {
    // 2. 清洗非法 Unicode 转义后重试
    let cleaned = original;
    // 处理所有 \u 转义序列
    cleaned = cleaned.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
      const cp = parseInt(hex, 16);
      // 孤立的 surrogate 码点（D800-DFFF）在 JSON 中非法
      if (cp >= 0xD800 && cp <= 0xDFFF) return hex; // 移除 \u 前缀
      return match; // 保留合法转义
    });
    // 处理非法 \u 序列（不足4位hex或非hex字符）
    cleaned = cleaned.replace(/\\u([0-9a-fA-F]{0,3})(?=$|[^0-9a-fA-F])/g, (_, hex) => hex || '');
    cleaned = cleaned.replace(/\\u([^0-9a-fA-F])/g, (_, char) => char);

    // 3. 尝试解析清洗后的字符串
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      if (parsed && typeof parsed === 'object') return Object.keys(parsed).filter(Boolean);
    } catch (secondErr) {
      // 4. 如果清洗后仍然失败，尝试更激进的清洗：移除所有反斜杠
      const aggressiveCleaned = original.replace(/\\/g, '');
      try {
        const parsed = JSON.parse(aggressiveCleaned);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
        if (parsed && typeof parsed === 'object') return Object.keys(parsed).filter(Boolean);
      } catch (thirdErr) {
        // 5. 最终回退：逗号分割
        console.warn(`[parseModelMap] 所有 JSON.parse 尝试均失败，原始: ${JSON.stringify(original.slice(0, 120))}`, {
          firstError: firstErr.message,
          secondError: secondErr.message,
          thirdError: thirdErr.message,
        });
        return original.split(',').map(item => item.trim()).filter(Boolean);
      }
    }
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

  const items = getPanelItems(response.data);
  // 1Panel users/search 的 info 参数是模糊搜索，可能返回多个
  // 优先精确匹配 name，再按 id 降序取最新创建的
  const lower = username.toLowerCase();
  const exact = items.filter(item => String(item.name || '').toLowerCase() === lower);
  if (exact.length > 0) {
    // 取 id 最大的（最新创建）
    return exact.sort((a, b) => (b.id || 0) - (a.id || 0))[0];
  }
  // 精确匹配失败时，尝试按 displayName 或 username 匹配
  const fuzzy = items.find(item =>
    String(item.name || '').toLowerCase() === lower ||
    String(item.displayName || '').toLowerCase() === lower ||
    String(item.username || '').toLowerCase() === lower
  );
  if (!fuzzy && items.length > 0) {
    console.log(`[findPanelUser] 搜索到 ${items.length} 个用户,但均不匹配 "${username}"。样本:`, items.slice(0, 3).map(i => ({ id: i.id, name: i.name, displayName: i.displayName, username: i.username })));
  }
  return fuzzy || null;
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
  try {
    return await _syncModelsFromPanel();
  } catch (err) {
    console.error(`[syncModels] 未捕获的异常:`, err);
    console.error(`[syncModels] 错误栈:`, err.stack);
    // 确保 sync-now 不崩溃,返回错误结果
    try {
      await global.pool.query(`
        INSERT INTO portal_sync_log (sync_type, status, message, total_count, success_count, details)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['models', 'error', `同步异常: ${err.message}`, 0, 0, { error: err.message }]);
    } catch (_) { /* 日志写入失败不中断 */ }
    throw err; // 仍然抛出,让上层(Promise.allSettled)捕获
  }
}

async function _syncModelsFromPanel() {
  const PAGE_SIZE = 100;
  const allBackends = [];

  // 1Panel 新版要求 page/pageSize 必填，翻全量
  let page = 1;
  while (page < 50) {
    const response = await panel.post('/api/v2/core/enterprise/ai-proxy/backends/search', {
      page, pageSize: PAGE_SIZE, info: '',
    });
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

    const items = getPanelItems(response.data);
    allBackends.push(...items);
    if (items.length < PAGE_SIZE) break;
    page++;
  }

  const backends = allBackends;
  console.log(`[syncModels] 1Panel 返回 ${backends.length} 个 backend,开始解析 modelMap`);

  // 调试：记录前几个 backend 的 modelMap
  for (let i = 0; i < Math.min(backends.length, 3); i++) {
    const b = backends[i];
    console.log(`[syncModels] backend[${i}]: id=${b.id}, provider=${b.provider}, modelMap type=${typeof b.modelMap}, length=${b.modelMap ? b.modelMap.length : 0}`);
    if (b.modelMap && typeof b.modelMap === 'string' && b.modelMap.length < 200) {
      console.log(`[syncModels]   modelMap preview: ${JSON.stringify(b.modelMap)}`);
      // 检查是否包含非法 Unicode 转义
      if (b.modelMap.includes('\\u')) {
        console.log(`[syncModels]   modelMap 包含 \\u 转义序列`);
        // 尝试解析以检查错误
        try {
          JSON.parse(b.modelMap);
          console.log(`[syncModels]   modelMap JSON 解析成功`);
        } catch (err) {
          console.error(`[syncModels]   modelMap JSON 解析失败: ${err.message}`);
          console.error(`[syncModels]   原始字符串: ${b.modelMap}`);
        }
      }
    }
  }

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
  let modelMapWarnCount = 0;
  let modelMapErrorCount = 0;
  for (const backend of backends) {
    const groupName = backend.accountName || backend.provider || `Backend ${backend.id}`;
    try {
      const modelNames = parseModelMap(backend.modelMap);
      if (modelNames.length === 0 && backend.modelMap) {
        modelMapWarnCount++;
        console.warn(`[syncModels] backend ${backend.id} modelMap 解析为空: ${typeof backend.modelMap} "${String(backend.modelMap).slice(0, 100)}"`);
      }
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
    } catch (err) {
      modelMapErrorCount++;
      console.error(`[syncModels] backend ${backend.id} parseModelMap 异常:`, err.message);
      console.error(`[syncModels]   modelMap: ${typeof backend.modelMap} "${String(backend.modelMap).slice(0, 200)}"`);
      // 跳过这个 backend，继续处理其他
      continue;
    }
  }

  if (modelMapErrorCount > 0) {
    console.warn(`[syncModels] ${modelMapErrorCount} 个 backend 的 modelMap 解析失败，已跳过`);
  }
  if (modelMapWarnCount > 0) {
    console.warn(`[syncModels] ${modelMapWarnCount} 个 backend 的 modelMap 解析为空（JSON 解析失败已回退逗号分割）`);
  }

  let successCount = 0;
  if (rows.length > 0) {
    // 8 列 × N 行 → 拼出 ($1,$2,...,$8),($9,$10,...,$16),...
    // 第 9 个字段 display_name（展示名）在 INSERT 时默认取 model_name($2)；
    // ON CONFLICT DO UPDATE 不触碰 display_name，保证管理员手改不被覆盖。
    const COLS = 8;
    const valuesSql = rows
      .map((_, rowIdx) => {
        const base = rowIdx * COLS;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, CURRENT_TIMESTAMP, $${base + 2})`;
      })
      .join(', ');
    const flatParams = rows.flat();

    // ON CONFLICT 子句保持与旧实现完全一致，确保覆盖语义不变
    await global.pool.query(
      `INSERT INTO portal_models (
        panel_backend_id, group_name, model_name, provider, base_url, model_type,
        raw_data, is_active, synced_at, display_name
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
    console.log(`[syncModels] UPSERT 完成,写入/更新 ${successCount} 条模型记录`);
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
  while (page < 50) {
    const response = await panel.post('/api/v2/core/enterprise/skills-hub/search', {
      page, pageSize: PAGE_SIZE, info: '', status: 'published',
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`1Panel 技能同步失败: ${response.status}`);
    }
    // 1Panel 业务码校验（黑名单语义，code ≥ 400 视为失败）
    if (response.data && typeof response.data === 'object') {
      const code = Number(response.data.code);
      if (Number.isFinite(code) && code >= 400) {
        throw new Error(`1Panel 业务错误 code=${code}: ${response.data.message || response.data.msg || '(无 message)'}`);
      }
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
  console.log(`[syncSkills] 1Panel 返回 ${allItems.length} 个技能(published=${published.length})`);

  let upsertCount = 0;
  if (published.length > 0) {
    // 用事务,UPSERT 一条一条来——技能数据 100 个以内,串行 UPSERT 成本可接受,
    // 且每条字段映射有差异(slug/install_command 等需要根据 name 派生),不适合一次性批量 INSERT
    for (const item of published) {
      // 用户提交并审核通过的技能(source='local')已存在(本地 slug=技能名, 无 1panel- 前缀),
      // 跳过, 避免重复展示 + 撞 idx_skills_panel_unique 唯一索引。
      // 用 slug 而非 panel_skill_id 判断: panel_skill_id 会随版本迭代漂移, 不可靠。
      const dup = await global.pool.query(
        "SELECT 1 FROM skills WHERE source = 'local' AND slug = $1 LIMIT 1",
        [item.name]
      );
      if (dup.rowCount > 0) continue;

      const skillId = `1panel-${item.id}`;       // 1panel- 前缀避免和本地 skill_id 撞
      const slug = `1panel-${item.name}`;         // slug 也加 1panel- 前缀,避免与本地 skill 同名冲突 UNIQUE 约束
      const title = item.name;                   // 远端没单独 title,name 兼任
      const installCommand = `skillctl install ${slug}`;
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
        ON CONFLICT (slug) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          version = EXCLUDED.version,
          category = EXCLUDED.category,
          risk_level = EXCLUDED.risk_level,
          panel_skill_id = EXCLUDED.panel_skill_id,
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

    // ----- 同步版本历史 -----
    // 逐个调 1Panel versions API 写入 skill_versions 表，
    // 单个失败不中断整体同步
    let versionCount = 0;
    for (const item of published) {
      try {
        const slug = `1panel-${item.name}`;
        // 查实际 skills 行 id（slug 冲突时保留旧 id，不一定是 1panel-${item.id}）
        const skillRow = await global.pool.query(
          `SELECT id FROM skills WHERE slug = $1 AND source = 'panel'`,
          [slug]
        );
        if (skillRow.rows.length === 0) continue;
        const skillId = skillRow.rows[0].id;
        const verRes = await panel.post('/api/v2/core/enterprise/skills-hub/versions', { id: item.id });
        if (verRes.status < 200 || verRes.status >= 300) continue;
        const versions = getPanelPayload(verRes.data);
        if (!Array.isArray(versions) || versions.length === 0) continue;

        for (const v of versions) {
          if (!v || !v.version) continue;
          await global.pool.query(`
            INSERT INTO skill_versions (skill_id, version, file_path, description, created_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (skill_id, version) DO NOTHING
          `, [
            skillId,
            String(v.version),
            v.filePath || null,
            v.description || null,
            v.createdAt ? new Date(v.createdAt) : new Date(),
          ]);
          versionCount++;
        }
      } catch (e) {
        // 单个技能版本同步失败不中断,仅打日志
        console.log(`[syncSkills] 版本同步跳过 ${item.name}: ${e.message}`);
      }
    }
    if (versionCount > 0) {
      console.log(`[syncSkills] 同步 ${versionCount} 个版本记录`);
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

  // 面板技能若已存在同名本地技能(用户提交审核通过), 下架面板行, 避免前端重复展示
  const dupDeactivated = await global.pool.query(`
    UPDATE skills p
    SET is_active = FALSE, updated_at = CURRENT_DATE
    WHERE p.source = 'panel'
      AND p.is_active = TRUE
      AND EXISTS (
        SELECT 1 FROM skills l
        WHERE l.source = 'local' AND l.slug = substring(p.slug from 8)
      )
  `);
  if (dupDeactivated.rowCount > 0) {
    console.log(`[syncSkills] 下架 ${dupDeactivated.rowCount} 个与本地技能重复的 panel 技能`);
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

/**
 * 同步 1Panel 用户组 / 模型组到本地缓存表（只读参考）。
 * 沿用空响应不清表语义: 1Panel 返回空时跳过 UPSERT, 防误清。
 */
async function syncPanelGroups() {
  const { inspectPanelBiz } = require('./lib/panel-biz');
  const PAGE_SIZE = 100;

  async function searchAll(path, body) {
    const out = [];
    let page = 1;
    while (page <= 50) {
      const res = await panel.post(path, { page, pageSize: PAGE_SIZE, ...body });
      if (res.status < 200 || res.status >= 300) throw new Error(`1Panel ${path} HTTP ${res.status}`);
      const biz = inspectPanelBiz(res);
      if (!biz.ok) throw new Error(`1Panel ${path} 业务错误: ${biz.message}`);
      const items = getPanelItems(res.data);
      out.push(...items);
      if (items.length < PAGE_SIZE) break;
      page++;
    }
    return out;
  }

  const userGroups = await searchAll('/api/v2/core/enterprise/ai-proxy/groups/search', {});
  const modelGroups = await searchAll('/api/v2/core/enterprise/ai-proxy/model-groups/search', {});

  // 空响应不清表
  if (!userGroups.length && !modelGroups.length) {
    return { userGroups: 0, modelGroups: 0, skipped: true };
  }

  // 批量 UPSERT（用户组）
  if (userGroups.length) {
    for (const g of userGroups) {
      await global.pool.query(`
        INSERT INTO panel_user_groups (panel_group_id, name, qps_limit, token_limit, model_group_ids, model_group_names, api_key_count, synced_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)
        ON CONFLICT (panel_group_id) DO UPDATE SET
          name=EXCLUDED.name, qps_limit=EXCLUDED.qps_limit, token_limit=EXCLUDED.token_limit,
          model_group_ids=EXCLUDED.model_group_ids, model_group_names=EXCLUDED.model_group_names,
          api_key_count=EXCLUDED.api_key_count, synced_at=CURRENT_TIMESTAMP
      `, [
        g.id, g.name, g.qpsLimit || 0, g.tokenLimit || 0,
        JSON.stringify(g.modelGroupIds || []), JSON.stringify(g.modelGroupNames || []), g.apiKeyCount || 0
      ]);
    }
  }

  // 批量 UPSERT（模型组）
  if (modelGroups.length) {
    for (const g of modelGroups) {
      await global.pool.query(`
        INSERT INTO panel_model_groups (panel_group_id, name, models, selection_strategy, synced_at)
        VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)
        ON CONFLICT (panel_group_id) DO UPDATE SET
          name=EXCLUDED.name, models=EXCLUDED.models, selection_strategy=EXCLUDED.selection_strategy, synced_at=CURRENT_TIMESTAMP
      `, [
        g.id, g.name, JSON.stringify(g.models || []), g.selectionStrategy || null
      ]);
    }
  }

  // 第三路: 同步 api-keys 的 groupId 到 portal_api_keys（按 panel_key_id 严格匹配, 匹配不上不更新）
  // 现有 155 个 key 的 group_id 全是默认值 1, 这里写真实值供三层 JOIN 用
  let apiKeysUpdated = 0;
  const keys = await searchAll('/api/v2/core/enterprise/ai-proxy/api-keys/search', {});
  for (const k of keys) {
    // k.id = 1Panel 的 key id(panel_key_id), k.groupId = 真实用户组 id
    if (k.groupId == null) continue;
    const upd = await global.pool.query(
      'UPDATE portal_api_keys SET group_id = $1, synced_at = CURRENT_TIMESTAMP WHERE panel_key_id = $2',
      [k.groupId, k.id]
    );
    apiKeysUpdated += upd.rowCount;
  }

  // 软删: 1Panel 不再返回的组本地置 is_active=FALSE（只对本次有返回时才软删, 防空响应误删）
  const userGroupIds = userGroups.map(g => g.id);
  const modelGroupIds = modelGroups.map(g => g.id);
  const softDeletedUserGroups = (await global.pool.query(
    'UPDATE panel_user_groups SET is_active = FALSE WHERE NOT (panel_group_id = ANY($1)) AND is_active = TRUE',
    [userGroupIds]
  )).rowCount;
  const softDeletedModelGroups = (await global.pool.query(
    'UPDATE panel_model_groups SET is_active = FALSE WHERE NOT (panel_group_id = ANY($1)) AND is_active = TRUE',
    [modelGroupIds]
  )).rowCount;

  return {
    userGroups: userGroups.length,
    modelGroups: modelGroups.length,
    apiKeysUpdated,
    softDeletedUserGroups,
    softDeletedModelGroups,
    skipped: false,
  };
}

/**
 * 同步 1Panel MCP 列表到本地 portal_mcps 表（对齐 syncModelsFromPanel 范式）。
 * 沿用空响应不清表 + inspectPanelBiz 业务码校验。
 */
async function syncMcpsFromPanel() {
  const { inspectPanelBiz } = require('./lib/panel-biz');
  const PAGE_SIZE = 100;
  const allItems = [];

  let page = 1;
  while (page <= 50) {
    const res = await panel.post('/api/v2/ai/mcp/search', { page, pageSize: PAGE_SIZE, name: '' });
    if (res.status < 200 || res.status >= 300) throw new Error(`1Panel mcp/search HTTP ${res.status}`);
    const biz = inspectPanelBiz(res);
    if (!biz.ok) throw new Error(`1Panel mcp/search 业务错误 code=${biz.code}: ${biz.message}`);
    const items = getPanelItems(res.data);
    allItems.push(...items);
    if (items.length < PAGE_SIZE) break;
    page++;
  }

  // 空响应不清表（铁律 6）
  if (!allItems.length) {
    console.warn('[panel] syncMcpsFromPanel: 1Panel 返回空 MCP 列表,跳过本轮 UPSERT 与软删');
    return { mcpCount: 0, skipped: true };
  }

  // 批量 UPSERT（恢复 is_active=TRUE，对齐 syncModels/syncSkills 范式）
  for (const mcp of allItems) {
    await global.pool.query(`
      INSERT INTO portal_mcps (panel_mcp_id, name, type, status, port, base_url, sse_path, output_transport, raw_data, is_active, synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, CURRENT_TIMESTAMP)
      ON CONFLICT (panel_mcp_id) DO UPDATE SET
        name = EXCLUDED.name, type = EXCLUDED.type, status = EXCLUDED.status,
        port = EXCLUDED.port, base_url = EXCLUDED.base_url, sse_path = EXCLUDED.sse_path,
        output_transport = EXCLUDED.output_transport, raw_data = EXCLUDED.raw_data,
        is_active = TRUE, synced_at = CURRENT_TIMESTAMP
    `, [
      String(mcp.id ?? mcp.key ?? ''),
      mcp.name || '',
      mcp.type || '',
      mcp.status || '',
      mcp.port != null ? Number(mcp.port) : null,
      mcp.baseUrl || '',
      mcp.ssePath || '',
      mcp.outputTransport || '',
      JSON.stringify(mcp),
    ]);
  }

  // 软删 1Panel 不再返回的 MCP
  const panelIds = allItems.map(m => String(m.id ?? m.key ?? ''));
  await global.pool.query(
    'UPDATE portal_mcps SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE NOT (panel_mcp_id = ANY($1)) AND is_active = TRUE',
    [panelIds]
  );

  return { mcpCount: allItems.length, skipped: false };
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
  syncMcpsFromPanel,
  downloadPanelSkill,
  syncPanelGroups,
};
