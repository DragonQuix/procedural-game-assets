/**
 * tests/integration/install.test.js — 安装脚本核心（install-core）集成测试
 *
 * 在临时目录中模拟 codexHome/agentsSkills/backupsRoot：
 * 首次安装 → 主存储+入口一致；再次安装 → 旧版备份落在发现目录之外；
 * 载荷损坏 → 拒绝安装且现有安装不被触碰。
 * 注意：本测试在发行载荷中自动跳过（载荷不含 skills/scripts）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(here, '../../skills/procedural-game-assets');
const corePath = join(skillDir, 'scripts/install-core.mjs');
const hasCore = existsSync(corePath);
const { install, verifyPayload } = hasCore ? await import(pathToFileURL(corePath).href) : { install: null, verifyPayload: null };

test('安装核心', { skip: !hasCore && '载荷不含 skills/scripts（本测试仅在开发仓库运行）' }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pga-install-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const codexHome = join(root, 'codex-home');
  const agentsSkills = join(root, 'agents-skills');
  const backupsRoot = join(root, 'backups/skills');
  const skillsDir = join(codexHome, 'skills');
  const logs = [];
  const log = (m) => logs.push(m);
  const NAME = 'procedural-game-assets';

  await t.test('首次安装：主存储与发现入口一致，载荷可验证', async () => {
    await install({ skillDir, name: NAME, codexHome, agentsSkills, backupsRoot, log });
    const mainMd = await readFile(join(skillsDir, NAME, 'SKILL.md'), 'utf8');
    const entryMd = await readFile(join(agentsSkills, NAME, 'SKILL.md'), 'utf8');
    assert.equal(entryMd, mainMd);
    assert.match(mainMd, /name: procedural-game-assets/);
    const check = await verifyPayload(join(skillsDir, NAME, 'assets/toolkit'));
    assert.equal(check.bad, 0);
    // 首次安装无备份
    assert.equal(existsSync(join(backupsRoot, NAME)), false);
  });

  await t.test('再次安装：旧版备份落在发现目录之外，发现目录内无 backup 残留', async () => {
    await install({ skillDir, name: NAME, codexHome, agentsSkills, backupsRoot, log });
    const backups = await readdir(join(backupsRoot, NAME));
    assert.equal(backups.length, 1);
    assert.match(backups[0], /^codex-backup-\d{14}$/);
    for (const dir of [skillsDir, agentsSkills]) {
      const entries = await readdir(dir);
      assert.ok(!entries.some((e) => e.includes('backup')), `${dir} 内不应有可被发现的备份目录`);
      assert.ok(entries.includes(NAME));
    }
  });

  await t.test('载荷损坏：拒绝安装且现有内容不被触碰', async () => {
    const sentinel = join(skillDir, 'assets/toolkit/package.json');
    const original = readFileSync(sentinel, 'utf8');
    // 不修改开发源：复制一份技能包到临时位置再破坏
    const brokenSkill = join(root, 'broken-skill');
    await cp(skillDir, brokenSkill, { recursive: true });
    const pkgPath = join(brokenSkill, 'assets/toolkit/package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    pkg.version = '0.0.0-corrupted';
    await writeFile(pkgPath, JSON.stringify(pkg));
    await assert.rejects(
      install({ skillDir: brokenSkill, name: NAME, codexHome, agentsSkills, backupsRoot, log }),
      /载荷校验失败/,
    );
    // 现有安装未被触碰
    const mainMd = await readFile(join(skillsDir, NAME, 'SKILL.md'), 'utf8');
    assert.match(mainMd, /name: procedural-game-assets/);
    const check = await verifyPayload(join(skillsDir, NAME, 'assets/toolkit'));
    assert.equal(check.bad, 0);
    assert.ok(readFileSync(sentinel, 'utf8') === original);
  });
});
