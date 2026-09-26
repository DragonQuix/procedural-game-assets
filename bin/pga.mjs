#!/usr/bin/env node
/**
 * bin/pga.mjs — 程序化资产工具包 CLI
 *
 *   node bin/pga.mjs validate <recipe.mjs> [--json]
 *   node bin/pga.mjs bake <recipe.mjs> --out <dir> [--bmp] [--scale N] [--bg #rrggbb]
 *   node bin/pga.mjs export <recipe.mjs> --out <dir> [--max-page N] [--margin N]
 *   node bin/pga.mjs gallery --dir <dir> [--port N]
 *
 * 退出码：0 成功；2 用法/输入错误；3 烘焙或校验失败；4 覆盖保护拒绝。
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bakeHumanoid } from '../src/recipes/humanoid.js';
import { bakeMachine } from '../src/recipes/machine.js';
import { bakeVegetation } from '../src/recipes/vegetation.js';
import { bakeProp } from '../src/recipes/prop.js';
import { bakeTerrain } from '../src/recipes/terrain.js';
import { assetToJSON } from '../src/adapters/asset-file.js';
import { encodeBMP } from '../src/export/bmp.js';
import { encodePNG } from '../src/export/png.js';
import { packAtlas, renderAtlasPages } from '../src/export/atlas.js';
import { buildManifest } from '../src/export/manifest.js';
import { PixelPainter } from '../src/core/raster.js';
import { scaleNearest } from '../src/core/transform.js';
import { startGalleryServer } from '../tools/gallery/server.mjs';

const GENERATOR = `procedural-game-assets@${JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version}`;
const BAKERS = { humanoid: bakeHumanoid, machine: bakeMachine, vegetation: bakeVegetation, prop: bakeProp, terrain: bakeTerrain };
const MARKER = '.pga.json';

function fail(message, code) {
  console.error(`错误：${message}`);
  process.exit(code);
}

async function loadSpecs(recipePath) {
  const abs = resolve(recipePath);
  let mod;
  try {
    mod = await import(pathToFileURL(abs).href);
  } catch (e) {
    fail(`无法加载配方 ${recipePath}：${e.message}`, 2);
  }
  const specs = mod.default ?? mod;
  const list = Array.isArray(specs) ? specs : [specs];
  for (const s of list) {
    if (!s || !BAKERS[s.kind]) fail(`配方 ${recipePath} 含未知 kind '${s?.kind}'（可用：${Object.keys(BAKERS).join(', ')}）`, 2);
  }
  return list;
}

function bakeSpecs(specs) {
  return specs.map((s) => BAKERS[s.kind](s));
}

async function cmdValidate(recipePath, json) {
  const specs = await loadSpecs(recipePath);
  let assets;
  try {
    assets = bakeSpecs(specs);
  } catch (e) {
    if (json) console.log(JSON.stringify({ ok: false, error: e.message }));
    fail(`校验失败：${e.message}`, 3);
  }
  const report = assets.map((a) => ({
    id: a.id,
    kind: a.kind,
    frames: a.frames.length,
    clips: Object.keys(a.clips).length,
    clippedFrames: a.frames.filter((f) => f.diagnostics && f.diagnostics.clips > 0).map((f) => ({ id: f.id, clips: f.diagnostics.clips })),
    bytes: a.frames.reduce((n, f) => n + f.rgba.length, 0),
  }));
  if (json) {
    console.log(JSON.stringify({ ok: true, assets: report }, null, 2));
  } else {
    for (const r of report) {
      console.log(`✓ ${r.id}（${r.kind}）：${r.frames} 帧，${r.clips} 个剪辑，${(r.bytes / 1024).toFixed(1)} KiB 像素`);
      for (const c of r.clippedFrames) console.log(`  ⚠ ${c.id}：${c.clips} 次越界写入（配方已声明裁剪）`);
    }
  }
}

/** 覆盖保护：目录非空且没有本工具标记时拒绝写入。 */
async function ensureOutDir(dir) {
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir);
  if (entries.length === 0 || entries.includes(MARKER)) return;
  fail(`输出目录 ${dir} 非空且不是本工具生成的目录；为避免覆盖你的文件已拒绝。请换空目录或先确认删除。`, 4);
}

async function cmdBake(recipePath, opts) {
  if (!opts.out) fail('bake 需要 --out <dir>', 2);
  const specs = await loadSpecs(recipePath);
  let assets;
  try {
    assets = bakeSpecs(specs);
  } catch (e) {
    fail(`烘焙失败：${e.message}`, 3);
  }
  const outDir = resolve(opts.out);
  await ensureOutDir(outDir);
  await writeFile(join(outDir, MARKER), JSON.stringify({ tool: 'procedural-game-assets', generator: GENERATOR }) + '\n');
  for (const asset of assets) {
    await writeFile(join(outDir, `${asset.id}.asset.json`), JSON.stringify(assetToJSON(asset, { generator: GENERATOR })));
    console.log(`✓ ${asset.id}：${asset.frames.length} 帧 → ${join(outDir, `${asset.id}.asset.json`)}`);
    if (opts.bmp) {
      const dir = join(outDir, asset.id);
      await mkdir(dir, { recursive: true });
      const k = opts.scale ?? 1;
      for (const f of asset.frames) {
        let p = PixelPainter.fromRGBA(f.width, f.height, f.rgba);
        if (k > 1) p = scaleNearest(p, k);
        await writeFile(join(dir, `${f.id}.bmp`), encodeBMP(p.w, p.h, p.toRGBA(), { background: opts.bg }));
      }
      // 每个剪辑拼一张横向连续条
      for (const [name, clip] of Object.entries(asset.clips)) {
        const frames = clip.frames.map((id) => asset.frames.find((f) => f.id === id));
        if (frames.some((f) => !f)) continue;
        const gap = 2;
        const w = frames.reduce((n, f) => n + f.width, 0) + gap * (frames.length - 1);
        const h = Math.max(...frames.map((f) => f.height));
        const strip = new PixelPainter(w, h, { clip: 'error' });
        let x = 0;
        for (const f of frames) {
          strip.blit(PixelPainter.fromRGBA(f.width, f.height, f.rgba), x, 0);
          x += f.width + gap;
        }
        const out = k > 1 ? scaleNearest(strip, k) : strip;
        await writeFile(join(dir, `clip_${name}.bmp`), encodeBMP(out.w, out.h, out.toRGBA(), { background: opts.bg }));
      }
    }
  }
}

async function cmdGallery(opts) {
  const dir = resolve(opts.dir ?? '.');
  const port = opts.port ?? 47840;
  await startGalleryServer({ dir, port });
  console.log(`画廊已启动：http://127.0.0.1:${port}/ （资产目录 ${dir}，Ctrl+C 停止）`);
}

/** 导出：与画廊共享同一烘焙实现，增加图集 PNG 与版本化清单。 */
async function cmdExport(recipePath, opts) {
  if (!opts.out) fail('export 需要 --out <dir>', 2);
  const specs = await loadSpecs(recipePath);
  let assets;
  try {
    assets = bakeSpecs(specs);
  } catch (e) {
    fail(`烘焙失败：${e.message}`, 3);
  }
  const outDir = resolve(opts.out);
  await ensureOutDir(outDir);
  await writeFile(join(outDir, MARKER), JSON.stringify({ tool: 'procedural-game-assets', generator: GENERATOR }) + '\n');
  const packOpts = { maxPage: opts['max-page'] ?? 1024, margin: opts.margin ?? 2 };
  for (const asset of assets) {
    let packed;
    try {
      packed = packAtlas(asset.frames, packOpts);
    } catch (e) {
      fail(`打包失败（${asset.id}）：${e.message}`, 3);
    }
    const frameMap = new Map(asset.frames.map((f) => [f.id, f]));
    const pagePainters = renderAtlasPages(packed, frameMap);
    for (const [i, p] of pagePainters.entries()) {
      await writeFile(join(outDir, `${asset.id}.page${i}.png`), encodePNG(p.w, p.h, p.toRGBA()));
    }
    const manifest = buildManifest(asset, packed, { generator: GENERATOR });
    await writeFile(join(outDir, `${asset.id}.manifest.json`), JSON.stringify(manifest, null, 2) + '\n');
    const pages = manifest.pages.map((p) => `${p.file}(${p.width}×${p.height})`).join(' ');
    console.log(`✓ ${asset.id}：${asset.frames.length} 帧 → ${pages} + ${asset.id}.manifest.json`);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const positional = rest.filter((a) => !a.startsWith('--'));
const opts = {};
for (let i = 0; i < rest.length; i++) {
  const m = rest[i].match(/^--([\w-]+)(?:=(.*))?$/);
  if (m) opts[m[1]] = m[2] ?? (rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true);
}
opts.scale = opts.scale ? Number(opts.scale) : undefined;
opts.port = opts.port ? Number(opts.port) : undefined;
opts.margin = opts.margin ? Number(opts.margin) : undefined;
opts['max-page'] = opts['max-page'] ? Number(opts['max-page']) : undefined;
opts.bg = typeof opts.bg === 'string' ? opts.bg : '#202028';

try {
  if (cmd === 'validate') await cmdValidate(positional[0] ?? fail('validate 需要配方路径', 2), Boolean(opts.json));
  else if (cmd === 'bake') await cmdBake(positional[0] ?? fail('bake 需要配方路径', 2), opts);
  else if (cmd === 'export') await cmdExport(positional[0] ?? fail('export 需要配方路径', 2), opts);
  else if (cmd === 'gallery') await cmdGallery(opts);
  else {
    console.error('用法：pga <validate|bake|export|gallery> ...（见文件头注释）');
    process.exit(cmd ? 2 : 0);
  }
} catch (e) {
  fail(e.message, 3);
}
