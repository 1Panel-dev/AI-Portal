const express = require('express');
const { panel, getPanelPayload } = require('../panel');

const router = express.Router();

/**
 * 1Panel 业务错误检查
 * 1Panel 习惯返 HTTP 200 + body.code >= 400 表达业务失败
 */
function panelBizError(response) {
  const data = response?.data;
  if (!data || typeof data !== 'object') return null;
  const code = Number(data.code);
  if (Number.isFinite(code) && code >= 400) {
    return data.message || data.msg || `1Panel business code=${code}`;
  }
  return null;
}

/**
 * GET /api/mcp/search
 *
 * 代理 1Panel MCP 搜索，将前端 GET 参数转为 1Panel POST 请求
 *
 * Query params:
 *   q        - 搜索名称（映射到 1Panel 的 name）
 *   page     - 页码，默认 1
 *   pageSize - 每页条数，默认 20，最大 100
 *
 * Response:
 *   { data: items[], pagination: { page, pageSize, total, hasMore } }
 */
router.get('/api/mcp/search', async (req, res) => {
  try {
    const { q = '', page = '1', pageSize = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize) || 20));

    const response = await panel.post('/api/v2/ai/mcp/search', {
      page: pageNum,
      pageSize: size,
      name: q,
    });

    // HTTP 层错误
    if (response.status < 200 || response.status >= 300) {
      return res.status(502).json({
        error: 'PANEL_UNREACHABLE',
        reason: `1Panel 请求失败: HTTP ${response.status}`,
      });
    }

    // 1Panel 业务码错误
    const bizError = panelBizError(response);
    if (bizError) {
      return res.status(502).json({
        error: 'PANEL_REJECTED',
        reason: `1Panel 业务错误: ${bizError}`,
      });
    }

    // 解包响应
    const payload = getPanelPayload(response.data) || {};
    const items = Array.isArray(payload.items) ? payload.items
                : Array.isArray(payload.list) ? payload.list
                : Array.isArray(payload) ? payload
                : [];

    const total = typeof payload.total === 'number' ? payload.total
                : typeof payload.count === 'number' ? payload.count
                : items.length;

    res.json({
      data: items,
      pagination: {
        page: pageNum,
        pageSize: size,
        total,
        hasMore: pageNum * size < total,
      },
    });
  } catch (err) {
    console.error('[mcp] Search error:', err.message);
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
      return res.status(502).json({
        error: 'PANEL_UNREACHABLE',
        reason: `1Panel 网络不可达: ${err.message}`,
      });
    }
    res.status(500).json({
      error: 'MCP_SEARCH_FAILED',
      reason: err.message,
    });
  }
});

module.exports = router;
