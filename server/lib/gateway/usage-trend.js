'use strict';

/**
 * 网关逐日用量趋势
 *
 * 背景：网关 /admin/usage-statistics 不支持按天分桶，只能「一天一个 from/to 区间」地查。
 * 但网关管理域有全局限流：短时间高频/高并发调用会返回
 *   503 {"code":"management_api_busy"}
 * 原实现（并发 6、失败的天静默丢弃）导致个人中心/管理端趋势图经常整段空白
 * （汇总只有 1 次调用所以正常，趋势 30 次调用被限流后全丢）。
 *
 * 这里统一做三件事：
 *   1. 低并发（3）+ 批次间小间隔，避开限流窗口
 *   2. 命中 503 指数退避重试（最多 3 次）
 *   3. 失败的天补零（而不是从数组里消失），保证折线连续、口径可解释
 */

const { mapSummary } = require('./usage-mapper');

const CONCURRENCY = 3;
const CHUNK_GAP_MS = 60;
const MAX_RETRY = 3;
const RETRY_BASE_MS = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isBusyError(e) {
  if (!e) return false;
  // adapter 抛出的错误带 status；管理域限流是 503 + management_api_busy
  const status = e.status ?? e.statusCode;
  if (status === 503 || status === 429) return true;
  const msg = String(e.message || '');
  return /management_api_busy|too many requests|busy/i.test(msg);
}

/** 以北京时区为边界，把 [from, to) 切成逐日区间 */
function buildDayRanges(from, to) {
  const start = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const end = to ? new Date(to) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() >= end.getTime()) return [];

  const startDay = new Date(
    `${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(start)}T00:00:00+08:00`
  );
  const dayCount = Math.max(1, Math.ceil((end.getTime() - startDay.getTime()) / 86400000));
  const ranges = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(startDay.getTime() + i * 86400000);
    // 只保留与 [from,to) 有交集的天
    if (d.getTime() >= end.getTime()) break;
    ranges.push({
      name: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(d),
      from: new Date(Math.max(d.getTime(), start.getTime())).toISOString(),
      to: new Date(Math.min(d.getTime() + 86400000, end.getTime())).toISOString(),
    });
  }
  return ranges;
}

const ZERO_POINT = { requestCount: 0, failedRequests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0 };

async function fetchDayWithRetry(gw, day, userId) {
  let attempt = 0;
  for (;;) {
    try {
      const r = await gw.getUsageStatistics({
        from: day.from,
        to: day.to,
        ...(userId ? { userId } : {}),
      });
      return mapSummary(r && r.summary) || {};
    } catch (e) {
      if (isBusyError(e) && attempt < MAX_RETRY) {
        attempt += 1;
        await sleep(RETRY_BASE_MS * attempt);
        continue;
      }
      throw e;
    }
  }
}

/**
 * @param {object} gw 网关适配器
 * @param {object} opts
 * @param {Date|string} [opts.from] 缺省 = 30 天前
 * @param {Date|string} [opts.to]   缺省 = 现在
 * @param {number} [opts.userId]    网关用户 id（不传 = 全平台）
 * @returns {Promise<Array<{name:string, ...summary}>>} 逐日点（失败的天补零）
 */
async function buildDailyUsageTrend(gw, { from, to, userId } = {}) {
  const ranges = buildDayRanges(from, to);
  if (!ranges.length) return [];

  const points = [];
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const chunk = ranges.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((d) => fetchDayWithRetry(gw, d, userId)));
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        points.push({ name: chunk[idx].name, ...r.value });
      } else {
        // 重试后仍失败：补零并告警，保证折线连续
        console.warn(`[gateway-trend] ${chunk[idx].name} 拉取失败，补零:`, r.reason && r.reason.message);
        points.push({ name: chunk[idx].name, ...ZERO_POINT });
      }
    });
    if (i + CONCURRENCY < ranges.length) await sleep(CHUNK_GAP_MS);
  }
  return points.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { buildDailyUsageTrend, buildDayRanges };
