#!/usr/bin/env node
/**
 * scripts/install.mjs — 技能安装器（Windows/Codex 环境）
 *
 * 布局（本机惯例）：主存储在 <codex-home>/skills/<name>，
 * 发现入口 <agents-skills>/<name> 是指向主存储的 junction。
 *
 *   node scripts/install.mjs [--codex-home D] [--agents-skills D] [--dry-run]
 *
 * 行为：先校验载荷哈希；已有目录一律先备份（改名加时间戳）再替换；
 * 任一步失败回滚备份。不删除旧目录内容，不覆盖未知文件。
 * 安装完成后请在新会话/重启 Codex App 验证发现链路——本脚本无法替你验证。
 */
import { cp, mkdir, readdir, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'procedural-game-assets';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const CODEX_HOME = opt('--codex-home', process.env.CODEX_HOME ?? 'C:/Users/admin/.codex');
const AGENTS_SKILLS = opt('--agents-skills', 'C:/Users/admin/.agents/skills');
const DRY = args.includes('--dry-run');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

const steps = [];
const log = (msg) => {
  steps.push(msg);
  console.log((DRY ? '[dry] ' : '') + msg);
};

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile()) yield p;
  }
}

/** 安装前校验载荷完整性（防半拷贝/手工改坏） */
async function verifyPayload(toolkitDir) {
  const manifest = JSON.parse(await readFile(join(toolkitDir, '.pga-release.json'), 'utf8'));
  let bad = 0;
  for (const [file, hash] of Object.entries(manifest.files)) {
    let buf;
    try {
      buf = await readFile(join(toolkitDir, file));
    } catch {
      console.error(`载荷缺失：${file}`);
      bad++;
      continue;
    }
    if (sha256(buf) !== hash) {
      console.error(`载荷被改动：${file}`);
      bad++;
    }
  }
  if (bad) throw new Error(`载荷校验失败（${bad} 项），拒绝安装`);
  log(`载荷哈希校验通过（${manifest.fileCount} 文件，${manifest.generator}，来源 ${manifest.builtFrom.slice(0, 7)}）`);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function isSymlink(p) {
  try {
    const s = await stat(p);
    void s;
    const lst = await import('node:fs/promises').then((fs) => fs.lstat(p));
    return lst.isSymbolicLink();
  } catch {
    return false;
  }
}

async function backup(p, tag) {
  const bak = `${p}.backup-${tag}`;
  if (await exists(bak)) throw new Error(`备份目标已存在：${bak}`);
  await rename(p, bak);
  log(`已备份 ${p} → ${bak}`);
  return bak;
}

async function main() {
  const toolkitDir = join(skillDir, 'assets/toolkit');
  await verifyPayload(toolkitDir);

  const codexTarget = join(CODEX_HOME, 'skills', NAME);
  const agentsLink = join(AGENTS_SKILLS, NAME);
  const backups = [];

  try {
    // 1. 主存储
    if (await exists(codexTarget)) {
      if (!DRY) backups.push([codexTarget, await backup(codexTarget, stamp)]);
      else log(`将备份 ${codexTarget}`);
    }
    if (!DRY) {
      await mkdir(dirname(codexTarget), { recursive: true });
      await cp(skillDir, codexTarget, { recursive: true });
      log(`主存储已写入 ${codexTarget}`);
    } else log(`将写入主存储 ${codexTarget}`);

    // 2. 发现入口（.agents/skills/<name>）
    if (await exists(agentsLink)) {
      if (await isSymlink(agentsLink)) {
        if (!DRY) await rm(agentsLink, { force: true });
        log(`已移除旧链接 ${agentsLink}`);
      } else {
        if (!DRY) backups.push([agentsLink, await backup(agentsLink, stamp)]);
        else log(`将备份旧目录 ${agentsLink}（真实目录，非链接）`);
      }
    }
    if (!DRY) {
      try {
        await symlink(codexTarget, agentsLink, 'junction');
        log(`发现入口（junction）${agentsLink} → ${codexTarget}`);
      } catch (e) {
        console.warn(`junction 创建失败（${e.message}），改为整目录复制`);
        await cp(codexTarget, agentsLink, { recursive: true });
        log(`发现入口（复制）${agentsLink}`);
      }
    } else log(`将创建发现入口 ${agentsLink}`);

    // 3. 安装后验证
    if (!DRY) {
      const skillMd = await readFile(join(codexTarget, 'SKILL.md'), 'utf8');
      if (!skillMd.includes('name: procedural-game-assets')) throw new Error('SKILL.md frontmatter 异常');
      const viaLink = await readFile(join(agentsLink, 'SKILL.md'), 'utf8');
      if (viaLink !== skillMd) throw new Error('发现入口与主存储内容不一致');
      await verifyPayload(join(codexTarget, 'assets/toolkit'));
      log('安装后验证通过：SKILL.md、入口一致性、载荷哈希');
    }
  } catch (e) {
    console.error(`安装失败：${e.message}，开始回滚`);
    if (!DRY) {
      for (const [orig, bak] of backups.reverse()) {
        await rm(orig, { recursive: true, force: true });
        await rename(bak, orig);
        console.error(`已恢复 ${orig}`);
      }
    }
    process.exit(3);
  }

  console.log('----');
  console.log(`安装完成${DRY ? '（演练，未改动）' : ''}。备份标记 backup-${stamp}。`);
  console.log('下一步：在新会话或重启 Codex App 后验证技能发现与触发——本脚本无法代替该验证。');
  console.log('回滚：删除上述主存储与入口，把对应 .backup-<时间戳> 目录改回原名。');
}

await main();
