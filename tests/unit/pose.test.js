import test from 'node:test';
import assert from 'node:assert/strict';
import { solvePose, muzzleOf, legGeometry, runLegs, LEG_POSES } from '../../src/geometry/humanoid.js';
import { parseArt } from '../../src/core/ascii.js';
import ember from '../../examples/recipes/ember.mjs';

const parts = {
  head: parseArt(ember.art.head, ember.palette).painter,
  torso: parseArt(ember.art.torso, ember.palette).painter,
};
const spec = { frame: ember.frame, rig: ember.rig, parts };

test('站立姿态：脚底锁定，最低鞋底贴 feetY', () => {
  const s = solvePose(spec, { legs: LEG_POSES.stand, aim: 'fwd' });
  const maxBottom = Math.max(s.legs.back.bottom !== undefined ? Math.round(s.legs.back.ay) + 1 : 0, Math.round(s.legs.front.ay) + 1);
  assert.equal(maxBottom, ember.frame.feetY);
  // 髋随贴地平移
  assert.equal(s.hip.x, ember.frame.bodyX);
  assert.ok(Number.isFinite(s.hip.y));
});

test('双脚约束：不同腿长下贴地仍然成立', () => {
  const longLegs = { ...spec, rig: { ...spec.rig, thigh: 9, shin: 9 } };
  const s = solvePose(longLegs, { legs: LEG_POSES.stand, aim: 'fwd' });
  assert.equal(Math.max(Math.round(s.legs.back.ay) + 1, Math.round(s.legs.front.ay) + 1), ember.frame.feetY);
});

test('枪口与原版 muzzleOffset 公式一致（fwd）', () => {
  const s = solvePose(spec, { legs: LEG_POSES.stand, aim: 'fwd' });
  const g = ember.rig.guns.fwd;
  const expected = [ember.frame.bodyX + g.grip[0] + g.dir[0] * g.len, ember.frame.feetY + g.grip[1] + g.dir[1] * g.len + s.drop];
  assert.deepEqual([s.gun.muzzle[0], s.gun.muzzle[1]], expected);
  assert.deepEqual(muzzleOf(s), { x: Math.round(expected[0]), y: Math.round(expected[1]) });
});

test('枪长可覆盖（狙击手长枪）', () => {
  const s = solvePose(spec, { legs: LEG_POSES.kneel, aim: 'fwd', gunLen: 15 });
  const g = ember.rig.guns.fwd;
  assert.equal(s.gun.len, 15);
  assert.equal(s.gun.muzzle[0], ember.frame.bodyX + g.grip[0] + 15);
});

test('左右朝向数据同源：镜像由 transform 保证，solvePose 只管朝右', () => {
  const s = solvePose(spec, { legs: LEG_POSES.stand, aim: 'fwd' });
  assert.ok(s.gun.muzzle[0] > s.gun.grip[0]); // 朝右时枪口在握点右侧
});

test('无枪姿态（aim=null）没有 gun，附件点仍可取头部', () => {
  const s = solvePose(spec, { legs: LEG_POSES.kneel, aim: null });
  assert.equal(s.gun, null);
  assert.ok(Number.isFinite(s.head.x) && Number.isFinite(s.head.y));
});

test('未知瞄准方向与非法姿态报错', () => {
  assert.throws(() => solvePose(spec, { legs: LEG_POSES.stand, aim: 'sideways' }), /未知瞄准方向 'sideways'/);
  assert.throws(() => solvePose(spec, { aim: 'fwd' }), TypeError);
  assert.throws(() => solvePose({ rig: ember.rig, parts }, { legs: LEG_POSES.stand }), TypeError);
});

test('legGeometry 与 runLegs 行为（移植回归）', () => {
  const g = legGeometry(0, 0, 0, 0, { thigh: 6, shin: 6 });
  assert.deepEqual([g.kx, g.ky, g.ax, g.ay].map((v) => Math.round(v)), [0, 6, 0, 12]);
  const l0 = runLegs(0);
  const l3 = runLegs(3);
  assert.deepEqual(l0, [l3[1], l3[0]].map((v) => v)); // 错相 3 帧 = 两腿交换
});

test('下蹲比站立髋部更低（drop 更大）', () => {
  const stand = solvePose(spec, { legs: LEG_POSES.stand, aim: 'fwd' });
  const crouch = solvePose(spec, { legs: LEG_POSES.crouch, aim: 'fwd' });
  assert.ok(crouch.hip.y > stand.hip.y);
});
