const crypto = require('crypto');

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
const MIN_LEN = 3;
const MAX_LEN = 30;

/**
 * 从 OAuth 返回的 externalId / profileName 推导一个候选 username
 * 规则:
 *   1. externalId 合法(ascii + 3-30 位) → 直接用
 *   2. 不合法 → 用 wecom_<sha1(externalId)前8位>(provider 前缀写死为 'wecom',
 *      未来如果接入钉钉/飞书,各 adapter 自己实现等价函数即可)
 * 注意:此函数只生成"候选名",真正落库前还要做后缀去重(见 generateUniqueUsername)
 */
function buildCandidateUsername(externalId, profileName) {
  const id = String(externalId || '');
  if (id.length >= MIN_LEN && id.length <= MAX_LEN && USERNAME_RE.test(id)) {
    return id;
  }
  const hash = crypto.createHash('sha1').update(id).digest('hex').slice(0, 8);
  return `wecom_${hash}`;
}

/**
 * 查 portal_users 去重,若 candidate 已被占用 → 后缀 _2 / _3 ... 直到唯一
 * pool: pg Pool 实例
 */
async function generateUniqueUsername(pool, candidate) {
  let attempt = candidate;
  let suffix = 2;
  while (true) {
    const r = await pool.query('SELECT 1 FROM portal_users WHERE username = $1', [attempt]);
    if (r.rowCount === 0) return attempt;
    attempt = `${candidate}_${suffix}`;
    suffix++;
    // 防御性上限,几乎不会触发
    if (suffix > 1000) throw new Error('username generation exceeded retry limit');
  }
}

module.exports = { buildCandidateUsername, generateUniqueUsername };
