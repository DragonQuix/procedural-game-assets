import test from 'node:test';
import assert from 'node:assert/strict';
import { createRasterDocument, applyRasterOperation, compileRasterDocument, checkRasterCandidate, describeRasterCapabilities } from '../../src/studio/raster-doc.js';

const blank = () => createRasterDocument({ id: 'path-test', width: 16, height: 16 });
const region = { id: 'contour-a', x: 3, y: 4, w: 8, h: 8 };
const path = { kind: 'path', points: [[1, 1], [6, 1], [6, 6], [1, 6]], color: '#ff7700' };
const op = (commands, extra = {}) => ({ id: 'raster.draw', target: 'canvas', params: { region, commands, ...extra } });
const pixel = (doc, x, y) => doc.rgba.slice((y * doc.canvas.w + x) * 8, (y * doc.canvas.w + x + 1) * 8);
const segments = (p) => Array.from({ length: p.closed ? p.points.length : p.points.length - 1 }, (_, i) => {
  const [x0, y0] = p.points[i], [x1, y1] = p.points[(i + 1) % p.points.length];
  return { kind: 'line', x0, y0, x1, y1, color: p.color, ...(p.thick === undefined ? {} : { thick: p.thick }) };
});

test('路径逐像素等价于既有 line 序列；闭合不填充，输入不被改写', () => {
  for (const closed of [false, true]) for (const thick of [1, 2, 3]) {
    const p = { ...path, closed, thick }, operation = op([p]), before = JSON.stringify(operation);
    const result = applyRasterOperation(blank(), operation);
    assert.deepEqual(result, applyRasterOperation(blank(), op(segments(p))));
    assert.equal(pixel(result.doc, 6, 7), '00000000', '闭合路径内部保持透明');
    assert.equal(JSON.stringify(operation), before);
  }
  const opened = applyRasterOperation(blank(), op([path])).doc;
  const closed = applyRasterOperation(blank(), op([{ ...path, closed: true }])).doc;
  assert.equal(pixel(opened, 4, 7), '00000000');
  assert.equal(pixel(closed, 4, 7), 'ff7700ff');
});

test('所有绘制原语支持显式画布坐标；默认仍为选区坐标', () => {
  const local = [
    { kind: 'pixel', x: 0, y: 0, color: '#123456' },
    { kind: 'rect', x: 2, y: 2, w: 2, h: 3, color: '#102030' },
    { kind: 'line', x0: 0, y0: 7, x1: 7, y1: 0, color: '#405060' },
    { kind: 'poly', points: [[4, 4], [8, 4], [8, 8]], color: '#708090' },
    path,
  ];
  const absolute = local.map((c) => {
    const next = { ...c };
    for (const name of ['x', 'x0', 'x1']) if (name in next) next[name] += region.x;
    for (const name of ['y', 'y0', 'y1']) if (name in next) next[name] += region.y;
    if (c.points) next.points = c.points.map(([x, y]) => [x + region.x, y + region.y]);
    return next;
  });
  const source = blank(), expected = applyRasterOperation(source, op(local)), operation = op(absolute, { coordinateSpace: 'canvas-pixels' });
  const before = JSON.stringify(operation), result = applyRasterOperation(source, operation);
  assert.deepEqual(result, expected);
  assert.deepEqual(applyRasterOperation(source, op(local, { coordinateSpace: 'region-local-pixels' })), expected);
  assert.equal(JSON.stringify(operation), before);
  const checks = checkRasterCandidate({ baseCompiled: compileRasterDocument(source), candidateCompiled: compileRasterDocument(result.doc), plan: result.plan });
  assert.equal(checks.status, 'OK'); assert.equal(checks.diff.outside, 0);
});

test('路径沿用掩码保护与透明擦除；不以闭合轮廓替代选区', () => {
  const source = applyRasterOperation(blank(), op([{ kind: 'rect', x: 0, y: 0, w: 8, h: 8, color: '#aabbcc' }])).doc;
  const selection = { ...region, mask: Array(8).fill('00001111') };
  const result = applyRasterOperation(source, op([{ ...path, color: null, closed: true }], { region: selection }));
  assert.equal(pixel(result.doc, 4, 5), 'aabbccff', '掩码外的路径像素不擦除');
  assert.equal(pixel(result.doc, 9, 5), '00000000');
  assert.equal(pixel(result.doc, 8, 7), 'aabbccff', '路径不填充');
  const checks = checkRasterCandidate({ baseCompiled: compileRasterDocument(source), candidateCompiled: compileRasterDocument(result.doc), plan: result.plan });
  assert.equal(checks.status, 'OK'); assert.equal(checks.diff.outside, 0); assert.equal(checks.visualReview, 'UNVERIFIED');
});

test('非法路径、坐标系和粗笔刷越界均拒绝；掩码不能隐藏越界', () => {
  for (const patch of [
    { points: [] }, { points: [[1, 1]] }, { points: Array(129).fill([1, 1]) },
    { points: [[1, 1], [8, 1]] }, { points: [[1, 1], [1.5, 2]] }, { points: [[1, 1], ['2', 2]] },
    { points: [[1, 1], [null, 2]] }, { closed: 'true' }, { closed: null }, { thick: 0 }, { thick: 65 }, { fill: true },
    { points: [[0, 0], [1, 1]], thick: 3 },
  ]) assert.throws(() => applyRasterOperation(blank(), op([{ ...path, ...patch }])));
  for (const space of [null, true, 'canvas', 'auto']) assert.throws(() => applyRasterOperation(blank(), op([path], { coordinateSpace: space })));
  const masked = { ...region, mask: Array(8).fill('00001111') };
  assert.throws(() => applyRasterOperation(blank(), op([{ ...path, points: [[2, 5], [4, 5]] }], { region: masked, coordinateSpace: 'canvas-pixels' })));
  assert.throws(() => applyRasterOperation(blank(), { id: 'raster.replace', target: 'canvas', params: { region, rgba: '00000000'.repeat(64), coordinateSpace: 'canvas-pixels' } }));
});

test('连续笔画不再按线段消耗指令配额；能力声明可发现默认与边界', () => {
  const p = { ...path, points: Array.from({ length: 128 }, (_, i) => [i % 2 + 1, 2]) };
  const strokes = [p, { ...p, color: '#112233' }];
  assert.equal(segments(p).length, 127);
  assert.throws(() => applyRasterOperation(blank(), op(strokes.flatMap(segments))), /128/);
  const result = applyRasterOperation(blank(), op(strokes));
  let expected = blank();
  for (const stroke of strokes) expected = applyRasterOperation(expected, op(segments(stroke))).doc;
  assert.deepEqual(result.doc, expected);
  assert.throws(() => applyRasterOperation(blank(), op(Array(5).fill(p))), (e) => e.code === 'RESOURCE_LIMIT');
  const closed = { ...p, closed: true };
  assert.doesNotThrow(() => applyRasterOperation(blank(), op(Array(4).fill(closed))));
  assert.throws(() => applyRasterOperation(blank(), op([...Array(4).fill(closed), segments(p)[0]])), (e) => e.code === 'RESOURCE_LIMIT');
  const caps = describeRasterCapabilities(blank());
  assert.ok(caps.primitives.includes('path'));
  assert.deepEqual(caps.coordinateSpaces, ['region-local-pixels', 'canvas-pixels']);
  assert.equal(caps.coordinateSpace, 'region-local-pixels');
  assert.equal(caps.path.maxPoints, 128); assert.equal(caps.path.defaultClosed, false);
  assert.equal(caps.limits.strokeSegments, 512);
});
