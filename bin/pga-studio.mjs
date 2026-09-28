#!/usr/bin/env node
/**
 * bin/pga-studio.mjs — PGA Studio JSON CLI（ADR-0008；agent 面向的最小子集）
 *
 *   node bin/pga-studio.mjs create  --doc <file.json> --out <dir> [--display-scale N] [--bg #rrggbb]
 *   node bin/pga-studio.mjs inspect --doc <file.json> [--out <dir>] [--node <id>] [--display-scale N] [--bg #rrggbb]
 *   node bin/pga-studio.mjs export  --doc <file.json> --out <dir> [--max-page N] [--margin N]
 *
 * 合同：stdout 只输出 JSON（成功 { ok:true, result } / 失败 { ok:false, error }）；
 * 人类可读日志一律写 stderr。退出码：0 成功；2 用法/输入错误；3 校验或编译失败；4 覆盖保护拒绝。
 *
 * M1 范围：create/inspect/export。操作执行、候选探索与事务回退自 M2 起（见 docs/plans/agent-studio.md）。
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createFromFile, inspectFromFile, exportFromFile } from '../src/adapters/studio-files.js';
import { StudioDocumentError } from '../src/studio/document.js';
import { StudioOverwriteError } from '../src/adapters/studio-files.js';

const PKG = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const GENERATOR = `procedural-game-assets@${PKG.version}`;
const TOOL_VERSION = `${PKG.version}/pga-studio-1`;

function emit(payload, code) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  process.exit(code);
}

function fail(code, message, exitCode, extra = {}) {
  console.error(`错误：${message}`);
  emit({ ok: false, error: { code, message, target: extra.target ?? null, details: extra.details ?? null, retryable: false, suggestedNextAction: extra.suggestedNextAction ?? null } }, exitCode);
}

const [cmd, ...rest] = process.argv.slice(2);
const opts = {};
for (let i = 0; i < rest.length; i++) {
  const m = rest[i].match(/^--([\w-]+)(?:=(.*))?$/);
  if (m) opts[m[1]] = m[2] ?? (rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true);
}

function intOpt(name, fallback) {
  if (opts[name] === undefined) return fallback;
  const n = Number(opts[name]);
  if (!Number.isInteger(n) || n < 1) fail('INVALID_DOCUMENT', `--${name} 需要正整数，收到 ${JSON.stringify(opts[name])}`, 2);
  return n;
}

function requireOpt(name, usage) {
  if (typeof opts[name] !== 'string' || opts[name].length === 0) fail('INVALID_DOCUMENT', usage, 2);
  return resolve(opts[name]);
}

async function main() {
  const common = {
    toolVersion: TOOL_VERSION,
    generator: GENERATOR,
    displayScale: intOpt('display-scale', 4),
    background: typeof opts.bg === 'string' ? opts.bg : '#202028',
  };
  if (cmd === 'create') {
    const doc = requireOpt('doc', 'create 需要 --doc <file.json>');
    const out = requireOpt('out', 'create 需要 --out <dir>');
    return { result: await createFromFile(doc, out, common) };
  }
  if (cmd === 'inspect') {
    const doc = requireOpt('doc', 'inspect 需要 --doc <file.json>');
    const outDir = typeof opts.out === 'string' ? resolve(opts.out) : undefined;
    const node = typeof opts.node === 'string' ? opts.node : undefined;
    return { result: await inspectFromFile(doc, { ...common, outDir, node }) };
  }
  if (cmd === 'export') {
    const doc = requireOpt('doc', 'export 需要 --doc <file.json>');
    const out = requireOpt('out', 'export 需要 --out <dir>');
    return { result: await exportFromFile(doc, out, { ...common, maxPage: intOpt('max-page', 1024), margin: intOpt('margin', 2) }) };
  }
  fail('UNSUPPORTED_OPERATION', cmd ? `未知命令 '${cmd}'（可用：create, inspect, export）` : '缺少命令（可用：create, inspect, export）', cmd ? 2 : 0);
}

try {
  const { result } = await main();
  emit({ ok: true, command: cmd, result }, 0);
} catch (e) {
  if (e instanceof StudioDocumentError) {
    fail('INVALID_DOCUMENT', e.message, 3, { details: { issues: e.issues }, suggestedNextAction: '修正文档后重试；字段白名单与范围见 docs/plans/agent-studio.md' });
  } else if (e instanceof StudioOverwriteError) {
    fail('UNSAFE_PATH', e.message, 4);
  } else if (e && e.code === 'INVALID_DOCUMENT') {
    fail('INVALID_DOCUMENT', e.message, 3);
  } else if (e && e.code === 'ENOENT') {
    fail('INVALID_DOCUMENT', `文件不存在：${e.path ?? e.message}`, 2);
  } else {
    fail('CLIP_ERROR', e?.message ?? String(e), 3);
  }
}
