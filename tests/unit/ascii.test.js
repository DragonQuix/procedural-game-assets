import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArt, markToCenter } from '../../src/core/ascii.js';

const PAL = { a: '#111111', b: '#222222', M: '#ff0000' };

test('基本解析：透明点、上色、行宽不等右侧透明', () => {
  const { painter } = parseArt(['aab', '.a'], PAL);
  assert.equal(painter.w, 3);
  assert.equal(painter.h, 2);
  assert.ok(painter.opaque(0, 0) && painter.opaque(2, 0) && painter.opaque(1, 1));
  assert.ok(!painter.opaque(0, 1) && !painter.opaque(2, 1)); // 第二行右侧补透明
});

test('未知字符报错并给出行列', () => {
  assert.throws(() => parseArt(['a?b'], PAL), /未知字符 '\?'（第 0 行第 1 列）/);
  assert.throws(() => parseArt(['aa', '..x.'], PAL), /第 1 行第 2 列/);
});

test('空输入与非法行被拒绝', () => {
  assert.throws(() => parseArt([], PAL), RangeError);
  assert.throws(() => parseArt(['', ''], PAL), RangeError);
  assert.throws(() => parseArt(['a', 3], PAL), TypeError);
});

test('marker 既上色也记录坐标；marker 颜色缺失时只记录', () => {
  const markers = { '*': { name: 'muzzle', color: 'M' }, '+': { name: 'eye', color: 'ZZZ' } };
  const { painter, marks } = parseArt(['a*+'], PAL, markers);
  assert.deepEqual(marks.muzzle, [1, 0]);
  assert.deepEqual(marks.eye, [2, 0]);
  assert.deepEqual([...painter.toRGBA().slice(4, 8)], [0xff, 0, 0, 0xff]);
  assert.equal(painter.get(2, 0), 0); // 调色板没有 ZZZ，不上色
});

test('marker 语义为像素中心：边界坐标 = 索引 + 0.5', () => {
  const { marks } = parseArt(['.*.'], PAL, { '*': { name: 'm' } });
  assert.deepEqual(markToCenter(marks.m), { x: 1.5, y: 0.5 });
});

test('重复 marker 默认报错，可显式 replace', () => {
  const rows = ['***'];
  const markers = { '*': { name: 'm' } };
  assert.throws(() => parseArt(rows, PAL, markers), /重复标记 'm'/);
  const { marks } = parseArt(rows, PAL, markers, { onDuplicateMarker: 'replace' });
  assert.deepEqual(marks.m, [2, 0]); // 后写覆盖
});

test('空格与点同为透明', () => {
  const { painter } = parseArt(['a a'], PAL);
  assert.ok(!painter.opaque(1, 0));
});
