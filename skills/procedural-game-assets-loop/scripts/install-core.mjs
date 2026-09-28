/**
 * scripts/install-core.mjs — 技能安装核心（可注入路径，供 CLI 与测试复用）
 *
 * 布局（本机惯例）：主存储 <codexHome>/skills/<name>；
 * 发现入口 <agentsSkills>/<name>（junction 或复制）；
 * 备份 <backupsRoot>/<name>/{codex,agents}-backup-<时间戳>。
 * 约束：备份绝不写进两个发现目录内部（避免同名技能被重复发现）。
 */
import { cp, mkdir, readdir, readFile, readlink, rename, rm, stat, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile()) yield p;
  }
}

export async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** 是否为链接（symlink 或 junction）。Windows junction 的 lstat.isSymbolicLink() 为 false，改用 readlink 探测。 */
export async function isSymlink(p) {
  try {
    await readlink(p);
    return true;
  } catch {
    return false;
  }
}

/** 安装前校验载荷完整性（防半拷贝/手工改坏）。bad=0 为通过。 */
export async function verifyPayload(toolkitDir) {
  const manifest = JSON.parse(await readFile(join(toolkitDir, '.pga-release.json'), 'utf8'));
  let bad = 0;
  const errors = [];
  for (const [file, hash] of Object.entries(manifest.files)) {
    let buf;
    try {
      buf = await readFile(join(toolkitDir, file));
    } catch {
      errors.push(`载荷缺失：${file}`);
      bad++;
      continue;
    }
    if (sha256(buf) !== hash) {
      errors.push(`载荷被改动：${file}`);
      bad++;
    }
  }
  return { bad, errors, manifest };
}

/**
 * 备份：移动到 <backupsRoot>/<name>/<kind>-backup-<stamp>。
 * 返回 [原路径, 备份路径]。
 */
export async function backupTo({ target, backupsRoot, name, kind, stamp }) {
  const dir = join(backupsRoot, name);
  await mkdir(dir, { recursive: true });
  const bak = join(dir, `${kind}-backup-${stamp}`);
  if (await exists(bak)) throw new Error(`备份目标已存在：${bak}`);
  await rename(target, bak);
  return [target, bak];
}

/**
 * 执行安装。opts.log(msg) 输出步骤；opts.dry 只演练。
 * 返回 { backups, steps }；失败时回滚并抛错。
 */
export async function install({ skillDir, name, codexHome, agentsSkills, backupsRoot, dry = false, log = () => {} }) {
  if (!backupsRoot) throw new Error('必须显式给出 backupsRoot（备份不得落在发现目录内）');
  const toolkitDir = join(skillDir, 'assets/toolkit');
  const check = await verifyPayload(toolkitDir);
  if (check.bad) throw new Error(`载荷校验失败（${check.bad} 项）：\n${check.errors.join('\n')}`);
  log(`载荷哈希校验通过（${check.manifest.fileCount} 文件，${check.manifest.generator}，来源 ${check.manifest.builtFrom.slice(0, 7)}）`);

  const codexTarget = join(codexHome, 'skills', name);
  const agentsLink = join(agentsSkills, name);
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backups = [];

  try {
    // 1. 主存储（已有内容先备份到发现目录之外）
    if (await exists(codexTarget)) {
      if (!dry) {
        const pair = await backupTo({ target: codexTarget, backupsRoot, name, kind: 'codex', stamp });
        backups.push(pair);
        log(`已备份 ${pair[0]} → ${pair[1]}`);
      } else log(`将备份 ${codexTarget}`);
    }
    if (!dry) {
      await mkdir(join(codexHome, 'skills'), { recursive: true });
      await cp(skillDir, codexTarget, { recursive: true });
      log(`主存储已写入 ${codexTarget}`);
    } else log(`将写入主存储 ${codexTarget}`);

    // 2. 发现入口
    if (await exists(agentsLink)) {
      if (await isSymlink(agentsLink)) {
        if (!dry) await rm(agentsLink, { force: true });
        log(`已移除旧链接 ${agentsLink}`);
      } else if (!dry) {
        const pair = await backupTo({ target: agentsLink, backupsRoot, name, kind: 'agents', stamp });
        backups.push(pair);
        log(`已备份 ${pair[0]} → ${pair[1]}`);
      } else log(`将备份旧目录 ${agentsLink}（真实目录，非链接）`);
    }
    if (!dry) {
      try {
        await mkdir(agentsSkills, { recursive: true }); // 父目录可能不存在（新环境）
        await symlink(codexTarget, agentsLink, 'junction');
        log(`发现入口（junction）${agentsLink} → ${codexTarget}`);
      } catch (e) {
        log(`junction 创建失败（${e.message}），改为整目录复制`);
        await cp(codexTarget, agentsLink, { recursive: true });
        log(`发现入口（复制）${agentsLink}`);
      }
    } else log(`将创建发现入口 ${agentsLink}`);

    // 3. 安装后验证
    if (!dry) {
      const skillMd = await readFile(join(codexTarget, 'SKILL.md'), 'utf8');
      if (!skillMd.includes(`name: ${name}`)) throw new Error('SKILL.md frontmatter 异常');
      const viaLink = await readFile(join(agentsLink, 'SKILL.md'), 'utf8');
      if (viaLink !== skillMd) throw new Error('发现入口与主存储内容不一致');
      const again = await verifyPayload(join(codexTarget, 'assets/toolkit'));
      if (again.bad) throw new Error('安装后载荷校验失败');
      log('安装后验证通过：SKILL.md、入口一致性、载荷哈希');
    }
    return { backups, stamp };
  } catch (e) {
    if (!dry) {
      for (const [orig, bak] of backups.reverse()) {
        await rm(orig, { recursive: true, force: true });
        await rename(bak, orig);
        log(`已恢复 ${orig}`);
      }
    }
    throw e;
  }
}
