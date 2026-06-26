// OAuth adapter 注册中心
// 首发只注册 wecom;新接入 provider 只需在此 require + register

const wecom = require('./wecom');

const adapters = new Map();

function registerAdapter(adapter) {
  if (!adapter || !adapter.provider) {
    throw new Error('adapter must have a provider field');
  }
  adapters.set(adapter.provider, adapter);
}

function getAdapter(provider) {
  return adapters.get(provider) || null;
}

function getProviderAdapter(provider) {
  return getAdapter(provider);
}

function listAdapters() {
  return Array.from(adapters.values());
}

async function getEnabledProviders(pool) {
  const r = await pool.query(`
    SELECT provider, display_name AS "displayName"
    FROM oauth_providers
    WHERE enabled = TRUE
    ORDER BY sort_order ASC, display_name ASC, provider ASC
  `);
  return r.rows;
}

/**
 * 任一 provider enabled=true 时,自助注册自动关闭
 */
async function isAnyProviderEnabled(pool) {
  const r = await pool.query('SELECT 1 FROM oauth_providers WHERE enabled = TRUE LIMIT 1');
  return r.rowCount > 0;
}

// 注册首发 adapter
registerAdapter(wecom);

module.exports = {
  getAdapter,
  getProviderAdapter,
  listAdapters,
  registerAdapter,
  getEnabledProviders,
  isAnyProviderEnabled,
};
