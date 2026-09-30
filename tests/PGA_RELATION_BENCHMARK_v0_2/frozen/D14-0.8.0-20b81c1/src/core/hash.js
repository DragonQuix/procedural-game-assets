/**
 * core/hash.js — 确定性二维哈希（逐字摘自 others_003 src/core/math.js 的 hash2）
 *
 * 返回 [0,1)。无需存随机数、跨图块连续、每次运行一致、可在测试里断言。
 */
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
