'use strict';

/**
 * AI-Gateway 管理域 503 限流退避重试（共享工具）
 *
 * 背景：网关管理域有全局并发/频率限流，超限返回
 *   503 {"code":"management_api_busy"}（也可能 429）
 * 页面一次加载会并发多个管理域调用（主汇总 + 排行升序 + 逐日趋势），
 * 任何一次调用只要没做退避重试，就会立刻撞限流并把整个接口打成 502
 * （实测：主汇总连续 3 次 503（56/57/79ms）后直接抛异常，而趋势的重试调用随后全部 200）。
 *
 * 所以：所有直接调用 gw.getUsageStatistics 的地方都必须过 withBusyRetry。
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isBusyError(e) {
  if (!e) return false;
  // adapter 抛出的错误带 status；管理域限流是 503 + management_api_busy
  const status = e.status ?? e.statusCode;
  if (status === 503 || status === 429) return true;
  const msg = String(e.message || '');
  return /management_api_busy|too many requests|busy/i.test(msg);
}

/**
 * 对管理域调用做 503/429 指数退避重试。
 * @param {() => Promise<any>} fn 实际调用（每次重试重新执行）
 * @param {object} [opts]
 * @param {number} [opts.maxRetry=4] 额外重试次数（不含首次）
 * @param {number} [opts.baseMs=250] 首次退避时长，之后逐次翻倍
 * @param {(e: Error, attempt: number) => void} [opts.onRetry] 重试回调（日志用）
 * @returns {Promise<any>} fn 的结果；非 busy 错误原样抛出，重试耗尽后抛最后一次错误
 */
async function withBusyRetry(fn, { maxRetry = 4, baseMs = 250, onRetry } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      if (isBusyError(e) && attempt < maxRetry) {
        attempt += 1;
        const delay = baseMs * attempt;
        try { onRetry && onRetry(e, attempt); } catch { /* 忽略日志回调异常 */ }
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
}

module.exports = { isBusyError, withBusyRetry, sleep };
