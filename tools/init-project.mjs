#!/usr/bin/env node
/**
 * tools/init-project.mjs — 干净目录初始化：携带工具包到 vendor/pga/ 并建立项目身份
 *
 *   node tools/init-project.mjs <目标目录> [--name 项目名] [--from 工具包目录]
 *   node tools/init-project.mjs --check <项目目录>
 *
 * 正常从已安装的发行载荷运行（载荷根即 --from 默认值）。源目录必须带有
 * .pga-release.json（发行清单）；开发仓库根没有清单，请先从载荷运行
 * （或先 `node tools/release.mjs` 生成载荷）。
 *
 * 初始化做三件事：
 * 1. 把清单列出的全部文件复制到 <目标>/vendor/pga/，逐文件 sha256 复核——
 *    缺失、损坏、多出都响亮失败（退出码 3），不静默忽略。
 * 2. 在项目根建立游戏自身身份：package.json（游戏名/版本/描述/可运行脚本）、
 *    CONTEXT.md（游戏自己的上下文；工具包上下文只指 vendor/pga/ 里那份）、README.md。
 * 3. 把模板 examples/canvas-slice 复制为 game/ 并把 import 改写为指向
 *    vendor/pga/ 的相对路径（Node 与浏览器都能解析）；附 tests/game-smoke.test.js。
 *
 * 清单 files 键的路径根是工具包根（即 vendor/pga/），不管理项目根文件；
 * game/ 是用户的游乐场，不参与哈希校验。
 *
 * 退出码：0 成功；2 用法/输入错误；3 校验失败；4 覆盖保护拒绝。
 */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST_NAME, verifyTree } from './release-manifest.mjs';

const TOOLKIT_NAME = 'procedural-game-assets';

/** 模板复制到 game/ 后的 import/引用改写（相对路径，Node 与浏览器通用） */
const REWRITES = [
  ['from \'../../../../src/', 'from \'../../../vendor/pga/src/'],
  ['from \'/src/', 'from \'../vendor/pga/src/'],
  ['from \'/examples/recipes/', 'from \'../vendor/pga/examples/recipes/'],
  ['src="/examples/canvas-slice/main.js"', 'src="./main.js"'],
  ['http://127.0.0.1:47850/examples/canvas-slice/', 'http://127.0.0.1:47850/game/'],
];

function fail(message, code) {
  console.error(`错误：${message}`);
  process.exit(code);
}

async function rewriteFile(src, dst) {
  let text = await readFile(src, 'utf8');
  for (const [from, to] of REWRITES) text = text.replaceAll(from, to);
  await writeFile(dst, text);
}

/** 复制模板目录为 game/，文本文件改写 import，跳过 assets/ 派生目录与 README。 */
async function copyGame(srcDir, dstDir) {
  await mkdir(dstDir, { recursive: true });
  for (const entry of await readdir(srcDir, { withFileTypes: true })) {
    if (entry.name === 'assets' || entry.name === 'README.md') continue;
    const s = join(srcDir, entry.name);
    const d = join(dstDir, entry.name);
    if (entry.isDirectory()) await copyGame(s, d);
    else if (/\.(js|mjs|html)$/.test(entry.name)) await rewriteFile(s, d);
    else await cp(s, d);
  }
}

const gameSmokeTest = `import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game/template/logic/game.js';
import { makeLevel } from '../game/template/logic/collision.js';

test('模板冒烟：推进、暂停边沿、重启复位', () => {
  const g = createGame({
    level: makeLevel(['..........', '##########']),
    content: { frames: {}, player: { x: 16, y: 0 }, enemies: [{ x: 140, y: 0 }] },
  });
  g.step(3, {});
  assert.equal(g.state().tick, 3);
  g.step(1, { pause: true });
  assert.equal(g.paused, true);
  g.step(2, {});
  assert.equal(g.state().tick, 3, '暂停时不推进');
  g.step(1, { pause: false });
  assert.equal(g.paused, true, '布尔快照保持边沿语义');
  g.step(1, { restart: true });
  assert.equal(g.state().tick, 0);
  assert.equal(g.paused, false);
});
`;

function projectPackage(name) {
  return JSON.stringify({
    name,
    version: '0.1.0',
    private: true,
    description: `用 ${TOOLKIT_NAME} 工具包制作的网页游戏`,
    type: 'module',
    scripts: {
      serve: 'node vendor/pga/tools/static-server.mjs . 47850',
      test: 'node --test "tests/**/*.test.js"',
      check: `node vendor/pga/tools/init-project.mjs --check .`,
    },
  }, null, 2) + '\n';
}

const projectContext = (name) => `# CONTEXT — ${name}

本项目是用 procedural-game-assets 工具包制作的网页游戏。本文件记录**游戏项目自身**的术语与边界。

- 工具包携带在 \`vendor/pga/\`：其 \`CONTEXT.md\` 与发行清单 \`.pga-release.json\`
  只管理该目录（清单路径根 = vendor/pga/），与本项目根文件无关——
  两个 CONTEXT.md 同名不同物，各有归属，不再需要同名例外解释。
- 游戏代码在 \`game/\`（模板副本，随意修改；import 已指向 vendor/pga/）；测试在 \`tests/\`。
- 运行：\`npm run serve\` → http://127.0.0.1:47850/game/
- 携带完整性：\`npm run check\`（缺失/损坏/多出都会失败，不静默忽略）。
`;

const projectReadme = (name) => `# ${name}

用 procedural-game-assets 工具包（\`vendor/pga/\`）制作的网页游戏。

- 运行：\`npm run serve\` → http://127.0.0.1:47850/game/
- 测试：\`npm test\`
- 携带完整性校验：\`npm run check\`
- 工具包文档：\`vendor/pga/CONTEXT.md\`、\`vendor/pga/docs/\`（配方指南、视觉验收、ADR）；
  模板结构说明见技能主文档与 \`vendor/pga/examples/canvas-slice/\` 源码注释。
- 做自己的游戏：改 \`game/template/demo-content.js\` 的关卡/敌人/手感数据，
  规则只加在 \`game/template/logic/\`（无 DOM、可 node 测试），表现只放 \`game/template/render/\`。
  新资产配方参考 \`vendor/pga/examples/recipes/\` 与 \`vendor/pga/docs/recipe-guide.md\`。
`;

async function writeIfAbsent(path, content, made) {
  if (existsSync(path)) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  made.push(path);
}

/** 校验项目：vendor/pga 哈希 + 项目根 package 元数据。返回问题列表（空=通过）。 */
async function checkProject(projectDir) {
  const problems = [];
  const vendorDir = join(projectDir, 'vendor', 'pga');
  if (!existsSync(join(vendorDir, MANIFEST_NAME))) {
    problems.push(`缺少 ${MANIFEST_NAME}（${vendorDir} 不是完整携带副本）`);
  } else {
    const diff = await verifyTree(vendorDir);
    if (diff) {
      for (const f of diff.missing) problems.push(`携带缺失 ${f}`);
      for (const f of diff.extra) problems.push(`携带多出（疑似手工修改）${f}`);
      for (const f of diff.changed) problems.push(`携带损坏（哈希不一致）${f}`);
    }
  }
  const pkgPath = join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) {
    problems.push('项目根缺少 package.json（游戏自身身份）');
  } else {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    if (!pkg.name) problems.push('项目 package.json 缺少 name');
    else if (pkg.name === TOOLKIT_NAME) problems.push(`项目 package.json 的 name 仍是工具包名 ${TOOLKIT_NAME}，应改为游戏名`);
    if (!pkg.version) problems.push('项目 package.json 缺少 version');
    if (!pkg.description) problems.push('项目 package.json 缺少 description');
    if (!pkg.scripts?.serve) problems.push('项目 package.json 缺少可运行脚本 scripts.serve');
  }
  return problems;
}

async function cmdInit(targetArg, opts) {
  if (!targetArg) fail('需要目标目录：node tools/init-project.mjs <目标目录> [--name 项目名] [--from 工具包目录]', 2);
  const target = resolve(targetArg);
  const source = resolve(opts.from ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const manifestPath = join(source, MANIFEST_NAME);
  if (!existsSync(manifestPath)) {
    fail(`源目录 ${source} 没有 ${MANIFEST_NAME}（不是发行载荷）。请从已安装的技能载荷运行，或先 node tools/release.mjs 生成载荷后用 --from 指向载荷目录`, 2);
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const name = opts.name ?? basename(target);
  // 项目名校验在写入之前：与工具包同名注定过不了 --check，不能在报告成功后才暴露
  if (name === TOOLKIT_NAME) {
    fail(`项目名不能与工具包同名（${TOOLKIT_NAME}）；请用 --name 指定游戏名`, 2);
  }
  const existingPkgPath = join(target, 'package.json');
  if (existsSync(existingPkgPath)) {
    const existing = JSON.parse(await readFile(existingPkgPath, 'utf8'));
    if (existing.name === TOOLKIT_NAME) {
      fail(`目标目录已有 package.json 且 name 仍是工具包名 ${TOOLKIT_NAME}——不是合格的项目身份。请先改名或换目录；本脚本不覆盖已有文件`, 2);
    }
  }
  const vendorDir = join(target, 'vendor', 'pga');
  if (existsSync(vendorDir) && (await readdir(vendorDir)).length > 0) {
    fail(`${vendorDir} 已存在且非空；为避免覆盖已拒绝。如需重来请先自行删除该目录`, 4);
  }

  // 1. 携带：清单列出的全部文件 + 清单本身
  await mkdir(vendorDir, { recursive: true });
  const entries = [...Object.keys(manifest.files), MANIFEST_NAME];
  for (const rel of entries) {
    const from = join(source, rel);
    try {
      await stat(from);
    } catch {
      fail(`源载荷缺少清单文件 ${rel}——源载荷本身不完整，中止`, 3);
    }
    await mkdir(dirname(join(vendorDir, rel)), { recursive: true });
    await cp(from, join(vendorDir, rel));
  }
  const diff = await verifyTree(vendorDir);
  if (diff) {
    await rm(vendorDir, { recursive: true, force: true });
    console.error('携带后哈希复核失败，已移除不完整的 vendor/pga/：');
    for (const f of diff.missing) console.error(`  缺失 ${f}`);
    for (const f of diff.extra) console.error(`  多出 ${f}`);
    for (const f of diff.changed) console.error(`  损坏 ${f}`);
    process.exit(3);
  }

  // 2. 项目身份 + 3. 模板副本与冒烟测试（已存在则不覆盖）
  const made = [];
  await writeIfAbsent(join(target, 'package.json'), projectPackage(name), made);
  await writeIfAbsent(join(target, 'CONTEXT.md'), projectContext(name), made);
  await writeIfAbsent(join(target, 'README.md'), projectReadme(name), made);
  await writeIfAbsent(join(target, 'tests', 'game-smoke.test.js'), gameSmokeTest, made);
  if (!existsSync(join(target, 'game'))) {
    await copyGame(join(source, 'examples', 'canvas-slice'), join(target, 'game'));
    made.push(join(target, 'game'));
  }

  console.log(`初始化完成：${target}`);
  console.log(`携带 ${manifest.fileCount ?? Object.keys(manifest.files).length} 个文件到 vendor/pga/（${manifest.generator ?? TOOLKIT_NAME}），哈希复核一致`);
  console.log(`下一步：cd ${target} && npm test && npm run serve → http://127.0.0.1:47850/game/`);
}

async function cmdCheck(targetArg) {
  if (!targetArg) fail('--check 需要项目目录', 2);
  const target = resolve(targetArg);
  const problems = await checkProject(target);
  if (problems.length) {
    console.error(`携带/身份校验失败（${target}）：`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(3);
  }
  console.log(`携带与项目身份校验通过：${target}（vendor/pga/ 哈希一致，清单路径根为 vendor/pga/）`);
}

const [cmd, ...rest] = process.argv.slice(2);
const positional = rest.filter((a) => !a.startsWith('--'));
const opts = {};
for (let i = 0; i < rest.length; i++) {
  const m = rest[i].match(/^--([\w-]+)(?:=(.*))?$/);
  if (m) opts[m[1]] = m[2] ?? (rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true);
}

try {
  if (cmd === '--check') await cmdCheck(positional[0]);
  else await cmdInit(cmd, opts);
} catch (e) {
  fail(e.message, 3);
}
