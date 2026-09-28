#!/usr/bin/env node
/**
 * scripts/install.mjs — 技能安装器（Windows/Codex 环境）
 *
 *   node scripts/install.mjs [--codex-home D] [--agents-skills D] [--backups-root D] [--dry-run]
 *
 * 布局：主存储 <codex-home>/skills/<name>；
 * 发现入口 <agents-skills>/<name>（junction 或复制）；
 * 备份 <backups-root>/<name>/（默认 <codex-home>/backups/skills，发现目录之外）。
 * 安装完成后请在新会话/重启 Codex App 验证发现链路——本脚本无法替你验证。
 */
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from './install-core.mjs';

const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = basename(skillDir);

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const CODEX_HOME = opt('--codex-home', process.env.CODEX_HOME ?? 'C:/Users/admin/.codex');
const AGENTS_SKILLS = opt('--agents-skills', 'C:/Users/admin/.agents/skills');
const BACKUPS_ROOT = opt('--backups-root', join(CODEX_HOME, 'backups/skills'));
const DRY = args.includes('--dry-run');
if (args.includes('--help') || args.includes('-h')) {
  console.log('用法：node scripts/install.mjs [--codex-home D] [--agents-skills D] [--backups-root D] [--dry-run]');
  process.exit(0);
}

try {
  const { backups, stamp } = await install({
    skillDir,
    name: NAME,
    codexHome: CODEX_HOME,
    agentsSkills: AGENTS_SKILLS,
    backupsRoot: BACKUPS_ROOT,
    dry: DRY,
    log: (msg) => console.log((DRY ? '[dry] ' : '') + msg),
  });
  console.log('----');
  console.log(`安装完成${DRY ? '（演练，未改动）' : ''}。备份标记 *-backup-${stamp}（位于 ${join(BACKUPS_ROOT, NAME)}）。`);
  console.log('下一步：在新会话或重启 Codex App 后验证技能发现与触发——本脚本无法代替该验证。');
  console.log('回滚：删除主存储与入口，把备份目录改回原名（备份在发现目录之外）。');
  void backups;
} catch (e) {
  console.error(`安装失败：${e.message}`);
  process.exit(3);
}
