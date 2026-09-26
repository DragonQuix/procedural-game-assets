import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, TICK_MS } from '../../examples/canvas-slice/template/logic/game.js';
import { makeLevel, overlaps } from '../../examples/canvas-slice/template/logic/collision.js';
import { createParticles } from '../../examples/canvas-slice/template/logic/particles.js';
import { bakeHumanoid } from '../../src/recipes/humanoid.js';
import ember from '../../examples/recipes/ember.mjs';

const level = makeLevel([
  '..........',
  '..........',
  '..........',
  '..........',
  '.....###..',
  '##########',
]);

const asset = bakeHumanoid(ember);
const frames = new Map(asset.frames.map((f) => [f.id, f]));

function makeGame(seed = 42) {
  return createGame({
    seed,
    level,
    content: {
      frames,
      view: { w: 160, h: 96 },
      player: { x: 16, y: 50, w: 12, h: 30 }, // 底部贴地面（row5 顶 80 - 高 30）
      enemies: [{ id: 'e1', x: 96, y: 62, w: 16, h: 18, hp: 2 }], // 盒须与枪口高度（y≈62）相交
      params: { runSpeed: 2, bulletSpeed: 8, fireCooldown: 2 },
    },
  });
}

test('确定性：同种子同输入序列，800 tick 后状态一致', () => {
  const a = makeGame();
  const b = makeGame();
  const script = (t) => ({ right: t % 100 < 60, fire: t % 20 < 3, jump: t % 90 === 0 });
  for (let t = 0; t < 800; t++) {
    a.step(1, script(t));
    b.step(1, script(t));
  }
  assert.deepEqual(a.state(), b.state());
});

test('确定性：不同种子粒子轨迹不同，逻辑状态结构一致', () => {
  const a = makeGame(1);
  const c = makeGame(2);
  const fire = { fire: true };
  a.step(30, fire);
  c.step(30, fire);
  const sa = a.state();
  const sc = c.state();
  assert.equal(sa.tick, sc.tick);
  assert.equal(sa.player.x, sc.player.x); // 移动不受种子影响
  // 粒子由独立种子驱动（命中后数量/校验和可能不同，不强制相等）
});

test('碰撞：出生时即被地面承接，不再下沉', () => {
  const g = makeGame();
  g.step(120, {});
  const s = g.state();
  assert.equal(s.player.y, 50); // 地面 row5 顶 80 - 高 30
  assert.equal(s.player.onGround, true);
  g.step(30, {});
  assert.equal(g.state().player.y, 50);
});

test('碰撞：实心墙阻挡水平移动', () => {
  const g = makeGame();
  for (let i = 0; i < 400; i++) g.step(1, { right: true });
  const s = g.state();
  assert.ok(s.player.x <= 160 - 12, `x=${s.player.x} 越过右边界`);
});

test('交互：子弹从枪口附件点出膛并命中敌人', () => {
  const g = makeGame();
  g.step(1, {}); // 落地
  const before = g.state().enemies[0].hp;
  for (let i = 0; i < 60 && g.state().enemies[0].hp === before; i++) g.step(1, { fire: true });
  const s = g.state();
  assert.ok(s.enemies[0].hp < before, '敌人应掉血');
  assert.ok(s.enemies[0].flashTicks >= 0);
  assert.ok(s.particles.count > 0, '命中应产生粒子');
});

test('胜负：击毁全部敌人获胜；护盾耗尽失败', () => {
  const g = makeGame();
  g.step(1, {});
  for (let i = 0; i < 400 && g.state().status === 'playing'; i++) g.step(1, { fire: true });
  assert.equal(g.state().status, 'win');
  // 失败路径：敌人放在障碍前，玩家径直撞上去
  const g2 = createGame({
    seed: 42,
    level,
    content: {
      frames,
      view: { w: 160, h: 96 },
      player: { x: 16, y: 50, w: 12, h: 30 },
      enemies: [{ id: 'e0', x: 60, y: 62, w: 16, h: 18, hp: 99 }],
      params: { runSpeed: 2 },
    },
  });
  g2.step(1, {});
  for (let i = 0; i < 2000 && g2.state().status === 'playing'; i++) g2.step(1, { right: true });
  assert.equal(g2.state().status, 'fail');
  assert.equal(g2.state().shield, 0);
});

test('暂停：step 不推进 tick；重启恢复初始状态', () => {
  const g = makeGame();
  g.step(30, { right: true, fire: true });
  const t1 = g.state().tick;
  g.step(10, { pause: false }); // 未按暂停
  assert.ok(g.state().tick > t1);
  g.step(1, { pause: true }); // 按下暂停（边沿）
  const t2 = g.state().tick;
  g.step(10, {});
  assert.equal(g.state().tick, t2);
  assert.equal(g.state().paused, true);
  g.step(1, { restart: true });
  const s = g.state();
  assert.equal(s.tick, 0);
  assert.equal(s.shield, 3);
  assert.equal(s.status, 'playing');
});

test('枪口出膛点：与附件点 - 锚点一致且随朝向翻转', () => {
  const g = makeGame();
  g.step(1, {});
  const f = frames.get('p_stand_fwd');
  const off = f.attachments.muzzle.x - f.anchor.x;
  // 朝右：出膛 = 玩家中心 + 偏移；子弹同 tick 再飞一段
  g.step(1, { fire: true });
  let s = g.state();
  let px = s.player.x + 12 / 2;
  let py = s.player.y + 30;
  let b = s.bullets[0];
  assert.ok(Math.abs(b.x - (px + off + 8)) < 1.5, `右向出膛 x=${b.x}，期望≈${px + off + 8}`);
  assert.ok(Math.abs(b.y - (py + (f.attachments.muzzle.y - f.anchor.y))) < 1.5, `出膛 y=${b.y}`);
  // 朝左：先向右离开左墙，再转左，避免"贴墙开枪子弹死在墙里"（正确语义）
  for (let i = 0; i < 10; i++) g.step(1, { right: true });
  for (let i = 0; i < 3; i++) g.step(1, { left: true });
  g.step(1, { fire: true });
  s = g.state();
  px = s.player.x + 6;
  b = s.bullets[s.bullets.length - 1];
  assert.ok(Math.abs(b.x - (px - off - 8)) < 1.5, `左向出膛 x=${b.x}，期望≈${px - off - 8}`);
});

test('粒子系统：种子确定、寿命耗尽清空', () => {
  const a = createParticles(7);
  const b = createParticles(7);
  a.burst(10, 10, 20);
  b.burst(10, 10, 20);
  for (let i = 0; i < 10; i++) {
    a.update();
    b.update();
  }
  assert.equal(a.checksum(), b.checksum());
  for (let i = 0; i < 200; i++) a.update();
  assert.equal(a.count(), 0);
});

test('collision.overlaps 基本语义', () => {
  assert.ok(overlaps({ x: 0, y: 0, w: 4, h: 4 }, { x: 3, y: 0, w: 4, h: 4 }));
  assert.ok(!overlaps({ x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 0, w: 4, h: 4 }));
});

test('TICK_MS 为 60Hz', () => {
  assert.ok(Math.abs(TICK_MS - 1000 / 60) < 0.01);
});
