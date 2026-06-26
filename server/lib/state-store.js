const crypto = require('crypto');

/**
 * 一次性 state 存储,内存实现。TTL 用 expiresAt 标记,take 时按需检查 +
 * 一个低频清扫器避免长期不取的 state 永远占内存。
 *
 * 多进程/多实例部署时此实现不够用(state 不共享),需改为 DB/Redis;
 * 当前单容器单 Node 进程部署 OK。
 */
function createStateStore(ttlMs = 10 * 60 * 1000) {
  const map = new Map();

  // 每 60 秒清扫一次过期项
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of map) {
      if (v.expiresAt <= now) map.delete(k);
    }
  }, 60_000);
  if (sweeper.unref) sweeper.unref();   // 不阻止进程退出

  function put(payload) {
    const state = crypto.randomBytes(16).toString('hex');
    map.set(state, { payload, expiresAt: Date.now() + ttlMs });
    return state;
  }

  function take(state) {
    const entry = map.get(state);
    if (!entry) return null;
    map.delete(state);
    if (entry.expiresAt <= Date.now()) return null;
    return entry.payload;
  }

  function size() {
    return map.size;
  }

  return { put, take, size };
}

module.exports = { createStateStore };
