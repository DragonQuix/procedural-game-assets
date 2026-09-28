import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../examples/canvas-slice/template/logic/game.js';
import { makeLevel } from '../../examples/canvas-slice/template/logic/collision.js';
import { DEMO_SEED, DEMO_LEVEL_ROWS, DEMO_PLAYER, DEMO_ENEMIES, PRESETS } from '../../examples/canvas-slice/template/demo-content.js';
import { bakeHumanoid } from '../../src/recipes/humanoid.js';
import { bakeMachine } from '../../src/recipes/machine.js';
import { bakeTerrain } from '../../src/recipes/terrain.js';
import ember from '../../examples/recipes/ember.mjs';
import turret from '../../examples/recipes/turret.mjs';
import ground from '../../examples/recipes/ground.mjs';

/**
 * 浏览器验收预设的机测：与 ?preset=* 定格的画面是同一批状态。
 * fight → 战斗中（子弹在途、粒子、敌损）；contact → 护盾减少；win → 全部击毁获胜。
 */

const assets = [bakeHumanoid(ember), bakeMachine(turret), bakeTerrain(ground)];
const frames = new Map(assets.flatMap((a) => a.frames.map((f) => [f.id, f])));
const level = makeLevel(DEMO_LEVEL_ROWS);

function runPreset(name) {
  const game = createGame({
    seed: DEMO_SEED,
    level,
    content: { frames, view: { w: 320, h: 180 }, player: DEMO_PLAYER, enemies: DEMO_ENEMIES },
  });
  for (const input of PRESETS[name]) game.step(1, input);
  return game.state();
}

test('fight 预设：战斗中，子弹在途且敌人受击', () => {
  const s = runPreset('fight');
  assert.equal(s.status, 'playing');
  assert.ok(s.bullets.length > 0, '应有在途子弹');
  assert.ok(s.player.x > 60, '玩家应已推进');
});

test('contact 预设：玩家被碰到，护盾减少且有粒子', () => {
  const s = runPreset('contact');
  assert.equal(s.status, 'playing');
  assert.ok(s.shield < 3, `护盾应减少（实际 ${s.shield}）`);
  assert.ok(s.particles.count > 0);
});

test('win 预设：全部敌人击毁，状态为 win', () => {
  const s = runPreset('win');
  assert.equal(s.status, 'win');
  assert.ok(s.enemies.every((e) => !e.alive));
});

test('演示内容：敌人盒与枪口高度相交（能被打到）', () => {
  // 枪口世界 y ≈ 146+30 + (29-47) = 158，敌人盒 156..176 覆盖之
  const f = frames.get('p_stand_fwd');
  const muzzleY = DEMO_PLAYER.y + DEMO_PLAYER.h + (f.attachments.muzzle.y - f.anchor.y);
  for (const e of DEMO_ENEMIES) {
    assert.ok(muzzleY >= e.y && muzzleY <= e.y + e.h, `${e.id} 盒不覆盖枪口高度 ${muzzleY}`);
  }
});

test('演示内容确定性：同预设两次结果一致', () => {
  assert.deepEqual(runPreset('fight'), runPreset('fight'));
});
