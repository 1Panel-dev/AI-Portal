/**
 * 下载量缓冲计数器
 *
 * 解决问题:每次下载都执行 UPDATE skills SET downloads = downloads + 1 → 热点行写入,
 * 高 QPS 下会造成行锁竞争、WAL 膨胀、连接池占用。
 *
 * 策略:内存累加,定时(默认 30s)批量 flush 到数据库;每个 skillId 一次 UPDATE。
 * 多实例部署天然安全——各实例 flush 时用的是 downloads + N 增量语法,不会互相覆盖。
 *
 * 数据保护:
 *   - 进程退出 (SIGTERM/SIGINT) 时,index.js 会主动调 flush() 落盘
 *   - 极端情况(kill -9、断电)可能丢失最近 N 秒的累计——对"统计数字"语义可接受
 */

let pool = null;
let timer = null;
let flushing = false; // 防止两次 flush 并发执行(setInterval 与 shutdown 同时触发)
const counter = new Map(); // skillId → 累计次数

const DEFAULT_INTERVAL_MS = 30 * 1000; // 30 秒

function increment(skillId) {
  if (!skillId) return;
  counter.set(skillId, (counter.get(skillId) || 0) + 1);
}

/**
 * 把内存里所有累计 flush 到 DB。
 * 用单条多 CASE 的 UPDATE 一次性更新所有受影响的行,避免 N 次往返。
 */
async function flush() {
  if (flushing) return;
  if (counter.size === 0) return;
  if (!pool) {
    console.warn('[downloadCounter] pool 未初始化,跳过 flush');
    return;
  }

  flushing = true;
  // 先复制再清空,避免 flush 期间新增的下载丢失到 in-flight 批次
  const snapshot = new Map(counter);
  counter.clear();

  try {
    // 用 UPDATE ... FROM (VALUES ...) 一次性更新多行,比 N 次单行 UPDATE 高效
    const entries = [...snapshot.entries()];
    const valuesSql = entries
      .map((_, i) => `($${i * 2 + 1}::varchar, $${i * 2 + 2}::bigint)`)
      .join(', ');
    const params = entries.flatMap(([id, delta]) => [id, delta]);

    await pool.query(
      `UPDATE skills s
         SET downloads = downloads + v.delta
       FROM (VALUES ${valuesSql}) AS v(id, delta)
       WHERE s.id = v.id`,
      params
    );
  } catch (err) {
    // 写失败时把累计加回去,等下次 flush 重试,避免数据丢失
    console.error('[downloadCounter] flush 失败,累计已回滚到内存:', err.message);
    for (const [id, delta] of snapshot.entries()) {
      counter.set(id, (counter.get(id) || 0) + delta);
    }
  } finally {
    flushing = false;
  }
}

function start(dbPool, intervalMs = DEFAULT_INTERVAL_MS) {
  pool = dbPool;
  if (timer) return; // 防止重复启动
  timer = setInterval(() => {
    flush().catch(err => console.error('[downloadCounter] interval flush 异常:', err));
  }, intervalMs);
  // unref 让定时器不阻止进程退出
  if (timer.unref) timer.unref();
  console.log(`📊 下载量计数器已启动 (间隔 ${intervalMs / 1000}s)`);
}

/**
 * 进程退出前调用,确保内存累计落盘
 */
async function shutdown() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await flush();
}

// 暴露内部状态便于调试/测试
function _stats() {
  return { pending: counter.size, total: [...counter.values()].reduce((a, b) => a + b, 0) };
}

module.exports = {
  increment,
  flush,
  start,
  shutdown,
  _stats,
};
