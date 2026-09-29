/**
 * core/rng.js — 种子随机数（mulberry32，逐字摘自 others_003 src/core/rng.js）
 *
 * 同一种子 + 同一调用序列 → 同一结果。纯视觉效果与逻辑应使用独立实例，
 * 避免互相污染随机序列。
 */
export class Rng {
  constructor(seed = 1) {
    this.state = seed >>> 0 || 1;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a, b) {
    return a + (b - a) * this.next();
  }

  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}
