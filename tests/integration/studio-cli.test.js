/**
 * tests/integration/studio-cli.test.js — bin/pga-studio.mjs 端到端：
 * create/inspect/export 的 JSON 合同、错误码、覆盖保护、既有格式导出与旧 CLI 兼容。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG } from '../../src/export/png.js';
import { validateManifest } from '../../src/export/manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const bin = resolve(here, '../../bin/pga-studio.mjs');
const legacyBin = resolve(here, '../../bin/pga.mjs');
const doc = resolve(here, '../../examples/studio/terminal.studio.json');

function run(args, opts = {}) {
  try {
    const stdout = execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, json: JSON.parse(stdout) };
  } catch (e) {
    if (opts.allowFail) return { code: e.status, json: JSON.parse(e.stdout) };
    throw e;
  }
}

test('create：JSON 摘要 + 源文档/scene/预览落盘，native 32×32、display 8 倍带背景', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'pga-studio-')), 'create');
  const { code, json } = run(['create', '--doc', doc, '--out', out, '--display-scale', '8']);
  assert.equal(code, 0);
  assert.equal(json.ok, true);
  assert.equal(json.result.assetId, 'terminal');
  assert.deepEqual(json.result.inner, { w: 30, h: 30 });
  assert.deepEqual(json.result.final, { w: 32, h: 32 });
  assert.equal(json.result.nodes.length, 4);
  const files = readdirSync(out);
  for (const f of ['terminal.studio.json', 'terminal.scene.json', 'terminal.native.png', 'terminal.display.png', '.pga.json']) {
    assert.ok(files.includes(f), `缺文件 ${f}`);
  }
  const native = decodePNG(readFileSync(join(out, 'terminal.native.png')));
  assert.equal(native.width, 32);
  assert.equal(native.height, 32);
  const display = decodePNG(readFileSync(join(out, 'terminal.display.png')));
  assert.equal(display.width, 32 * 8);
  assert.equal(display.height, 32 * 8);
  const scene = JSON.parse(readFileSync(join(out, 'terminal.scene.json'), 'utf8'));
  assert.equal(scene.sceneMap.nodes.length, 4);
  assert.match(scene.hashes.renderHash, /^[0-9a-f]{8}:[0-9a-f]{8}$/);
});

test('inspect：能力声明与节点定位；--node 裁切图落盘', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'pga-studio-')), 'inspect');
  const { json } = run(['inspect', '--doc', doc, '--out', out, '--node', 'terminal.screen']);
  assert.equal(json.ok, true);
  assert.ok(json.result.capabilities.nodes['terminal.shell'].operations['geometry.set']);
  const screen = json.result.nodes.find((n) => n.id === 'terminal.screen');
  assert.deepEqual(screen.frameRect, { x: 5, y: 6, w: 14, h: 13 });
  assert.ok(readdirSync(out).includes('terminal.crop.terminal.screen.png'));
  const crop = decodePNG(readFileSync(join(out, 'terminal.crop.terminal.screen.png')));
  assert.equal(crop.width, 14 + 4); // 2px 邻域 × 两侧
  assert.equal(crop.height, 13 + 4);
});

test('export：既有资产格式 + 图集 + 版本化 manifest，manifest 通过既有校验器', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'pga-studio-')), 'export');
  const { json } = run(['export', '--doc', doc, '--out', out]);
  assert.equal(json.ok, true);
  const files = readdirSync(out);
  for (const f of ['terminal.asset.json', 'terminal.page0.png', 'terminal.manifest.json', 'terminal.studio.json']) {
    assert.ok(files.includes(f), `缺文件 ${f}`);
  }
  const manifest = JSON.parse(readFileSync(join(out, 'terminal.manifest.json'), 'utf8'));
  assert.deepEqual(validateManifest(manifest), []);
  assert.equal(manifest.frames[0].rect.w, 32);
  assert.equal(manifest.recipe.version, 'pga-studio/1');
  const assetDoc = JSON.parse(readFileSync(join(out, 'terminal.asset.json'), 'utf8'));
  assert.equal(assetDoc.meta.kind, 'prop');
  const page = decodePNG(readFileSync(join(out, 'terminal.page0.png')));
  assert.ok(page.width >= 32 && page.height >= 32);
});

test('非法文档：退出码 3，stdout 为结构化 INVALID_DOCUMENT 错误', () => {
  const root = mkdtempSync(join(tmpdir(), 'pga-studio-'));
  const bad = join(root, 'bad.json');
  const docBad = JSON.parse(readFileSync(doc, 'utf8'));
  docBad.nodes[1].id = 'terminal.base';
  writeFileSync(bad, JSON.stringify(docBad));
  const { code, json } = run(['create', '--doc', bad, '--out', join(root, 'out')], { allowFail: true });
  assert.equal(code, 3);
  assert.equal(json.ok, false);
  assert.equal(json.error.code, 'INVALID_DOCUMENT');
  assert.ok(json.error.details.issues.some((i) => i.target.includes('terminal.base')));
});

test('缺参数 / 未知命令 / 缺失文件 / 覆盖保护', () => {
  const noOut = run(['create', '--doc', doc], { allowFail: true });
  assert.equal(noOut.code, 2);
  assert.equal(noOut.json.ok, false);
  const unknown = run(['frobnicate', '--doc', doc], { allowFail: true });
  assert.equal(unknown.code, 2);
  const missing = run(['inspect', '--doc', join(tmpdir(), 'no-such-doc.json')], { allowFail: true });
  assert.equal(missing.code, 3);
  const root = mkdtempSync(join(tmpdir(), 'pga-studio-'));
  writeFileSync(join(root, 'user-file.txt'), 'keep me');
  const refused = run(['create', '--doc', doc, '--out', root], { allowFail: true });
  assert.equal(refused.code, 4);
  assert.equal(refused.json.error.code, 'UNSAFE_PATH');
});

test('确定性：两次 create 的哈希一致，且与旧 CLI 无干扰', () => {
  const mk = () => join(mkdtempSync(join(tmpdir(), 'pga-studio-')), 'out');
  const a = run(['create', '--doc', doc, '--out', mk()]).json.result.hashes;
  const b = run(['create', '--doc', doc, '--out', mk()]).json.result.hashes;
  assert.equal(a.documentHash, b.documentHash);
  assert.equal(a.renderHash, b.renderHash);
  const legacy = execFileSync(process.execPath, [legacyBin, 'validate', resolve(here, '../../examples/recipes/supply.mjs'), '--json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(legacy).ok, true, '旧 pga.mjs 行为不得改变');
});
