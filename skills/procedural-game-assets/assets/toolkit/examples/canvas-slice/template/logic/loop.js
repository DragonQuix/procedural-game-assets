/**
 * template/logic/loop.js — 固定步长循环（浏览器侧）
 *
 * 时间累加器：每帧按真实经过时间补 tick，最多补 4 个（防螺旋卡顿）；
 * 本帧无 tick 就不重绘。测试不走这里——直接调 game.step(n, input)。
 */
import { TICK_MS } from './game.js';

export function startLoop({ game, input, render, maxCatchUp = 4 }) {
  let last = performance.now();
  let acc = 0;
  let raf = 0;
  function frame(now) {
    acc += Math.min(100, now - last); // 单帧最多补 100ms
    last = now;
    let ticks = 0;
    while (acc >= TICK_MS && ticks < maxCatchUp) {
      game.step(1, input());
      acc -= TICK_MS;
      ticks += 1;
    }
    if (ticks === maxCatchUp) acc = 0; // 丢弃追不上的积压
    if (ticks > 0) render();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
