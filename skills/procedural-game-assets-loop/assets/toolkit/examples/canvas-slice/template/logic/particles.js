/**
 * template/logic/particles.js — 最小粒子系统（种子确定，无 DOM）
 *
 * 纯视觉：用独立 Rng 实例，不污染逻辑随机序列。
 * 粒子：{ x, y, vx, vy, life, maxLife, color, size }，每 tick 更新。
 */
import { Rng } from '../../../../src/core/rng.js';

export function createParticles(seed = 1) {
  const rng = new Rng(seed);
  const list = [];

  /** 在 (x,y) 爆发 n 个粒子。opts: { speed, spreadY?, life, colors, size } */
  function burst(x, y, n, opts = {}) {
    const speed = opts.speed ?? 1.2;
    const life = opts.life ?? 24;
    const colors = opts.colors ?? ['#ffe08a', '#ff8a3d', '#c5cbe0'];
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const v = speed * (0.4 + rng.next() * 0.6);
      list.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (opts.updraft ?? 0.4),
        life: life + Math.floor(rng.next() * 8),
        maxLife: life + 8,
        color: colors[Math.floor(rng.next() * colors.length)],
        size: opts.size ?? 1,
      });
    }
  }

  function update() {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06; // 重力
      p.life -= 1;
      if (p.life <= 0) list.splice(i, 1);
    }
  }

  return {
    burst,
    update,
    list: () => list,
    count: () => list.length,
    /** 可断言哈希（测试用）：坐标与寿命求和取整 */
    checksum: () => list.reduce((acc, p) => acc + Math.round(p.x * 7 + p.y * 13 + p.life), 0),
  };
}
