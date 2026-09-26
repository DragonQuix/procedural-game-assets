#!/usr/bin/env node
/**
 * tools/release.mjs — 发行打包：把经过测试的工具版本复制进技能载荷
 *
 * 从唯一源码（本仓库）复制到 skills/procedural-game-assets/assets/toolkit/，
 * 逐文件计算 sha256 写入 .pga-release.json，复制后重新校验。
 * 载荷目录是派生产物，禁止手工修改（改源再跑本脚本）。
 *
 * 用法：node tools/release.mjs [--check]   --check 只校验不重新生成
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const payloadDir = join(root, 'skills/procedural-game-assets/assets/toolkit');

/** 载荷清单：[源相对路径, 载荷相对路径, 类型] */
const PAYLOAD = [
  ['package.json', 'package.json'],
  ['package-lock.json', 'package-lock.json'],
  ['CONTEXT.md', 'CONTEXT.md'],
  ['bin', 'bin'],
  ['src', 'src'],
  ['tools/gallery', 'tools/gallery'],
  ['tools/static-server.mjs', 'tools/static-server.mjs'],
  ['examples/recipes', 'examples/recipes'],
  ['examples/faults', 'examples/faults'],
  ['examples/canvas-slice', 'examples/canvas-slice'],
  ['examples/godot', 'examples/godot'],
  ['docs/recipe-guide.md', 'docs/recipe-guide.md'],
  ['docs/visual-review.md', 'docs/visual-review.md'],
  ['docs/provenance.md', 'docs/provenance.md'],
  ['docs/adr', 'docs/adr'],
  ['tests', 'tests'],
  ['node_modules/pngjs', 'node_modules/pngjs'],
];

/** 载荷内排除的派生/本地文件 */
const EXCLUDE = /[\\/]assets([\\/]|$)|demo-capture\.png$|node_modules[\\/]\.package-lock/;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile()) yield p;
  }
}

async function hashTree(dir) {
  const files = {};
  for await (const p of walk(dir)) {
    files[relative(dir, p).replaceAll('\\', '/')] = sha256(await readFile(p));
  }
  return files;
}

async function build() {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await rm(payloadDir, { recursive: true, force: true });
  await mkdir(payloadDir, { recursive: true });
  for (const [src, dst] of PAYLOAD) {
    const from = join(root, src);
    const to = join(payloadDir, dst);
    try {
      await stat(from);
    } catch {
      throw new Error(`载荷源不存在：${src}`);
    }
    await cp(from, to, {
      recursive: true,
      filter: (s) => !EXCLUDE.test(s),
    });
  }
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    // 无 git 环境时保留 unknown
  }
  const files = await hashTree(payloadDir);
  const manifest = { generator: `procedural-game-assets@${pkg.version}`, builtFrom: commit, fileCount: Object.keys(files).length, files };
  await writeFile(join(payloadDir, '.pga-release.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`载荷已生成：${payloadDir}`);
  console.log(`版本 ${pkg.version}，来源提交 ${commit.slice(0, 7)}，${manifest.fileCount} 个文件`);
  await check();
}

async function check() {
  const manifest = JSON.parse(await readFile(join(payloadDir, '.pga-release.json'), 'utf8'));
  const actual = await hashTree(payloadDir);
  delete actual['.pga-release.json'];
  const missing = Object.keys(manifest.files).filter((f) => !(f in actual));
  const extra = Object.keys(actual).filter((f) => !(f in manifest.files));
  const changed = Object.keys(manifest.files).filter((f) => actual[f] && actual[f] !== manifest.files[f]);
  if (missing.length || extra.length || changed.length) {
    console.error('载荷校验失败：');
    for (const f of missing) console.error(`  缺失 ${f}`);
    for (const f of extra) console.error(`  多出（疑似手工修改）${f}`);
    for (const f of changed) console.error(`  改动（疑似手工修改）${f}`);
    process.exit(3);
  }
  console.log(`载荷校验通过：${manifest.fileCount} 个文件哈希一致`);
}

const arg = process.argv[2];
if (arg === '--check') await check();
else await build();
