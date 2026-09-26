#!/usr/bin/env node
/**
 * scripts/register-harnesses.mjs — 多宿主技能入口注册
 *
 * 本机惯例：各宿主的 skills/<name> 是指向唯一主存储的链接（与 anysearch 同形态）。
 * 本脚本把 <skillDir>（默认取其父级主存储）以 junction 注册到各宿主：
 *
 *   node scripts/register-harnesses.mjs [--home D] [--dry-run] [--list]
 *
 * - 默认主存储：脚本所在技能目录（即 <codex-home>/skills/procedural-game-assets）
 * - 已存在且指向主存储：保留；已存在且指向他处/为真实目录：备份后重建
 * - OMP 无自有 skills 目录：其 config.yml 的 skills.customDirectories 指向
 *   .zcode/.grok/.dsh/.workbuddy/.cursor 的 skills 目录，随这些入口间接生效，不另建
 * - 每个宿主都需要各自重启/新会话后才会刷新技能列表，本脚本无法代替验证
 */
import { mkdir, readlink, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupTo, exists, isSymlink } from './install-core.mjs';

const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'procedural-game-assets';

/** 默认宿主 skills 目录（相对 --home）。OMP 见头注，不在列表。 */
const HARNESSES = [
  ['Codex 插件层', '.agents/skills'],
  ['Claude Code', '.claude/skills'],
  ['Cursor', '.cursor/skills'],
  ['DeepSeek Harness', '.dsh/skills'],
  ['ZCode', '.zcode/skills'],
  ['workbuddy', '.workbuddy/skills'],
  ['Grok build', '.grok/skills'],
  ['Kimi Code', '.kimi-code/skills'],
];

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const HOME = opt('--home', 'C:/Users/admin');
// 单一真相源是主存储（哈希校验过的版本），不是开发仓库
const SOURCE = opt('--source', join(HOME, '.codex/skills', NAME));
const BACKUPS_ROOT = opt('--backups-root', join(HOME, '.codex/backups/skills'));
const DRY = args.includes('--dry-run');
const LIST = args.includes('--list');

async function resolveLink(p) {
  try {
    return await readlink(p);
  } catch {
    return null;
  }
}

async function main() {
  if (!(await exists(join(SOURCE, 'SKILL.md')))) {
    console.error(`主存储 ${SOURCE} 不含 SKILL.md，拒绝注册（先用 install.mjs 安装主存储）。`);
    process.exit(2);
  }
  console.log(`单一真相源：${SOURCE}`);
  const results = [];
  for (const [label, rel] of HARNESSES) {
    const dir = join(HOME, rel);
    const entry = join(dir, NAME);
    if (LIST) {
      const target = await resolveLink(entry);
      results.push(`${label}: ${entry} → ${target ?? (await exists(entry) ? '（真实目录）' : '（无）')}`);
      continue;
    }
    try {
      if (await exists(entry)) {
        const target = await resolveLink(entry);
        if (target && join(target) === join(SOURCE)) {
          console.log(`✓ ${label}：已指向主存储，保留`);
          results.push([label, 'kept']);
          continue;
        }
        if (await isSymlink(entry)) {
          if (!DRY) await rm(entry, { force: true });
          console.log(`↺ ${label}：移除指向他处的旧链接（${target}）`);
        } else {
          if (!DRY) {
            const [, bak] = await backupTo({ target: entry, backupsRoot: BACKUPS_ROOT, name: NAME, kind: `${rel.split(/[./]/).filter(Boolean)[0].replaceAll(/[^\w-]/g, '-')}`, stamp: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) });
            console.log(`↺ ${label}：旧目录已备份 → ${bak}`);
          } else console.log(`↺ ${label}：将备份旧目录 ${entry}`);
        }
      }
      if (!DRY) {
        await mkdir(dir, { recursive: true });
        await symlink(SOURCE, entry, 'junction');
      }
      console.log(`${DRY ? '[dry] ' : ''}✓ ${label}：${entry} → ${SOURCE}`);
      results.push([label, 'linked']);
    } catch (e) {
      console.error(`✗ ${label}：${e.message}`);
      results.push([label, `failed: ${e.message}`]);
    }
  }
  console.log('----');
  console.log('OMP：无自有 skills 目录，经其 skills.customDirectories（zcode/grok/dsh/workbuddy/cursor）间接生效。');
  console.log('提醒：每个宿主需各自重启或新开会话后才会刷新技能列表。');
  if (LIST) for (const r of results) console.log(r);
}

await main();
