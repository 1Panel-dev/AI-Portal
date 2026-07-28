/**
 * MCP 列表定时同步调度器
 *
 * 与 modelSync / skillsSync 同款设计: 薄调度层 + 重入保护 + 失败兜底
 * 默认 10 分钟同步一次 1Panel mcp/search
 * 支持运行时变更间隔 / 启停
 */

const { syncMcpsFromPanel } = require('../panel');

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;

let timer = null;
let running = false;
let currentInterval = DEFAULT_INTERVAL_MS;

async function tick() {
  if (running) {
    console.warn('[mcpSync] 上次同步未完成, 跳过本轮');
    return;
  }
  running = true;
  try {
    const result = await syncMcpsFromPanel();
    console.log(`📡 [mcpSync] 同步完成: ${result.mcpCount} 个 MCP` + (result.skipped ? ' (跳过)' : ''));
  } catch (err) {
    console.error('[mcpSync] 同步失败, 等待下一轮:', err.message);
  } finally {
    running = false;
  }
}

function start(intervalMs = DEFAULT_INTERVAL_MS) {
  if (timer) return;
  currentInterval = intervalMs;
  timer = setInterval(() => {
    tick().catch(err => console.error('[mcpSync] tick 异常:', err));
  }, intervalMs);
  if (timer.unref) timer.unref();
  console.log(`📡 MCP 同步调度器已启动 (间隔 ${intervalMs / 1000}s)`);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function restart(intervalMs) {
  stop();
  start(intervalMs || currentInterval);
}

function isRunning() {
  return !!timer;
}

module.exports = { start, stop, tick, restart, isRunning };
