const express = require('express');

const router = express.Router();

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
router.get('/api/mcp/search', async (req, res) => {
  try {
    const { q = '', page = '1', pageSize = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize) || 20));

    const pool = global.pool;
    const offset = (pageNum - 1) * size;

    // 查 portal_mcps 本地表
    let countResult, rows;
    if (q.trim()) {
      const like = `%${q.trim()}%`;
      countResult = await pool.query(
        'SELECT count(*) FROM portal_mcps WHERE is_active = TRUE AND (name ILIKE $1 OR type ILIKE $1)',
        [like]
      );
      rows = await pool.query(
        'SELECT id, panel_mcp_id, name, type, synced_at FROM portal_mcps WHERE is_active = TRUE AND (name ILIKE $1 OR type ILIKE $1) ORDER BY name LIMIT $2 OFFSET $3',
        [like, size, offset]
      );
    } else {
      countResult = await pool.query(
        'SELECT count(*) FROM portal_mcps WHERE is_active = TRUE'
      );
      rows = await pool.query(
        'SELECT id, panel_mcp_id, name, type, synced_at FROM portal_mcps WHERE is_active = TRUE ORDER BY name LIMIT $1 OFFSET $2',
        [size, offset]
      );
    }

    const total = parseInt(countResult.rows[0].count) || 0;

    res.json({
      data: rows.rows,
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
