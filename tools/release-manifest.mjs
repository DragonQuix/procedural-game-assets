/**
 * tools/release-manifest.mjs — 发行清单的哈希与校验共用实现
 *
 * 清单（.pga-release.json）的 files 键是**相对工具包根**的路径
 * （携带到项目后为 vendor/pga/ 根）。release.mjs 生成载荷与
 * init-project.mjs 校验携带副本都使用本模块，不各自重写。
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export const MANIFEST_NAME = '.pga-release.json';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile()) yield p;
  }
}

/** 目录树下所有文件的 sha256，键为相对 dir 的 POSIX 路径。 */
export async function hashTree(dir) {
  const files = {};
  for await (const p of walk(dir)) {
    files[relative(dir, p).replaceAll('\\', '/')] = sha256(await readFile(p));
  }
  return files;
}

/**
 * 对照清单与实测哈希。返回 { missing, extra, changed }，三者皆空为通过。
 * 缺失/多出/改动都必须显式列出，不允许静默忽略。
 */
export function diffManifest(manifestFiles, actualFiles) {
  const missing = Object.keys(manifestFiles).filter((f) => !(f in actualFiles));
  const extra = Object.keys(actualFiles).filter((f) => !(f in manifestFiles));
  const changed = Object.keys(manifestFiles).filter((f) => actualFiles[f] && actualFiles[f] !== manifestFiles[f]);
  return { missing, extra, changed };
}

/**
 * 校验 dir 下的树与 dir/manifestName 一致（清单自身不参与比对）。
 * 通过返回 null；失败返回 { missing, extra, changed }。
 */
export async function verifyTree(dir, manifestName = MANIFEST_NAME) {
  const manifest = JSON.parse(await readFile(join(dir, manifestName), 'utf8'));
  const actual = await hashTree(dir);
  delete actual[manifestName];
  const diff = diffManifest(manifest.files, actual);
  return diff.missing.length || diff.extra.length || diff.changed.length ? diff : null;
}
