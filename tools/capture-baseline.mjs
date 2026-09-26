/**
 * tools/capture-baseline.mjs — 用原项目生成器采集 111 个命名精灵基线（P0）
 *
 * 做法：把 PixelPainter.prototype.toCanvas 换成"返回自身"，让原版 SpriteBank.add
 * 的描边/锚点逻辑原样运行，但入库的是像素数据而不是 Canvas。随后导出
 * 名称、尺寸、锚点、marks 与 RGBA 到 tests/fixtures/baseline/sprites.json。
 *
 * 用法：node tools/capture-baseline.mjs [原项目路径]
 * 默认原项目路径：../../Games/ForOthers/others_003（相对本仓库）。
 * 本脚本是一次性采集工具，测试只读已提交的基线 JSON，不依赖原仓库。
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const sourceRepo = resolve(process.argv[2] ?? resolve(here, '../../..', 'Games/ForOthers/others_003'));
const outDir = resolve(here, '../tests/fixtures/baseline');

const src = (p) => pathToFileURL(resolve(sourceRepo, p)).href;

const { PixelPainter } = await import(src('src/gfx/pixelPainter.js'));
PixelPainter.prototype.toCanvas = function toCanvas() {
  return this;
};

const { SpriteBank } = await import(src('src/gfx/spriteBuilder.js'));
const { buildHero, buildLegion } = await import(src('src/gfx/sprites/characters.js'));
const { buildProps } = await import(src('src/gfx/sprites/props.js'));
const { buildScenery } = await import(src('src/gfx/sprites/scenery.js'));

const bank = new SpriteBank();
buildHero(bank);
buildLegion(bank);
buildProps(bank);
buildScenery(bank);

const sha1 = (buf) => createHash('sha1').update(buf).digest('hex');

function rgbaOf(painter) {
  const out = Buffer.alloc(painter.w * painter.h * 4);
  for (let i = 0; i < painter.data.length; i++) {
    const v = painter.data[i];
    out[i * 4] = v & 255;
    out[i * 4 + 1] = (v >>> 8) & 255;
    out[i * 4 + 2] = (v >>> 16) & 255;
    out[i * 4 + 3] = v >>> 24;
  }
  return out;
}

const sprites = [];
for (const name of bank.names()) {
  const e = bank.get(name);
  const rgba = rgbaOf(e.img);
  sprites.push({
    name,
    w: e.w,
    h: e.h,
    ax: e.ax,
    ay: e.ay,
    marks: e.marks,
    hash: sha1(rgba),
    flipHash: sha1(rgbaOf(e.flip)),
    flashHash: sha1(rgbaOf(e.flash)),
    rgbaB64: rgba.toString('base64'),
  });
}

let sourceCommit = 'unknown';
try {
  sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRepo, encoding: 'utf8' }).trim();
} catch {
  // 原仓库不可达时保留 unknown；基线 JSON 已提交，后续测试不依赖原仓库。
}

const doc = {
  meta: {
    capturedAt: new Date().toISOString(),
    sourceRepo,
    sourceCommit,
    builders: ['buildHero', 'buildLegion', 'buildProps', 'buildScenery'],
    spriteCount: sprites.length,
    marksNote: 'rig 精灵 marks.head 为相对锚点(脚底中心)偏移；ASCII markers 为像素索引，中心=索引+0.5',
  },
  sprites,
};

await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'sprites.json'), JSON.stringify(doc));

const byBuilder = { p_: 0, trooper_: 0, rifleman_: 0, sniper_: 0, heavy_: 0, legion_: 0, mortar_: 0 };
console.log(`captured ${sprites.length} sprites from ${sourceRepo} @ ${sourceCommit}`);
console.log(`sizes: min=${Math.min(...sprites.map((s) => s.w * s.h))} max=${Math.max(...sprites.map((s) => s.w * s.h))} px^2`);
console.log(`written: ${resolve(outDir, 'sprites.json')}`);
