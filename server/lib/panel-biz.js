// server/lib/panel-biz.js
// 1Panel 业务码校验 + api-keys 翻页查询 - 从 portal.js/admin.js 抽取共享
// 纯函数, 依赖 panel(1panel-api) + getPanelItems(panel.js), 不依赖 req/res
//
// 等价重构: 函数逻辑与原 portal.js/admin.js 中的定义完全一致, 仅搬家不改行为。
const { panel, getPanelItems } = require('../panel');

/**
 * 1Panel 业务失败识别（HTTP 已 2xx, 但 body.code >= 400）。
 * 返回 { ok, code, message }。
 */
function inspectPanelBiz(panelRes) {
  const data = panelRes?.data;
  if (!data || typeof data !== 'object') return { ok: true, code: null, message: '' };
  const code = Number(data.code);
  const message = data.message || data.msg || '';
  if (Number.isFinite(code) && code >= 400) {
    return { ok: false, code, message: String(message) };
  }
  return { ok: true, code: Number.isFinite(code) ? code : null, message: String(message) };
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50; // 安全上限, 防远端 total 异常死循环 (与原 portal.js listPanelKeysOfUser 一致: page < 50)

/**
 * 翻全页拿 1Panel api-keys。
 * @param {function} filter - 可选过滤函数 (item) => boolean; 不传则返回全部
 * @returns panelKeyItem[]
 *
 * 注: 与原 listPanelKeysOfUser 行为一致 -- 仅校验 HTTP status, 不对 body.code 做
 * inspectPanelBiz 校验。调用方(list/reveal/reset 路径)各自在拿到 key 后按需校验,
 * 这里加业务码校验会改变现有 try/catch 流程, 属于行为变更, 暂不做。
 */
async function listPanelKeys(filter) {
  const out = [];
  let page = 1;
  while (page < MAX_PAGES) {
    const res = await panel.post('/api/v2/core/enterprise/ai-proxy/api-keys/search', {
      page, pageSize: PAGE_SIZE, info: '',
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`1Panel api-keys/search HTTP ${res.status}`);
    }
    const items = getPanelItems(res.data);
    const picked = typeof filter === 'function' ? items.filter(filter) : items;
    out.push(...picked);
    if (items.length < PAGE_SIZE) break;
    page++;
  }
  return out;
}

/** 翻全页, 按 panel userId 过滤（复用 listPanelKeys） */
async function listPanelKeysOfUser(panelUserId) {
  return listPanelKeys(k => k.userId === panelUserId);
}

/** 翻全页, 返回全部 key（供 getUserAllowedModels 批量复用, 一次请求多次内存查询） */
async function listAllPanelKeys() {
  return listPanelKeys();
}

module.exports = { inspectPanelBiz, listPanelKeys, listPanelKeysOfUser, listAllPanelKeys };
