// server/lib/sql-like.js
// LIKE / ILIKE 模式转义。
//
// 背景：PostgreSQL 的 LIKE/ILIKE 把 `%` 当「任意串」、`_` 当「任意单字符」。
// 只要把用户输入直接拼进模式，这两个字符就会变成通配符：
//   - 用户列表搜索输入 `%`        → 匹配全部用户
//   - 登录输入 `luoyepia_ling`    → 命中 `LuoYePiaoLing`（`_` 替换了 `P`）
//
// 后者是安全问题：门户注册正则 `/^[\p{L}\p{N}_]+$/u` **允许下划线**，
// 所以 `_` 既是合法用户名字符、又是通配符。攻击者不必知道确切用户名就能
// 用 `_` 占位去定向爆破；若库里只剩一个账号，输入 `%` 即可直接锁定它。
//
// 用法：
//   精确匹配（登录、查重）： [escapeLike(input)]
//   模糊搜索（搜索框）：     ['%' + escapeLike(input) + '%']
//
// PostgreSQL 的默认转义字符就是反斜杠，因此 SQL 里不必额外写 ESCAPE 子句。

'use strict';

/** 把 `\`、`%`、`_` 转义为字面量 */
function escapeLike(value) {
  return String(value ?? '').replace(/[\\%_]/g, (ch) => '\\' + ch);
}

module.exports = { escapeLike };
