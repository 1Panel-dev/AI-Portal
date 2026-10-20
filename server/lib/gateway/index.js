/**
 * GatewayAdapter 注册中心 —— V2 网关抽象层入口
 *
 * 用法（V2 迁移时）：
 *   const { getGateway, reloadGateway } = require('./lib/gateway');
 *   // 启动时（app.js）：await getGateway(global.pool);  // 触发 init
 *   // 业务调用：
 *   const gw = await getGateway(global.pool);
 *   const rows = await gw.listModels();
 *   // 管理后台保存网关配置后：await reloadGateway(global.pool);
 *
 * Provider 选择：
 *   system_config 表 gateway_provider = '1panel'（默认）| 'ai-gateway'，
 *   环境变量 GATEWAY_PROVIDER 可作为兜底初值（DB 优先，与 1panel-api 配置优先级一致）。
 *
 * 当前状态（重要）：
 *   这是 V2 骨架，尚无任何现有代码路径 import 本目录 —— 现有
 *   panel.js / portal.js / admin.js / modelSync.js 行为完全不变。
 *   V2 按 contract.js 的迁移清单逐步把调用方切到 getGateway()。
 */

'use strict';

const providers = {
  '1panel': require('./providers/1panel'),
  'ai-gateway': require('./providers/ai-gateway'),
};

let cachedName = null;   // 当前已加载的 provider 名
let cachedAdapter = null;
let inited = false;

async function readProviderName(pool) {
  try {
    const r = await pool.query("SELECT value FROM system_config WHERE key = 'gateway_provider' LIMIT 1");
    if (r.rowCount > 0 && r.rows[0].value) return String(r.rows[0].value).trim();
  } catch { /* 表不存在时走默认 */ }
  return (process.env.GATEWAY_PROVIDER || '1panel').trim();
}

/**
 * 取当前网关适配器（单例，按 gateway_provider 缓存）。
 * provider 切换或首次调用时自动 init（加载 DB 配置）。
 */
async function getGateway(pool) {
  const name = await readProviderName(pool);
  const mod = providers[name];
  if (!mod) {
    throw new Error(`未知网关 provider: "${name}"（可选: ${Object.keys(providers).join(', ')}）`);
  }
  if (cachedName !== name) {
    cachedName = name;
    cachedAdapter = mod;
    inited = false;
  }
  if (!inited) {
    await cachedAdapter.init(pool);
    inited = true;
  }
  return cachedAdapter;
}

/** 管理后台保存网关配置后调用：重读 provider + 配置热重载 */
async function reloadGateway(pool) {
  const name = await readProviderName(pool);
  if (name !== cachedName) {
    // provider 切换：丢弃缓存，下次 getGateway 重新 init
    cachedName = null;
    cachedAdapter = null;
    inited = false;
    return;
  }
  if (cachedAdapter) await cachedAdapter.reload(pool);
}

/** 当前 provider 名（供日志/诊断页展示；未初始化时读环境变量默认值） */
function currentProviderName() {
  return cachedName || (process.env.GATEWAY_PROVIDER || '1panel').trim();
}

module.exports = { getGateway, reloadGateway, currentProviderName, providers };
