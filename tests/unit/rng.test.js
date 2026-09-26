import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../../src/core/rng.js';
import { hash2 } from '../../src/core/hash.js';
import { PixelPainter } from '../../src/core/raster.js';

test('同种子同序列，不同种子不同序列', () => {
  const a = new Rng(42);
  const b = new Rng(42);
  const c = new Rng(43);
  const sa = [a.next(), a.next(), a.next()];
  const sb = [b.next(), b.next(), b.next()];
  const sc = [c.next(), c.next(), c.next()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test('seed=0 退化为 1（与原实现一致）', () => {
  const a = new Rng(0);
  const b = new Rng(1);
  assert.equal(a.next(), b.next());
});

test('int/range/pick/chance 边界', () => {
  const r = new Rng(7);
  for (let i = 0; i < 200; i++) {
    const v = r.int(2, 4);
    assert.ok(v >= 2 && v <= 4 && Number.isInteger(v));
    const f = r.range(-1, 1);
    assert.ok(f >= -1 && f < 1);
    assert.ok([1, 2, 3].includes(r.pick([1, 2, 3])));
    const c = r.chance(0.5);
    assert.ok(c === true || c === false);
  }
});

test('hash2 确定性且值域 [0,1)', () => {
  assert.equal(hash2(3, 5, 9), hash2(3, 5, 9));
  assert.notEqual(hash2(3, 5, 9), hash2(3, 5, 10));
  assert.notEqual(hash2(3, 5, 9), hash2(5, 3, 9));
  for (let i = 0; i < 100; i++) {
    const v = hash2(i, i * 7, 1);
    assert.ok(v >= 0 && v < 1);
  }
});

test('speckle 用种子随机源时结果确定；变换本身不消耗随机序列', () => {
  const draw = () => {
    const rng = new Rng(99);
    const p = new PixelPainter(8, 8);
    p.rect(1, 1, 6, 6, '#808080');
    p.speckle(0, 0, 8, 8, '#ffffff', 0.3, () => rng.next());
    return p.toRGBA();
  };
  assert.deepEqual([...draw()], [...draw()]);
  // 变换不接受随机源：同种子两次 speckle 可复现
  const sprinkle = () => {
    const rng = new Rng(5);
    const p = new PixelPainter(8, 8);
    p.rect(1, 1, 6, 6, '#808080');
    p.speckle(0, 0, 8, 8, '#ffffff', 0.3, () => rng.next());
    return [...p.toRGBA()];
  };
  assert.deepEqual(sprinkle(), sprinkle());
});
