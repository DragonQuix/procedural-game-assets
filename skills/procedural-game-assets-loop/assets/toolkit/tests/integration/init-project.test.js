/**
 * tests/integration/init-project.test.js — 干净目录初始化与携带校验
 *
 * a) 迷你假载荷（任何环境都运行）：init 复制 + 哈希复核 + 项目身份 + import 改写；
 *    损坏/缺失/身份撞名时 --check 响亮失败（退出码 3），不静默忽略。
 * b) 真实载荷链（仅开发仓库；载荷不存在时跳过，与 install.test.js 同策略）：
 *    从 skills/procedural-game-assets/assets/toolkit init 到临时目录，
 *    在该项目里实际跑 node --test、--check 与静态服务 HTTP 请求。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const initScript = join(repoRoot, 'tools/init-project.mjs');
const payloadDir = resolve(repoRoot, 'skills/procedural-game-assets/assets/toolkit');
const hasPayload = existsSync(join(payloadDir, '.pga-release.json'));

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** 搭一个迷你但结构完整的假载荷（含 .pga-release.json 清单） */
async function makeFakePayload(root) {
  const files = {
    'package.json': JSON.stringify({ name: 'procedural-game-assets', version: '9.9.9' }) + '\n',
    'CONTEXT.md': '# CONTEXT — 工具包自身上下文\n',
    'bin/pga.mjs': 'export const x = 1;\n',
    'src/core/rng.js': 'export class Rng {}\n',
    'tools/static-server.mjs': '// server\n',
    'examples/canvas-slice/index.html': '<script type="module" src="/examples/canvas-slice/main.js"></script>\n',
    'examples/canvas-slice/main.js': "import { Rng } from '/src/core/rng.js';\nimport ember from '/examples/recipes/ember.mjs';\n// http://127.0.0.1:47850/examples/canvas-slice/\n",
    'examples/canvas-slice/template/logic/z.js': "import { Rng } from '../../../../src/core/rng.js';\nexport const z = 1;\n",
    'examples/canvas-slice/README.md': '# 模板 README（不应被复制到 game/）\n',
    'examples/canvas-slice/assets/junk.txt': '派生目录（不应被复制）\n',
    'examples/recipes/ember.mjs': 'export default {};\n',
  };
  const manifestFiles = {};
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, content);
    manifestFiles[rel] = sha256(Buffer.from(content));
  }
  await writeFile(join(root, '.pga-release.json'), JSON.stringify({ generator: 'fake', fileCount: Object.keys(manifestFiles).length, files: manifestFiles }, null, 2) + '\n');
  return files;
}

test('init：迷你载荷携带、哈希复核、项目身份、import 改写', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pga-init-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'payload');
  const proj = join(root, 'my game'); // 含空格路径
  await mkdir(source, { recursive: true });
  const files = await makeFakePayload(source);

  execFileSync('node', [initScript, proj, '--from', source, '--name', 'demo-game'], { encoding: 'utf8' });

  // 携带副本完整且内容一致；工具包上下文随副本走
  assert.equal(await readFile(join(proj, 'vendor/pga/CONTEXT.md'), 'utf8'), files['CONTEXT.md']);
  assert.ok(existsSync(join(proj, 'vendor/pga/.pga-release.json')));
  // 项目根身份：游戏自己的 CONTEXT.md / package.json，与工具包不混
  const ctx = await readFile(join(proj, 'CONTEXT.md'), 'utf8');
  assert.notEqual(ctx, files['CONTEXT.md']);
  assert.match(ctx, /vendor\/pga/);
  const pkg = JSON.parse(await readFile(join(proj, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'demo-game');
  assert.ok(pkg.version && pkg.description && pkg.scripts?.serve && pkg.scripts?.test);
  // 模板复制与改写：根绝对/深相对 import 都变成指向 vendor/pga/ 的相对路径
  const mainJs = await readFile(join(proj, 'game/main.js'), 'utf8');
  assert.match(mainJs, /from '\.\.\/vendor\/pga\/src\/core\/rng\.js'/);
  assert.match(mainJs, /from '\.\.\/vendor\/pga\/examples\/recipes\/ember\.mjs'/);
  assert.match(mainJs, /47850\/game\//);
  const zJs = await readFile(join(proj, 'game/template/logic/z.js'), 'utf8');
  assert.match(zJs, /from '\.\.\/\.\.\/\.\.\/vendor\/pga\/src\/core\/rng\.js'/);
  const html = await readFile(join(proj, 'game/index.html'), 'utf8');
  assert.match(html, /src="\.\/main\.js"/);
  // README 与派生 assets/ 不复制进 game/
  assert.ok(!existsSync(join(proj, 'game/README.md')));
  assert.ok(!existsSync(join(proj, 'game/assets')));
  assert.ok(existsSync(join(proj, 'tests/game-smoke.test.js')));
  // --check 通过
  execFileSync('node', [initScript, '--check', proj]);
});

test('init 覆盖保护：vendor/pga 非空拒绝；源无清单拒绝', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pga-init-guard-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'payload');
  await mkdir(source, { recursive: true });
  await makeFakePayload(source);
  const proj = join(root, 'proj');
  await mkdir(join(proj, 'vendor/pga'), { recursive: true });
  await writeFile(join(proj, 'vendor/pga/keep.txt'), '别动我\n');
  const r1 = spawnSync('node', [initScript, proj, '--from', source], { encoding: 'utf8' });
  assert.equal(r1.status, 4);
  assert.equal(await readFile(join(proj, 'vendor/pga/keep.txt'), 'utf8'), '别动我\n');
  const r2 = spawnSync('node', [initScript, join(root, 'p2'), '--from', join(root, 'not-a-payload')], { encoding: 'utf8' });
  assert.equal(r2.status, 2);
});

test('init 项目名前置校验：同名工具包拒绝且不落任何文件', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pga-init-name-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'payload');
  await mkdir(source, { recursive: true });
  await makeFakePayload(source);

  // --name 撞工具包名：拒绝，且 vendor/pga 与身份文件都未写入
  const proj = join(root, 'game-a');
  const r1 = spawnSync('node', [initScript, proj, '--from', source, '--name', 'procedural-game-assets'], { encoding: 'utf8' });
  assert.equal(r1.status, 2);
  assert.match(r1.stderr, /同名/);
  assert.ok(!existsSync(proj), '校验失败前不得创建项目目录');

  // 目录名撞工具包名（默认取 basename）：同样拒绝
  const r2 = spawnSync('node', [initScript, join(root, 'procedural-game-assets'), '--from', source], { encoding: 'utf8' });
  assert.equal(r2.status, 2);

  // 已有 package.json 但 name 仍是工具包名：拒绝且不覆盖
  const proj3 = join(root, 'game-b');
  await mkdir(proj3, { recursive: true });
  await writeFile(join(proj3, 'package.json'), JSON.stringify({ name: 'procedural-game-assets', version: '0.2.1' }) + '\n');
  const r3 = spawnSync('node', [initScript, proj3, '--from', source], { encoding: 'utf8' });
  assert.equal(r3.status, 2);
  assert.match(r3.stderr, /已有 package\.json/);
  const pkg = JSON.parse(await readFile(join(proj3, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.2.1', '已有文件未被改动');
  assert.ok(!existsSync(join(proj3, 'vendor')), '校验失败前不得携带');
});

test('--check：缺失/损坏/多出/身份撞名都失败且非 0', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pga-init-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'payload');
  const proj = join(root, 'proj');
  await mkdir(source, { recursive: true });
  await makeFakePayload(source);
  execFileSync('node', [initScript, proj, '--from', source], { encoding: 'utf8' });
  const check = () => spawnSync('node', [initScript, '--check', proj], { encoding: 'utf8' });

  await writeFile(join(proj, 'vendor/pga/CONTEXT.md'), '被手改\n');
  let r = check();
  assert.equal(r.status, 3); assert.match(r.stderr, /损坏/);
  execFileSync('node', [initScript, join(root, 'proj2'), '--from', source], { encoding: 'utf8' });
  await rm(join(root, 'proj2/vendor/pga/bin/pga.mjs'));
  r = spawnSync('node', [initScript, '--check', join(root, 'proj2')], { encoding: 'utf8' });
  assert.equal(r.status, 3); assert.match(r.stderr, /缺失/);
  execFileSync('node', [initScript, join(root, 'proj3'), '--from', source], { encoding: 'utf8' });
  await writeFile(join(root, 'proj3/vendor/pga/extra.txt'), '多出\n');
  r = spawnSync('node', [initScript, '--check', join(root, 'proj3')], { encoding: 'utf8' });
  assert.equal(r.status, 3); assert.match(r.stderr, /多出/);
  execFileSync('node', [initScript, join(root, 'proj4'), '--from', source], { encoding: 'utf8' });
  const pkgPath = join(root, 'proj4/package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  pkg.name = 'procedural-game-assets';
  await writeFile(pkgPath, JSON.stringify(pkg));
  r = spawnSync('node', [initScript, '--check', join(root, 'proj4')], { encoding: 'utf8' });
  assert.equal(r.status, 3); assert.match(r.stderr, /游戏名/);
});

test('真实载荷链：init → 冒烟测试 → --check → 静态服务 HTTP', { skip: !hasPayload && '载荷不存在（本测试仅在开发仓库 release 后运行）' }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pga-init-real-'));
  let server = null;
  t.after(async () => {
    if (server) server.kill();
    await new Promise((r) => setTimeout(r, 300));
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  });
  const proj = join(root, 'clean-game');
  execFileSync('node', [initScript, proj, '--from', payloadDir], { encoding: 'utf8' });

  // 子进程摘掉 NODE_TEST_CONTEXT，否则嵌套 node --test 会跳过文件（断言为空转）
  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_TEST_CONTEXT;
  // 项目自身测试（含 game-smoke）通过
  const smoke = execFileSync('node', ['--test', 'tests/**/*.test.js'], { cwd: proj, encoding: 'utf8', env: cleanEnv });
  assert.match(smoke, /# fail 0/);
  // 携带的工具包副本独立运行全量套件（载荷内自动跳过宿主集成测试）
  const suite = execFileSync('node', ['--test', 'tests/**/*.test.js'], { cwd: join(proj, 'vendor/pga'), encoding: 'utf8', env: cleanEnv });
  assert.match(suite, /# fail 0/);
  assert.match(suite, /# tests \d{3,}/, '携带副本应实际跑了全量套件而非空转');
  // --check 通过
  execFileSync('node', [join(proj, 'vendor/pga/tools/init-project.mjs'), '--check', proj], { encoding: 'utf8' });
  // 项目 package 元数据是游戏自己的
  const pkg = JSON.parse(await readFile(join(proj, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'clean-game');
  assert.notEqual(pkg.description, JSON.parse(await readFile(join(payloadDir, 'package.json'), 'utf8')).description);

  // 静态服务：/game/ 与其 import 链可取（运行不依赖绝对路径）
  const port = 47890 + Math.floor(Math.random() * 100);
  server = spawn('node', [join(proj, 'vendor/pga/tools/static-server.mjs'), '.', String(port)], { cwd: proj });
  await new Promise((res, rej) => {
    server.stdout.on('data', () => res());
    server.on('error', rej);
    setTimeout(res, 1500);
  });
  const page = await fetch(`http://127.0.0.1:${port}/game/`).then((r) => r.text());
  assert.match(page, /<canvas/);
  const mainJs = await fetch(`http://127.0.0.1:${port}/game/main.js`).then((r) => r.text());
  assert.match(mainJs, /vendor\/pga\/src\/recipes\/humanoid\.js/);
  const mod = await fetch(`http://127.0.0.1:${port}/vendor/pga/src/recipes/humanoid.js`);
  assert.equal(mod.status, 200);
});
