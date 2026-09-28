/**
 * tests/integration/register-harnesses.test.js — 多宿主入口注册 CLI 端到端
 *
 * 在临时 --home 下造空宿主目录，注册 → 全部 junction 指向主存储；
 * 重跑幂等；预置真实目录的宿主被备份到发现目录之外。
 * 载荷中自动跳过（载荷不含 skills/scripts）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readlink, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, '../../skills/procedural-game-assets/scripts/register-harnesses.mjs');
const skillDir = resolve(here, '../../skills/procedural-game-assets');
const hasScript = existsSync(script);

test('register-harnesses', { skip: !hasScript && '载荷不含 skills/scripts（本测试仅在开发仓库运行）' }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pga-harness-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  // 八个宿主空 skills 目录
  for (const h of ['.agents', '.claude', '.cursor', '.dsh', '.zcode', '.workbuddy', '.grok', '.kimi-code']) {
    await mkdir(join(home, h, 'skills'), { recursive: true });
  }
  // zcode 预置"用户旧版"（真实目录）
  await cp(skillDir, join(home, '.zcode/skills/procedural-game-assets'), { recursive: true });
  const backupsRoot = join(home, 'backups/skills');

  const run = () =>
    execFileSync(process.execPath, [script, '--home', home, '--source', skillDir, '--backups-root', backupsRoot], { encoding: 'utf8' });

  await t.test('注册：全部入口指向主存储；预置真实目录被备份到外', async () => {
    const out = run();
    assert.match(out, /单一真相源/);
    for (const h of ['.agents', '.claude', '.cursor', '.dsh', '.zcode', '.workbuddy', '.grok', '.kimi-code']) {
      const entry = join(home, h, 'skills/procedural-game-assets');
      assert.equal(await readlink(entry).catch(() => null), skillDir, `${h} 未指向主存储`);
    }
    const backups = await readdir(join(backupsRoot, 'procedural-game-assets'));
    assert.equal(backups.length, 1); // 仅 zcode 的预置目录
    assert.match(backups[0], /^zcode-backup-\d{14}$/);
    // 发现目录内无 backup 残留
    for (const h of ['.claude', '.dsh', '.zcode']) {
      assert.ok(!(await readdir(join(home, h, 'skills'))).some((e) => e.includes('backup')), `${h} 内有残留`);
    }
  });

  await t.test('幂等：重跑全部保留，无新备份', async () => {
    const out = run();
    assert.equal((out.match(/已指向主存储，保留/g) ?? []).length, 8);
    assert.equal((await readdir(join(backupsRoot, 'procedural-game-assets'))).length, 1);
  });
});
