import test from 'node:test';
import assert from 'node:assert/strict';
import { PixelPainter, MAX_PIXELS } from '../../src/core/raster.js';
import { packColor, unpackColor, shade, mix } from '../../src/core/color.js';
import { RasterClipError } from '../../src/core/diagnostics.js';

test('通道顺序：#rrggbb 与 RGBA 字节一一对应', () => {
  const p = new PixelPainter(2, 1);
  p.set(0, 0, '#123456');
  p.set(1, 0, packColor('#abcdef', 0x80));
  const rgba = p.toRGBA();
  assert.deepEqual([...rgba.slice(0, 4)], [0x12, 0x34, 0x56, 0xff]);
  assert.deepEqual([...rgba.slice(4, 8)], [0xab, 0xcd, 0xef, 0x80]);
  assert.deepEqual(unpackColor(packColor('#123456')), [0x12, 0x34, 0x56, 255]);
});

test('fromRGBA 与 toRGBA 往返一致', () => {
  const p = new PixelPainter(3, 2);
  p.rect(0, 0, 3, 2, '#334455');
  const q = PixelPainter.fromRGBA(3, 2, p.toRGBA());
  assert.deepEqual([...q.toRGBA()], [...p.toRGBA()]);
  assert.throws(() => PixelPainter.fromRGBA(3, 2, new Uint8Array(5)), RangeError);
});

test('负数坐标按 floor 取整，不用 |0 截向 0', () => {
  const p = new PixelPainter(4, 4, { clip: 'allow' });
  p.set(-0.5, 3, '#ffffff'); // floor(-0.5) = -1，越界忽略；|0 会错误写到 (0,3)
  assert.equal(p.get(0, 3), 0);
  p.set(1.9, 1.2, '#ffffff'); // floor → (1,1)
  assert.ok(p.opaque(1, 1));
});

test('rect 填充范围 [x,x+w)×[y,y+h)', () => {
  const p = new PixelPainter(6, 6);
  p.rect(1, 2, 3, 2, '#ff0000');
  assert.ok(p.opaque(1, 2) && p.opaque(3, 3));
  assert.ok(!p.opaque(4, 2) && !p.opaque(1, 4) && !p.opaque(0, 2));
});

test('退化与非法输入被拒绝', () => {
  const p = new PixelPainter(4, 4);
  assert.throws(() => p.rect(0, 0, -1, 2, '#fff'), RangeError);
  assert.throws(() => p.rect(0, 0, 1, NaN, '#fff'), TypeError);
  assert.throws(() => p.ellipse(2, 2, 0, 1, '#fff'), RangeError);
  assert.throws(() => p.line(0, 0, 1, 1, '#fff', 0), RangeError);
  assert.throws(() => p.poly([[0, 0], [1, 1]], '#fff'), RangeError);
  assert.throws(() => p.poly([[0, 0], [1, 1], [2, Infinity]], '#fff'), TypeError);
  assert.throws(() => new PixelPainter(0, 4), RangeError);
  assert.throws(() => new PixelPainter(4096, 4096 * 2), RangeError); // 超 MAX_PIXELS
  assert.ok(MAX_PIXELS > 0);
  assert.throws(() => p.set(0, 0, 'not-a-color'), TypeError);
});

test('ellipse 像素精确：中心填、远角空', () => {
  const p = new PixelPainter(11, 11);
  p.ellipse(5.5, 5.5, 3, 3, '#00ff00');
  assert.ok(p.opaque(5, 5));
  assert.ok(!p.opaque(0, 0) && !p.opaque(10, 10));
});

test('line 端点四舍五入、thick 笔刷', () => {
  const p = new PixelPainter(8, 4);
  p.line(1, 2, 6, 2, '#ffffff', 1);
  for (let x = 1; x <= 6; x++) assert.ok(p.opaque(x, 2), `x=${x}`);
  assert.ok(!p.opaque(1, 3));
  const q = new PixelPainter(8, 6);
  q.line(2, 2, 2, 4, '#ffffff', 3);
  assert.ok(q.opaque(1, 3) && q.opaque(3, 3));
});

test('poly 扫描线填充：三角形内部填、外部空', () => {
  const p = new PixelPainter(8, 8);
  p.poly([[1, 1], [5, 1], [3, 4]], '#0000ff');
  // 像素中心采样：y=1 行填 1..4；y=2 行填 2..3（中心 (3.5,3.5) 在三角形外）
  assert.ok(p.opaque(1, 1) && p.opaque(4, 1) && p.opaque(2, 2) && p.opaque(3, 2));
  assert.ok(!p.opaque(0, 0) && !p.opaque(6, 6) && !p.opaque(1, 3) && !p.opaque(3, 3));
});

test('clip=error 默认：越界写抛 RasterClipError 且可定位', () => {
  const p = new PixelPainter(4, 4);
  assert.throws(() => p.rect(3, 0, 4, 1, '#ffffff'), (e) => {
    assert.ok(e instanceof RasterClipError);
    assert.equal(e.op, 'rect');
    assert.match(e.message, /4×4/);
    return true;
  });
});

test('clip=warn 记录诊断，clip=allow 只计数', () => {
  const w = new PixelPainter(4, 4, { clip: 'warn' });
  w.rect(2, 0, 6, 1, '#ffffff');
  assert.equal(w.diagnostics.clips, 4); // x = 4,5,6,7 越界
  assert.equal(w.opaque(2, 0), true);
  const a = new PixelPainter(4, 4, { clip: 'allow' });
  a.line(-3, 1, 2, 1, '#ffffff');
  assert.ok(a.diagnostics.clips > 0);
  assert.equal(a.diagnostics.clipSamples.length, 0);
});

test('blit 是不透明覆盖：半透明也覆盖，透明跳过', () => {
  const dst = new PixelPainter(2, 1);
  dst.rect(0, 0, 2, 1, '#111111');
  const src = new PixelPainter(2, 1);
  src.set(0, 0, packColor('#ff0000', 0x80)); // 半透明仍覆盖
  dst.blit(src, 0, 0);
  assert.deepEqual(unpackColor(dst.get(0, 0)), [0xff, 0, 0, 0x80]);
  assert.deepEqual(unpackColor(dst.get(1, 0)), [0x11, 0x11, 0x11, 0xff]);
});

test('blit flip 用像素索引镜像（W-1-i）', () => {
  const src = new PixelPainter(3, 1);
  src.set(0, 0, '#ffffff');
  const dst = new PixelPainter(3, 1);
  dst.blit(src, 0, 0, true);
  assert.ok(dst.opaque(2, 0) && !dst.opaque(0, 0));
});

test('outline 4 邻域描边', () => {
  const p = new PixelPainter(3, 3);
  p.set(1, 1, '#ffffff');
  p.outline('#000000');
  assert.ok(p.opaque(0, 1) && p.opaque(2, 1) && p.opaque(1, 0) && p.opaque(1, 2));
  assert.ok(!p.opaque(0, 0));
});

test('颜色调整 shade/mix', () => {
  assert.equal(shade('#202020', 2), '#404040');
  assert.equal(shade('#808080', 2), '#ffffff'); // 截顶
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.throws(() => shade('#202020', -1), TypeError);
});
