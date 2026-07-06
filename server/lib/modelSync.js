/**
 * 模型列表定时同步调度器
 *
 * 设计：薄调度层,真正的同步逻辑复用 panel.js 的 syncModelsFromPanel(),不重复造轮子。
 *
 * 行为：
 *   - 启动后每 10 分钟从 1Panel 拉一次最新模型列表,UPSERT 到 portal_models 表
 *   - 启动时不立即同步（首次同步由 /api/models 在表为空时的懒加载兜底,避免启动慢）
 *   - 同步失败不抛错,只记日志——保证调度器不会因为远端临时挂掉而停摆
 *   - 进程退出时 stop() 清掉 timer
 */

const { syncModelsFromPanel } = require('../panel');

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 分钟

let timer = null;
let running = false; // 防止上一轮还没跑完,下一轮就触发(重入保护)
let currentInterval = DEFAULT_INTERVAL_MS;

async function tick() {
  if (running) {
    console.warn('[modelSync] 上次同步未完成,跳过本轮');
    return;
  }
  running = true;
  try {
    const result = await syncModelsFromPanel();
    console.log(`📡 [modelSync] 同步完成: ${result.modelCount} 个模型 / ${result.backendCount} 个 backend`);
  } catch (err) {
    // 远端临时挂掉不应该让调度器死掉,记日志继续等下一轮
    console.error('[modelSync] 同步失败,等待下一轮:', err.message, '\n', err.stack);
  } finally {
    running = false;
  }
}

function start(intervalMs = DEFAULT_INTERVAL_MS) {
  if (timer) return; // 防止重复启动
  currentInterval = intervalMs;
  timer = setInterval(() => {
    tick().catch(err => console.error('[modelSync] tick 异常:', err));
  }, intervalMs);
  // unref 让定时器不阻止进程退出
  if (timer.unref) timer.unref();
  console.log(`📡 模型同步调度器已启动 (间隔 ${intervalMs / 1000}s)`);
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

module.exports = {
  start,
  stop,
  tick, // 暴露给手动触发或测试
  restart,
  isRunning,
};
