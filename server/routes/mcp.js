const express = require('express');

const router = express.Router();
const { verifyUser } = require('../auth');

/**
 * GET /api/mcp/search
 *
 * 从本地 portal_mcps 表查询 MCP 列表（由同步调度器从 1Panel 定时同步）。
 *
 * Query params:
 *   q        - 搜索名称
 *   page     - 页码，默认 1
 *   pageSize - 每页条数，默认 20，最大 100
 *
 * Response:
 *   { data: items[], pagination: { page, pageSize, total, hasMore } }
 */
router.get('/api/mcp/search', verifyUser, async (req, res) => {
  try {
    const { q = '', page = '1', pageSize = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize) || 20));

    const pool = global.pool;

    // RBAC Phase 2: 登录非超管用户按资源组过滤 MCP（访客/超管/未授权全公开兜底）
    let visibleMcpIds = null;
    if (req.portalUser && !req.portalUser.is_portal_admin) {
      const { getVisibleResourcesForUser } = require('../lib/permission');
      const visible = await getVisibleResourcesForUser(req.portalUser.id);
      // 全公开兜底时 visible.mcp 是 listAll() 返回的行对象数组（含 id/panel_mcp_id），
      // 资源组已勾选时是 panel_mcp_id 字符串数组。只有后者才需要过滤（按 panel_mcp_id）。
      if (Array.isArray(visible.mcp)) {
        if (visible.mcp.length > 0 && typeof visible.mcp[0] === 'string') {
          visibleMcpIds = visible.mcp;
        } else if (visible.mcp.length === 0) {
          // 空交集 → 无可见 MCP
          visibleMcpIds = [];
        }
      }
    }

    const offset = (pageNum - 1) * size;

    // 动态拼 WHERE: is_active 必有, q 搜索 + visibleMcpIds 过滤按需追加
    // visibleMcpIds === null = 全公开兜底（访客/超管/未授权）, 不加 panel_mcp_id 过滤
    // visibleMcpIds 为数组（含空数组）= 只看这些 id（空数组=看不到任何）
    const whereParts = ['is_active = TRUE'];
    const params = [];
    let pi = 1;
    if (q.trim()) {
      whereParts.push(`(name ILIKE $${pi} OR type ILIKE $${pi})`);
      params.push(`%${q.trim()}%`);
      pi++;
    }
    if (visibleMcpIds) {
      whereParts.push(`panel_mcp_id = ANY($${pi})`);
      params.push(visibleMcpIds);
      pi++;
    }
    const where = whereParts.join(' AND ');

    const selectCols = 'id, panel_mcp_id, name, type, status, port, base_url, sse_path, output_transport, synced_at';
    countResult = await pool.query(`SELECT count(*) FROM portal_mcps WHERE ${where}`, params);
    rows = await pool.query(
      `SELECT ${selectCols} FROM portal_mcps WHERE ${where} ORDER BY name LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, size, offset]
    );

    const total = parseInt(countResult.rows[0].count) || 0;

    // 转驼峰，对齐前端 server.baseUrl/server.ssePath 等访问
    const data = rows.rows.map(r => ({
      id: r.panel_mcp_id,
      name: r.name,
      type: r.type,
      status: r.status,
      port: r.port,
      baseUrl: r.base_url,
      ssePath: r.sse_path,
      outputTransport: r.output_transport,
      updatedAt: r.synced_at,
    }));

    res.json({
      data,
      pagination: {
        page: pageNum,
        pageSize: size,
        total,
        hasMore: pageNum * size < total,
      },
    });
  } catch (err) {
    console.error('[mcp] Search error:', err.message);
    res.status(500).json({ error: 'MCP_SEARCH_FAILED', reason: err.message });
  }
});

module.exports = router;
