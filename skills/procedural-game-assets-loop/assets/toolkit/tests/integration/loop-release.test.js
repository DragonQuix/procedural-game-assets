import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { verifyTree } from '../../tools/release-manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const skill = join(root, 'skills/procedural-game-assets-loop');
const available = existsSync(join(skill, 'assets/toolkit/.pga-release.json'));

test('循环版独立载荷：复制后 CLI、专名安装与原版共存', {
  skip: !available && '载荷内不含开发仓库的技能发行目录',
}, async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'pga-loop-release-'));
  t.after(() => rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }));
  const copied = join(temp, 'portable/procedural-game-assets-loop');
  await cp(skill, copied, { recursive: true });
  assert.equal(await verifyTree(join(copied, 'assets/toolkit')), null);
  const output = execFileSync(process.execPath, [join(copied, 'assets/toolkit/tools/asset-loop.mjs'), '--help'], { encoding: 'utf8' });
  assert.match(output, /pga-loop\/1/);
  const cleanEnv = { ...process.env }; delete cleanEnv.NODE_TEST_CONTEXT;
  const tests = execFileSync(process.execPath, ['--test', 'tests/unit/asset-loop.test.js'], {
    cwd: join(copied, 'assets/toolkit'), encoding: 'utf8', env: cleanEnv,
  });
  assert.match(tests, /# fail 0/);
  assert.match(tests, /# pass [1-9]\d*/);
  const home = join(temp, 'codex-home');
  const agents = join(temp, 'agents');
  // 测试安装只写临时目录，不接触用户共享安装。
  const original = join(home, 'skills/procedural-game-assets');
  await mkdir(original, { recursive: true });
  await cp(join(root, 'skills/procedural-game-assets/SKILL.md'), join(original, 'SKILL.md'));
  const before = await readFile(join(original, 'SKILL.md'));
  execFileSync(process.execPath, [join(copied, 'scripts/install.mjs'), '--codex-home', home,
    '--agents-skills', agents, '--backups-root', join(temp, 'backups')], { encoding: 'utf8' });
  assert.deepEqual(await readFile(join(original, 'SKILL.md')), before);
  assert.match(await readFile(join(agents, 'procedural-game-assets-loop/SKILL.md'), 'utf8'), /name: procedural-game-assets-loop/);
  assert.equal(await verifyTree(join(home, 'skills/procedural-game-assets-loop/assets/toolkit')), null);
});

test('Git 携带：保留 pngjs 与精确字节，autocrlf=true 检出后仍通过清单', {
  skip: !available && '仅在开发仓库验证发行规则',
}, async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'pga-loop-git-'));
  t.after(() => rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }));
  const repo = join(temp, 'repository');
  const checkout = join(temp, 'checkout');
  await mkdir(repo); await mkdir(checkout);
  await cp(join(root, '.gitattributes'), join(repo, '.gitattributes'));
  await cp(join(root, '.gitignore'), join(repo, '.gitignore'));
  const relSkill = 'skills/procedural-game-assets-loop';
  await cp(skill, join(repo, relSkill), { recursive: true });
  const git = (args) => execFileSync('git', ['-c', 'core.autocrlf=true', ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '--quiet']);
  git(['add', '.']);
  const tracked = git(['ls-files', `${relSkill}/assets/toolkit/node_modules/pngjs`]);
  assert.match(tracked, /lib\/png\.js/);
  git(['checkout-index', '--all', `--prefix=${checkout.replaceAll('\\', '/')}/`]);
  assert.equal(await verifyTree(join(checkout, relSkill, 'assets/toolkit')), null);
});
