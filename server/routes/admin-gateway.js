// server/routes/admin-gateway.js
// V2 独立网关配置接口（M1 配置层）
// GET  /api/admin/gateway-config       读取配置（凭证脱敏 + 剩余天数）
// PUT  /api/admin/gateway-config       保存配置（写 system_config + 热重载适配器）
// POST /api/admin/gateway-config/test  测试连接（用表单当前值，可不落库先测）
//
// 权限沿用 system:config；配置键约定见 lib/gateway/contract.js 头注释。

const express = require('express');
const { verifyUser, requirePermission } = require('../auth');
const { getGateway, reloadGateway, currentProviderName, providers } = require('../lib/gateway');

const router = express.Router();
const pool = () => global.pool;

const GATEWAY_CONFIG_KEYS = [
  'gateway_provider',
  'gateway_base_url',
  'gateway_api_key',
  'gateway_sync_api_key',
  'gateway_default_user_group_id',
  'gateway_api_timeout',
  'gateway_api_key_updated_at',
  'gateway_api_key_never_expires',
];

const PROVIDERS = ['1panel', 'ai-gateway'];
const DEFAULT_CREDENTIAL_DAYS = 365; // 网关凭证最长有效期，用于剩余天数估算

function maskApiKey(key) {
  if (!key) return '';
  return key.length > 12 ? key.slice(0, 8) + '****' + key.slice(-4) : '****';
}

async function readGatewayConfig() {
  const r = await pool().query(
    `SELECT key, value, updated_at FROM system_config WHERE key = ANY($1)`,
    [GATEWAY_CONFIG_KEYS]
  );
  const map = {};
  for (const row of r.rows) map[row.key] = { value: row.value, updated_at: row.updated_at };

  const apiKey = map.gateway_api_key?.value || '';
  const syncApiKey = map.gateway_sync_api_key?.value || '';
  const provider = map.gateway_provider?.value || '1panel';
  const updatedAt = map.gateway_api_key_updated_at?.updated_at || null;
  const neverExpires = (map.gateway_api_key_never_expires?.value || '') === 'true';

  // 剩余天数按「凭证写入时间 + 最长有效期」估算（网关不提供凭证元信息查询，见设计文档 D-07）；
  // 用户标记「永久有效」时返回 null，前端显示永久徽章而非倒计时
  let credentialDaysRemaining = null;
  if (apiKey && !neverExpires && updatedAt) {
    // Math.ceil：DB 时钟可能略超前，避免差值为负时 floor 出多算一天
    const days = DEFAULT_CREDENTIAL_DAYS - Math.ceil((Date.now() - new Date(updatedAt).getTime()) / 86400000);
    credentialDaysRemaining = Math.max(0, days);
  }

  return {
    provider,
    baseUrl: map.gateway_base_url?.value || '',
    apiKeyConfigured: !!apiKey,
    apiKeyMasked: maskApiKey(apiKey),
    // 模型同步专用 Key（用户域 /v1/models 凭证，与 admin token 不同域）
    syncApiKeyConfigured: !!syncApiKey,
    syncApiKeyMasked: maskApiKey(syncApiKey),
    defaultUserGroupId: Number(map.gateway_default_user_group_id?.value) || null,
    timeout: Number(map.gateway_api_timeout?.value) || 10000,
    apiKeyUpdatedAt: updatedAt,
    neverExpires,
    credentialDaysRemaining,
    activeProvider: currentProviderName(),
  };
}

function validateGatewayConfig(body) {
  const provider = String(body.provider || '').trim();
  if (!PROVIDERS.includes(provider)) {
    return { error: `provider 仅支持: ${PROVIDERS.join(' / ')}` };
  }
  const baseUrl = String(body.baseUrl || '').trim();
  if (provider === 'ai-gateway' && !/^https?:\/\//i.test(baseUrl)) {
    return { error: '网关地址需以 http:// 或 https:// 开头' };
  }
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    return { error: '网关地址需以 http:// 或 https:// 开头' };
  }
  const defaultUserGroupId = body.defaultUserGroupId == null || body.defaultUserGroupId === ''
    ? null : Number(body.defaultUserGroupId);
  if (provider === 'ai-gateway' && (!Number.isInteger(defaultUserGroupId) || defaultUserGroupId < 1)) {
    return { error: '切换到 AI-Gateway 前必须配置默认用户组 ID（企微注册代建用户需要）' };
  }
  const timeout = Number(body.timeout) || 10000;
  if (timeout < 1000 || timeout > 60000) {
    return { error: '超时时间需在 1000-60000ms 之间' };
  }
  return { provider, baseUrl, defaultUserGroupId, timeout, apiKey: String(body.apiKey || '').trim(), syncApiKey: String(body.syncApiKey || '').trim() };
}

async function readSavedConnection() {
  const r = await pool().query(
    `SELECT key, value FROM system_config WHERE key = ANY($1)`,
    [['gateway_base_url', 'gateway_api_key', 'gateway_api_timeout']]
  );
  const map = {};
  for (const row of r.rows) map[row.key] = row.value;
  return {
    baseUrl: map.gateway_base_url || '',
    apiKey: map.gateway_api_key || '',
    timeout: Number(map.gateway_api_timeout) || undefined,
  };
}

/**
 * 解析「测试连接 / 拉取选项」的连接参数：
 * 表单值优先（支持首次配置——provider 尚未切换、配置尚未保存），缺省回落已保存值。
 * 返回 { mod, opts }：mod = 按表单 provider 直接取的适配器模块（不经 getGateway 缓存）。
 */
async function resolveConnectionFor(body) {
  const provider = String(body?.provider || '').trim();
  if (!PROVIDERS.includes(provider)) {
    throw Object.assign(new Error(`provider 仅支持: ${PROVIDERS.join(' / ')}`), { code: 'invalid_request' });
  }
  const saved = await readSavedConnection();
  const opts = {};
  if (provider === 'ai-gateway') {
    // gateway_base_url / gateway_api_key 是 AI-Gateway 专属配置，
    // 不能喂给 1Panel 适配器当覆盖值（否则 1Panel 测试会连到网关地址）
    opts.baseUrl = String(body?.baseUrl || '').trim() || saved.baseUrl || undefined;
    opts.apiKey = String(body?.apiKey || '').trim() || saved.apiKey || undefined;
    opts.timeout = Number(body?.timeout) || saved.timeout || undefined;
  }
  return { mod: providers[provider], opts };
}

// ---- 读取 ----
router.get('/api/admin/gateway-config', verifyUser, requirePermission('system:config'), async (req, res) => {
  try {
    res.json({ data: await readGatewayConfig() });
  } catch (e) {
    res.status(500).json({ error: '读取独立网关配置失败', reason: e.message });
  }
});

// ---- 保存 ----
router.put('/api/admin/gateway-config', verifyUser, requirePermission('system:config'), async (req, res) => {
  const v = validateGatewayConfig(req.body || {});
  if (v.error) return res.status(400).json({ error: v.error });

  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const upsert = async (key, value) => {
      if (value === undefined) return;
      await client.query(
        `INSERT INTO system_config (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
    };
    await upsert('gateway_provider', v.provider);
    if (v.baseUrl || v.provider === 'ai-gateway') await upsert('gateway_base_url', v.baseUrl);
    // apiKey 传空 = 保留旧值（前端脱敏展示，不回传明文）
    if (v.apiKey) {
      await upsert('gateway_api_key', v.apiKey);
      await upsert('gateway_api_key_updated_at', new Date().toISOString());
    }
    await upsert('gateway_api_key_never_expires', req.body?.neverExpires === true ? 'true' : 'false');
    // 同步专用 Key：空 = 保留旧值；传 "__CLEAR__" 才真正清空（前端「清除」按钮用）
    if (v.syncApiKey === '__CLEAR__') {
      await upsert('gateway_sync_api_key', '');
    } else if (v.syncApiKey) {
      await upsert('gateway_sync_api_key', v.syncApiKey);
    }
    await upsert('gateway_default_user_group_id', v.defaultUserGroupId == null ? '' : String(v.defaultUserGroupId));
    await upsert('gateway_api_timeout', String(v.timeout));
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    return res.status(500).json({ error: '保存独立网关配置失败', reason: e.message });
  }
  client.release();

  // 热重载适配器（provider 切换 / 凭证更新立即生效，无需重启）
  try {
    await reloadGateway(pool());
  } catch (e) {
    // 配置已落库，重载失败不回滚——下次 getGateway 会按新 provider 重新 init
    console.error('[gateway-config] reloadGateway 失败:', e.message);
  }

  res.json({ data: await readGatewayConfig() });
});

// ---- 测试连接（用表单当前值，支持首次配置：provider 尚未切换/配置尚未保存）----
router.post('/api/admin/gateway-config/test', verifyUser, requirePermission('system:config'), async (req, res) => {
  try {
    const { mod, opts } = await resolveConnectionFor(req.body);
    await mod.verifyConnection(opts);
    res.json({ ok: true, provider: String(req.body?.provider || '').trim() });
  } catch (e) {
    console.error(`[gateway-config] 测试连接失败:`, e.message);
    const status = e.code === 'invalid_request' ? 400 : 502;
    res.status(status).json({
      error: status === 400 ? e.message : '连接失败',
      reason: status === 400 ? undefined : e.message,
      code: e.code || 'GATEWAY_UNREACHABLE',
    });
  }
});

// ---- 用户组下拉选项（配置页「默认用户组」用；表单值覆盖，首次配置未保存也能拉）----
router.post('/api/admin/gateway-config/user-group-options', verifyUser, requirePermission('system:config'), async (req, res) => {
  try {
    const { mod, opts } = await resolveConnectionFor(req.body);
    if (typeof mod.listUserGroupOptions !== 'function') {
      return res.status(400).json({ error: `provider (${mod.name}) 不支持拉取用户组选项` });
    }
    const items = await mod.listUserGroupOptions(opts);
    res.json({ data: items });
  } catch (e) {
    console.error('[gateway-config] 拉取用户组选项失败:', e.message);
    res.status(502).json({ error: '拉取用户组失败', reason: e.message, code: e.code || 'GATEWAY_UNREACHABLE' });
  }
});

module.exports = router;
