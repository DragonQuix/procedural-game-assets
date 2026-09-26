/**
 * tests/integration/export.test.js — 导出闭环：烘焙 → 打包 → PNG → 清单 → 切回比对
 * 以及 CLI export 的端到端（含空格与中文路径、覆盖保护、确定性）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakeHumanoid } from '../../src/recipes/humanoid.js';
import { packAtlas, renderAtlasPages, extractFrame } from '../../src/export/atlas.js';
import { encodePNG, decodePNG } from '../../src/export/png.js';
import { buildManifest, validateManifest } from '../../src/export/manifest.js';
import { PixelPainter } from '../../src/core/raster.js';
import ember from '../../examples/recipes/ember.mjs';
import rustclaw from '../../examples/recipes/rustclaw.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const bin = resolve(here, '../../bin/pga.mjs');

test('ember+rustclaw 导出往返：清单切回帧与烘焙逐像素一致', () => {
  for (const spec of [ember, rustclaw]) {
    const asset = bakeHumanoid(spec);
    const packed = packAtlas(asset.frames, { maxPage: 256, margin: 2 });
    const frameMap = new Map(asset.frames.map((f) => [f.id, f]));
    const pagePainters = renderAtlasPages(packed, frameMap);
    const manifest = buildManifest(asset, packed, { generator: 'test' });
    assert.deepEqual(validateManifest(manifest), []);
    const decodedPages = pagePainters.map((p) => decodePNG(encodePNG(p.w, p.h, p.toRGBA())));
    for (const mf of manifest.frames) {
      const page = decodedPages[mf.page];
      const back = extractFrame(PixelPainter.fromRGBA(page.width, page.height, page.rgba), { x: mf.rect.x, y: mf.rect.y, w: mf.rect.w, h: mf.rect.h });
      const src = frameMap.get(mf.id);
      assert.deepEqual([...back.toRGBA()], [...src.rgba], `${spec.id}/${mf.id}`);
      assert.deepEqual(mf.anchor, src.anchor);
      assert.deepEqual(mf.attachments, src.attachments);
    }
  }
});

test('CLI export：含空格与中文路径、清单与 PNG 落盘、覆盖保护、确定性', () => {
  const root = mkdtempSync(join(tmpdir(), 'pga-export-'));
  const out = join(root, '输出 目录');
  const run = () => execFileSync(process.execPath, [bin, 'export', resolve(here, '../../examples/recipes/rustclaw.mjs'), '--out', out], { encoding: 'utf8' });
  const log1 = run();
  assert.match(log1, /rustclaw/);
  const files = readdirSync(out);
  assert.ok(files.includes('rustclaw.manifest.json'));
  assert.ok(files.some((f) => f.endsWith('.page0.png')));
  const manifest = JSON.parse(readFileSync(join(out, 'rustclaw.manifest.json'), 'utf8'));
  assert.deepEqual(validateManifest(manifest), []);
  assert.equal(manifest.hints.timeUnit, 'ms');
  // 重复导出：清单字节一致（无时间戳），PNG 字节一致（锁定编码器）
  const snap = new Map(files.map((f) => [f, readFileSync(join(out, f))]));
  run();
  for (const [f, bytes] of snap) {
    if (f === '.pga.json') continue;
    assert.deepEqual(readFileSync(join(out, f)), bytes, `重复导出 ${f} 字节不一致`);
  }
  // 清单内无绝对路径、无时间戳
  const text = JSON.stringify(manifest);
  assert.ok(!text.includes(root) && !/[A-Za-z]:[\\/]/.test(text));
});

test('CLI export：非空无标记目录拒绝覆盖（退出码 4）', () => {
  const root = mkdtempSync(join(tmpdir(), 'pga-guard-'));
  const out = join(root, 'user-files');
  mkdirSync(out);
  writeFileSync(join(out, 'keep.txt'), 'user data');
  assert.throws(
    () => execFileSync(process.execPath, [bin, 'export', resolve(here, '../../examples/recipes/rustclaw.mjs'), '--out', out], { encoding: 'utf8', stdio: 'pipe' }),
    (e) => {
      assert.equal(e.status, 4);
      assert.match(e.stderr.toString(), /拒绝/);
      return true;
    },
  );
  assert.equal(readFileSync(join(out, 'keep.txt'), 'utf8'), 'user data'); // 用户文件未被动过
});

test('CLI validate：非法配方非零退出且错误可定位', () => {
  const root = mkdtempSync(join(tmpdir(), 'pga-bad-'));
  const bad = join(root, 'bad.mjs');
  writeFileSync(bad, 'export default { kind: "humanoid", id: "bad" };\n'); // 缺 frame/art
  assert.throws(
    () => execFileSync(process.execPath, [bin, 'validate', bad], { encoding: 'utf8', stdio: 'pipe' }),
    (e) => {
      assert.equal(e.status, 3);
      return true;
    },
  );
});
