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
const { isBusyError, withBusyRetry } = require('./busy-retry');

const CONCURRENCY = 3;
const CHUNK_GAP_MS = 60;
const MAX_RETRY = 3;
const RETRY_BASE_MS = 200;
// 趋势查询总时限：逐日 = 一天一次管理域调用，30 天 + 限流退避最坏可拖到分钟级，
// 一旦超过反向代理的超时窗口，前端只会拿到 502/504（看起来像「网关没配」）。
// 超时后剩余的天补零（折线仍连续），绝不让统计接口整体超时。
const DEFAULT_DEADLINE_MS = 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  return withBusyRetry(
    () => gw.getUsageStatistics({
      from: day.from,
      to: day.to,
      ...(userId ? { userId } : {}),
    }),
    { maxRetry: MAX_RETRY, baseMs: RETRY_BASE_MS }
  ).then((r) => mapSummary(r && r.summary) || {});
}

/**
 * @param {object} gw 网关适配器
 * @param {object} opts
 * @param {Date|string} [opts.from] 缺省 = 30 天前
 * @param {Date|string} [opts.to]   缺省 = 现在
 * @param {number} [opts.userId]    网关用户 id（不传 = 全平台）
 * @param {number} [opts.deadlineMs] 总时限，超时后剩余天补零
 * @returns {Promise<Array<{name:string, ...summary}>>} 逐日点（失败/超时的天补零）
 */
async function buildDailyUsageTrend(gw, { from, to, userId, deadlineMs = DEFAULT_DEADLINE_MS } = {}) {
  const ranges = buildDayRanges(from, to);
  if (!ranges.length) return [];

  const points = [];
  const deadlineAt = Date.now() + Math.max(1000, deadlineMs);
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const chunk = ranges.slice(i, i + CONCURRENCY);
    // 已过总时限：本批及后续全部补零，不再发请求
    if (Date.now() >= deadlineAt) {
      console.warn(`[gateway-trend] 超过总时限 ${deadlineMs}ms，${chunk.length} 天补零（不阻断统计响应）`);
      chunk.forEach((d) => points.push({ name: d.name, ...ZERO_POINT }));
      continue;
    }
    const remaining = Math.max(500, deadlineAt - Date.now());
    const results = await Promise.allSettled(chunk.map((d) => {
      let timer;
      // 注意: 定时器不能 unref —— 若此刻事件循环里只剩它一个句柄，unref 会让超时不触发，
      // 整批 await 永久挂起。settle 后统一 clearTimeout，不会残留句柄。
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('trend deadline exceeded')), remaining);
      });
      return Promise.race([fetchDayWithRetry(gw, d, userId), deadline])
        .finally(() => clearTimeout(timer));
    }));
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        points.push({ name: chunk[idx].name, ...r.value });
      } else {
        // 重试后仍失败：补零并告警，保证折线连续
        console.warn(`[gateway-trend] ${chunk[idx].name} 拉取失败，补零:`, r.reason && r.reason.message);
        points.push({ name: chunk[idx].name, ...ZERO_POINT });
      }
    });
    if (i + CONCURRENCY < ranges.length && Date.now() < deadlineAt) await sleep(CHUNK_GAP_MS);
  }
  return points.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { buildDailyUsageTrend, buildDayRanges };
