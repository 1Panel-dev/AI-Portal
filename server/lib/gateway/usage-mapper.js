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
  return {
    requestCount: toNum(agg.requestCount),
    failedRequests: 0, // 网关统计无失败维度
    promptTokens: toNum(agg.inputTokens),
    completionTokens: toNum(agg.outputTokens),
    totalTokens: toNum(agg.totalTokens),
    cachedTokens: toNum(agg.cachedTokens),
  };
}

/** UsageDistributionItem[] → 门户分布项（补 promptTokens/completionTokens 命名） */
function mapDistribution(arr) {
  return (Array.isArray(arr) ? arr : []).map(d => ({
    id: d.id ?? null,
    key: d.key || '',
    name: d.name || '',
    deleted: !!d.deleted,
    requestCount: toNum(d.requestCount),
    promptTokens: toNum(d.inputTokens),
    completionTokens: toNum(d.outputTokens),
    totalTokens: toNum(d.totalTokens),
    cachedTokens: toNum(d.cachedTokens),
  }));
}

/** token-trend buckets → trends[]（name=北京日期; 桶无请求数, requestCount=0;
 *  totalTokens=三项之和 —— ProfileView 月度图按 requestCount+totalTokens>0 过滤空数据,
 *  网关桶无请求数, 不补 totalTokens 会被整列过滤成「暂无数据」） */
function mapTrends(trendRaw) {
  const dayName = (iso) => {
    try {
      return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
    } catch { return String(iso || '').slice(0, 10); }
  };
  return ((trendRaw && trendRaw.buckets) || []).map(b => {
    const item = {
      name: dayName(b.start),
      promptTokens: toNum(b.inputTokens),
      completionTokens: toNum(b.outputTokens),
      cachedTokens: toNum(b.cachedTokens),
      requestCount: 0,
    };
    item.totalTokens = item.promptTokens + item.completionTokens + item.cachedTokens;
    return item;
  });
}

module.exports = { toNum, mapSummary, mapDistribution, mapTrends };
