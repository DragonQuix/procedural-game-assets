#!/usr/bin/env node
/**
 * tools/release.mjs — 发行打包：把经过测试的工具版本复制进技能载荷
 *
 * 从唯一源码（本仓库）复制到所选技能的 assets/toolkit/，
 * 逐文件计算 sha256 写入 .pga-release.json，复制后重新校验。
 * 载荷目录是派生产物，禁止手工修改（改源再跑本脚本）。
 *
 * 用法：node tools/release.mjs [--check] [--skill procedural-game-assets-loop]
 * --check 只校验不重新生成；默认入口为 procedural-game-assets。
 */
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { MANIFEST_NAME, hashTree, verifyTree } from './release-manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const skillIndex = args.indexOf('--skill');
const skillName = skillIndex < 0 ? 'procedural-game-assets' : args[skillIndex + 1];
if (!['procedural-game-assets', 'procedural-game-assets-loop'].includes(skillName)) {
  throw new Error('未知技能入口，拒绝写入');
}
const skillDir = join(root, 'skills', skillName);
// 名称严格白名单，删除目标固定在开发仓库的对应派生载荷内。
const payloadDir = resolve(skillDir, 'assets/toolkit');

/** 载荷清单：[源相对路径, 载荷相对路径, 类型] */
const PAYLOAD = [
  ['package.json', 'package.json'],
  ['package-lock.json', 'package-lock.json'],
  ['CONTEXT.md', 'CONTEXT.md'],
  ['docs/PLAN.md', 'docs/PLAN.md'],
  ['bin', 'bin'],
  ['src', 'src'],
  ['tools/gallery', 'tools/gallery'],
  ['tools/static-server.mjs', 'tools/static-server.mjs'],
  ['tools/release-manifest.mjs', 'tools/release-manifest.mjs'],
  ['tools/init-project.mjs', 'tools/init-project.mjs'],
  ['tools/asset-loop.mjs', 'tools/asset-loop.mjs'],
  ['tools/legacy', 'tools/legacy'],
  ['examples/recipes', 'examples/recipes'],
  ['examples/faults', 'examples/faults'],
  ['examples/canvas-slice', 'examples/canvas-slice'],
  ['examples/godot', 'examples/godot'],
  ['docs/recipe-guide.md', 'docs/recipe-guide.md'],
  ['docs/visual-review.md', 'docs/visual-review.md'],
  ['docs/visual-quality.md', 'docs/visual-quality.md'],
  ['docs/provenance.md', 'docs/provenance.md'],
  ['docs/research/asset-loop-landscape.md', 'docs/research/asset-loop-landscape.md'],
  ['docs/adr', 'docs/adr'],
  ['tests', 'tests'],
  ['node_modules/pngjs', 'node_modules/pngjs'],
];

/** 载荷内排除的派生/本地文件 */
const EXCLUDE = /[\\/]assets([\\/]|$)|demo-capture\.png$|node_modules[\\/]\.package-lock/;

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
  const manifest = {
    generator: `procedural-game-assets@${pkg.version}`,
    builtFrom: commit,
    fileCount: Object.keys(files).length,
    pathRoot: '工具包根（携带后的 vendor/pga/）；files 键为相对该根的 POSIX 路径',
    files,
  };
  await writeFile(join(payloadDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + '\n');
  if (skillName !== 'procedural-game-assets') {
    await mkdir(join(skillDir, 'scripts'), { recursive: true });
    for (const file of ['install-core.mjs', 'install.mjs', 'register-harnesses.mjs']) {
      await cp(join(root, 'skills/procedural-game-assets/scripts', file), join(skillDir, 'scripts', file));
    }
  }
  console.log(`载荷已生成：${payloadDir}`);
  console.log(`版本 ${pkg.version}，来源提交 ${commit.slice(0, 7)}，${manifest.fileCount} 个文件`);
  await check();
}

async function check() {
  const manifest = JSON.parse(await readFile(join(payloadDir, MANIFEST_NAME), 'utf8'));
  const diff = await verifyTree(payloadDir);
  if (diff) {
    console.error('载荷校验失败：');
    for (const f of diff.missing) console.error(`  缺失 ${f}`);
    for (const f of diff.extra) console.error(`  多出（疑似手工修改）${f}`);
    for (const f of diff.changed) console.error(`  改动（疑似手工修改）${f}`);
    process.exit(3);
  }
  if (skillName !== 'procedural-game-assets') {
    for (const file of ['install-core.mjs', 'install.mjs', 'register-harnesses.mjs']) {
      const source = await readFile(join(root, 'skills/procedural-game-assets/scripts', file));
      const copy = await readFile(join(skillDir, 'scripts', file));
      if (!source.equals(copy)) throw new Error(`派生安装脚本不一致：${file}`);
    }
  }
  console.log(`载荷校验通过：${manifest.fileCount} 个文件哈希一致`);
}

if (args.includes('--check')) await check();
else await build();
