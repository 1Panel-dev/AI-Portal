/**
 * OAuth provider access_token 内存缓存
 * 关键:in-flight Promise 去重,并发请求只触发一次 fetch
 * 过期前 5 分钟开始刷新(企微 token 7200s 有效,提前刷不会浪费)
 */
const REFRESH_BEFORE_MS = 5 * 60 * 1000;

function createTokenCache() {
  const cache = new Map();      // key → { token, expiresAt }
  const inFlight = new Map();   // key → Promise

  async function getToken(key, fetcher) {
    const entry = cache.get(key);
    const now = Date.now();
    if (entry && entry.expiresAt - REFRESH_BEFORE_MS > now) {
      return entry.token;
    }

    if (inFlight.has(key)) return inFlight.get(key);

    const promise = (async () => {
      try {
        const { token, expiresIn } = await fetcher();
        cache.set(key, { token, expiresAt: Date.now() + expiresIn * 1000 });
        return token;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, promise);
    return promise;
  }

  function clear(key) {
    cache.delete(key);
  }

  return { getToken, clear };
}

module.exports = { createTokenCache };
