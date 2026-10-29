/**
 * 网关统计响应 → 门户统计页结构（1Panel 口径）映射器。
 *
 * admin.js（管理端全量统计）与 portal.js（个人中心用量）共用。
 * 网关契约：GET /admin/usage-statistics 返回 { range, summary, users[], userGroups[],
 * models[], modelGroups[], upstreamAccounts[], providers[] }，所有计数为十进制字符串；
 * GET /admin/overview/token-trend 返回滚动窗口 buckets（无请求数、仅最近 30 天）。
 *
 * 映射规则：
 *   - 计数十进制字符串 → 数值；inputTokens/outputTokens → promptTokens/completionTokens
 *   - 网关无失败请求维度 → failedRequests=0
 *   - 分布维度对齐 1Panel 语义：accounts←upstreamAccounts、groups←userGroups
 *   - 趋势桶 name=北京日期（timezoneOffsetMinutes=480 与网关分桶边界一致），requestCount=0
 */

'use strict';

function toNum(v) {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : 0;
}

/** UsageAggregate → 门户 summary */
function mapSummary(s) {
  const agg = s || {};
  const promptTokens = toNum(agg.inputTokens);
  const completionTokens = toNum(agg.outputTokens);
  return {
    requestCount: toNum(agg.requestCount),
    failedRequests: 0, // 网关统计无失败维度
    promptTokens,
    completionTokens,
    // 总量口径: 输入 + 输出, 缓存是独立维度, 不叠加到总量
    // 网关 raw.totalTokens 已包含 cachedTokens 时, 用 input+output 保证口径正确
    totalTokens: promptTokens + completionTokens,
    cachedTokens: toNum(agg.cachedTokens),
  };
}

/** UsageDistributionItem[] → 门户分布项（补 promptTokens/completionTokens 命名） */
function mapDistribution(arr) {
  return (Array.isArray(arr) ? arr : []).map(d => {
    const promptTokens = toNum(d.inputTokens);
    const completionTokens = toNum(d.outputTokens);
    return {
      id: d.id ?? null,
      key: d.key || '',
      name: d.name || '',
      deleted: !!d.deleted,
      requestCount: toNum(d.requestCount),
      promptTokens,
      completionTokens,
      // 总量口径: 输入 + 输出, 缓存独立
      totalTokens: promptTokens + completionTokens,
      cachedTokens: toNum(d.cachedTokens),
    };
  });
}

/** token-trend buckets → trends[]（name=北京日期; 桶无请求数, requestCount=0;
 *  totalTokens=输入+输出 —— 缓存独立维度, 不叠加到总量;
 *  网关桶无请求数, 不补 totalTokens 会被整列过滤成「暂无数据」） */
function mapTrends(trendRaw) {
  const dayName = (iso) => {
    try {
      return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
    } catch { return String(iso || '').slice(0, 10); }
  };
  return ((trendRaw && trendRaw.buckets) || []).map(b => {
    const promptTokens = toNum(b.inputTokens);
    const completionTokens = toNum(b.outputTokens);
    return {
      name: dayName(b.start),
      promptTokens,
      completionTokens,
      cachedTokens: toNum(b.cachedTokens),
      requestCount: 0,
      // 总量口径: 输入 + 输出, 缓存独立维度
      totalTokens: promptTokens + completionTokens,
    };
  });
}

module.exports = { toNum, mapSummary, mapDistribution, mapTrends };
