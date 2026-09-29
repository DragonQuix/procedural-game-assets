#!/usr/bin/env node
/**
 * bin/pga-studio.mjs — PGA Studio JSON CLI（ADR-0008/0009）
 *
 * 文档模式（M1）：
 *   node bin/pga-studio.mjs create  --doc <file.json> --out <ws> [--display-scale N] [--bg #rrggbb]
 *   node bin/pga-studio.mjs inspect --doc <file.json> [--out <dir>] [--node <id>]
 *   node bin/pga-studio.mjs export  --doc <file.json> --out <dir> [--max-page N] [--margin N]
 *
 * 工作区模式（M2）：
 *   node bin/pga-studio.mjs state   --ws <dir>
 *   node bin/pga-studio.mjs inspect --ws <dir> [--revision rN] [--out <dir>] [--node <id>]
 *   node bin/pga-studio.mjs export  --ws <dir> [--revision rN] --out <dir>
 *   node bin/pga-studio.mjs edit    --ws <dir> --base rN --op <id> --target <目标>
 *                                   [--params '{"w":28}' | --material X | --ramp X | --value <值>]
 *   node bin/pga-studio.mjs explore --ws <dir> --base rN --op <id> --target <目标>
 *                                   [--field w] --values 24,26,28 [--preserve '<json数组>'] [--request-id id]
 *   node bin/pga-studio.mjs commit  --ws <dir> (--accept <candidateId> | --restore rN)
 *                                   --expected-head rN [--request-id id]
 *
 * 合同：stdout 只输出 JSON；人类可读日志一律写 stderr。
 * 退出码：0 成功；2 用法/输入错误；3 校验/编译/候选失败；4 覆盖或工作区路径保护；6 版本/请求冲突；7 工作区占用。
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  createFromFile,
  inspectFromFile,
  inspectWorkspace,
  exportFromFile,
  exportWorkspace,
  observeWorkspace,
  StudioOverwriteError,
} from '../src/adapters/studio-files.js';
import { StudioStore, StudioStoreError } from '../src/adapters/studio-store.js';
import { StudioDocumentError } from '../src/studio/document.js';
import { StudioOperationError } from '../src/studio/operators.js';

const PKG = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const GENERATOR = `procedural-game-assets@${PKG.version}`;
const TOOL_VERSION = `${PKG.version}/pga-studio-1`;

function emit(payload, code) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  process.exit(code);
}

function fail(code, message, exitCode, extra = {}) {
  console.error(`错误：${message}`);
  emit({ ok: false, error: { code, message, target: extra.target ?? null, details: extra.details ?? null, retryable: extra.retryable ?? false, suggestedNextAction: extra.suggestedNextAction ?? null } }, exitCode);
}

const [cmd, ...rest] = process.argv.slice(2);
const opts = {};
for (let i = 0; i < rest.length; i++) {
  const m = rest[i].match(/^--([\w-]+)(?:=(.*))?$/);
  if (m) opts[m[1]] = m[2] ?? (rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true);
}

/** R4：命令级选项白名单——拼错的选项（如 --preserv）明确报用法错误，不悄悄变成无效参数。 */
const COMMAND_OPTS = {
  create: ['doc', 'out', 'display-scale', 'bg'],
  inspect: ['doc', 'ws', 'revision', 'out', 'node', 'display-scale', 'bg'],
  export: ['doc', 'ws', 'revision', 'out', 'max-page', 'margin', 'display-scale', 'bg'],
  submit: ['ws', 'revision', 'out', 'max-page', 'margin', 'display-scale', 'bg'],
  observe: ['ws', 'revision', 'out', 'candidates', 'node', 'display-scale', 'bg'],
  state: ['ws', 'display-scale', 'bg'],
  edit: ['ws', 'base', 'op', 'target', 'params', 'material', 'ramp', 'value', 'preserve', 'request-id', 'display-scale', 'bg', 'safe-binding'],
  explore: ['ws', 'base', 'op', 'target', 'field', 'values', 'params', 'preserve', 'request-id', 'display-scale', 'bg'],
  commit: ['ws', 'accept', 'restore', 'expected-head', 'request-id', 'display-scale', 'bg'],
};
if (COMMAND_OPTS[cmd]) {
  for (const key of Object.keys(opts)) {
    if (!COMMAND_OPTS[cmd].includes(key)) fail('INVALID_DOCUMENT', `命令 '${cmd}' 不支持选项 --${key}（可用：${COMMAND_OPTS[cmd].map((o) => `--${o}`).join(' ')}）`, 2);
  }
}

function intOpt(name, fallback) {
  if (opts[name] === undefined) return fallback;
  const n = Number(opts[name]);
  if (!Number.isInteger(n) || n < 1) fail('INVALID_DOCUMENT', `--${name} 需要正整数，收到 ${JSON.stringify(opts[name])}`, 2);
  return n;
}

function requireOpt(name, usage) {
  if (typeof opts[name] !== 'string' || opts[name].length === 0) fail('INVALID_DOCUMENT', usage, 2);
  return opts[name];
}

function jsonOpt(name, fallback) {
  if (opts[name] === undefined) return fallback;
  try {
    return JSON.parse(opts[name]);
  } catch (e) {
    fail('INVALID_DOCUMENT', `--${name} 不是合法 JSON：${e.message}`, 2);
  }
}

function commonOpts() {
  return {
    toolVersion: TOOL_VERSION,
    generator: GENERATOR,
    displayScale: intOpt('display-scale', 4),
    background: typeof opts.bg === 'string' ? opts.bg : '#202028',
  };
}

function buildOperation() {
  const id = requireOpt('op', '需要 --op <geometry.set|material.set|ramp.set|palette.set|rig.set|art.set>');
  const target = requireOpt('target', `操作 ${id} 需要 --target <目标>`);
  if (id === 'palette.set' || id === 'rig.set' || id === 'art.set') {
    // 角色操作（pga-studio/character/1）：统一 { id, target, value }
    const raw = requireOpt('value', `${id} 需要 --value <值>（颜色 '#rrggbb' / 整数 / ASCII 行 JSON 数组）`);
    try {
      return { id, target, value: JSON.parse(raw) };
    } catch {
      return { id, target, value: raw };
    }
  }
  if (['geometry.set', 'widen_about_center', 'squash_keep_base', 'resize_about_anchor'].includes(id)) {
    const params = jsonOpt('params', null);
    if (!params) fail('INVALID_DOCUMENT', `geometry.set 需要 --params '{"w":28}'`, 2);
    return { id, target, params };
  }
  if (id === 'material.set') return { id, target, material: requireOpt('material', 'material.set 需要 --material <name>') };
  if (id === 'ramp.set') {
    const raw = requireOpt('ramp', 'ramp.set 需要 --ramp <name> 或 --ramp \'{"shades":["#rrggbb"×4]}\'');
    if (raw.startsWith('{')) {
      try {
        return { id, target, ramp: JSON.parse(raw) };
      } catch (e) {
        fail('INVALID_DOCUMENT', `--ramp 不是合法 JSON：${e.message}`, 2);
      }
    }
    return { id, target, ramp: raw };
  }
  return { id, target }; // 未知操作交给 operators 报 UNSUPPORTED_OPERATION
}

function buildExploreSpec() {
  const id = requireOpt('op', '需要 --op <geometry.set|material.set|ramp.set|palette.set|rig.set|art.set>');
  const target = requireOpt('target', `操作 ${id} 需要 --target <目标>`);
  if (id === 'palette.set' || id === 'rig.set' || id === 'art.set') {
    // 角色探索：{ id, target, values }（无 field）
    const raw = requireOpt('values', 'explore 需要 --values <逗号分隔或 JSON 数组>');
    if (raw.startsWith('[')) {
      try {
        return { id, target, values: JSON.parse(raw) };
      } catch (e) {
        fail('INVALID_DOCUMENT', `--values 不是合法 JSON 数组：${e.message}`, 2);
      }
    }
    return {
      id,
      target,
      values: raw.split(',').map((s) => {
        const t = s.trim();
        const n = Number(t);
        return t !== '' && Number.isFinite(n) ? n : t;
      }),
    };
  }
  const field = requireOpt('field', 'explore 需要 --field <字段>');
  const raw = requireOpt('values', 'explore 需要 --values <逗号分隔取值或 JSON 数组>');
  if (raw.startsWith('[')) {
    try {
      return { id, target, field, values: JSON.parse(raw), ...(opts.params ? { params: jsonOpt('params') } : {}) };
    } catch (e) {
      fail('INVALID_DOCUMENT', `--values 不是合法 JSON 数组：${e.message}`, 2);
    }
  }
  const values = raw.split(',').map((s) => {
    const t = s.trim();
    const n = Number(t);
    return t !== '' && Number.isFinite(n) ? n : t;
  });
  return { id, target, field, values, ...(opts.params ? { params: jsonOpt('params') } : {}) };
}

async function main() {
  const common = commonOpts();
  if (cmd === 'observe') return { result: await observeWorkspace(resolve(requireOpt('ws', 'observe 需要 --ws')), resolve(requireOpt('out', 'observe 需要 --out')), { ...common, revision: opts.revision, candidateIds: jsonOpt('candidates', []), node: opts.node }) };
  if (cmd === 'create') {
    const doc = requireOpt('doc', 'create 需要 --doc <file.json>');
    const out = requireOpt('out', 'create 需要 --out <ws>');
    return { result: await createFromFile(resolve(doc), resolve(out), common) };
  }
  if (cmd === 'inspect') {
    if (opts.ws) {
      return {
        result: await inspectWorkspace(resolve(opts.ws), {
          ...common,
          revision: typeof opts.revision === 'string' ? opts.revision : undefined,
          outDir: typeof opts.out === 'string' ? resolve(opts.out) : undefined,
          node: typeof opts.node === 'string' ? opts.node : undefined,
        }),
      };
    }
    const doc = requireOpt('doc', 'inspect 需要 --doc <file.json> 或 --ws <dir>');
    return {
      result: await inspectFromFile(resolve(doc), { ...common, outDir: typeof opts.out === 'string' ? resolve(opts.out) : undefined, node: typeof opts.node === 'string' ? opts.node : undefined }),
    };
  }
  if (cmd === 'export' || cmd === 'submit') {
    if (cmd === 'submit') requireOpt('ws', 'submit 需要 --ws <workspace>');
    const out = requireOpt('out', 'export 需要 --out <dir>');
    const exportOpts = { ...common, maxPage: intOpt('max-page', 1024), margin: intOpt('margin', 2) };
    if (opts.ws) {
      return { result: await exportWorkspace(resolve(opts.ws), resolve(out), { ...exportOpts, revision: typeof opts.revision === 'string' ? opts.revision : undefined }) };
    }
    const doc = requireOpt('doc', 'export 需要 --doc <file.json> 或 --ws <dir>');
    return { result: await exportFromFile(resolve(doc), resolve(out), exportOpts) };
  }
  if (cmd === 'state') {
    const ws = requireOpt('ws', 'state 需要 --ws <dir>');
    const store = await StudioStore.open(resolve(ws), common);
    return { result: await store.state() };
  }
  if (cmd === 'edit') {
    const ws = requireOpt('ws', 'edit 需要 --ws <dir>');
    const base = requireOpt('base', 'edit 需要 --base <revision>');
    const store = await StudioStore.open(resolve(ws), common);
    return {
      result: await store.edit({
        baseRevision: base,
        operation: buildOperation(),
        safeBinding: jsonOpt('safe-binding', undefined),
        preserve: jsonOpt('preserve', []),
        requestId: typeof opts['request-id'] === 'string' ? opts['request-id'] : undefined,
      }),
    };
  }
  if (cmd === 'explore') {
    const ws = requireOpt('ws', 'explore 需要 --ws <dir>');
    const base = requireOpt('base', 'explore 需要 --base <revision>');
    const store = await StudioStore.open(resolve(ws), common);
    return {
      result: await store.explore({
        baseRevision: base,
        spec: buildExploreSpec(),
        preserve: jsonOpt('preserve', []),
        requestId: typeof opts['request-id'] === 'string' ? opts['request-id'] : undefined,
      }),
    };
  }
  if (cmd === 'commit') {
    const ws = requireOpt('ws', 'commit 需要 --ws <dir>');
    const expectedHead = requireOpt('expected-head', 'commit 需要 --expected-head <revision>');
    const store = await StudioStore.open(resolve(ws), common);
    if (opts.accept) {
      return { result: await store.commit({ action: 'accept', candidateId: String(opts.accept), expectedHead, requestId: typeof opts['request-id'] === 'string' ? opts['request-id'] : undefined }) };
    }
    if (opts.restore) {
      return { result: await store.commit({ action: 'restore', targetRevision: String(opts.restore), expectedHead, requestId: typeof opts['request-id'] === 'string' ? opts['request-id'] : undefined }) };
    }
    fail('INVALID_DOCUMENT', 'commit 需要 --accept <candidateId> 或 --restore <revision>', 2);
  }
  fail('UNSUPPORTED_OPERATION', cmd ? `未知命令 '${cmd}'（可用：create, inspect, export, state, edit, explore, commit）` : '缺少命令（可用：create, inspect, export, state, edit, explore, commit）', cmd ? 2 : 0);
}

function exitCodeFor(e) {
  if (e instanceof StudioOverwriteError) return 4;
  const code = e?.code;
  if (code === 'WORKSPACE_BUSY') return 7;
  if (code === 'STALE_REVISION' || code === 'REQUEST_ID_CONFLICT') return 6;
  if (code === 'UNSAFE_PATH') return 4;
  return 3;
}

try {
  const { result } = await main();
  const replay = result && result.idempotentReplay === true;
  emit({ ok: true, command: cmd, ...(replay ? { idempotentReplay: true } : {}), result }, 0);
} catch (e) {
  if (e instanceof StudioDocumentError) {
    fail('INVALID_DOCUMENT', e.message, 3, { details: { issues: e.issues }, suggestedNextAction: '修正文档后重试；字段白名单与范围见 docs/plans/agent-studio.md' });
  } else if (e instanceof StudioOperationError || e instanceof StudioStoreError) {
    fail(e.code, e.message, exitCodeFor(e), { target: e.target, details: e.details, retryable: e.retryable, suggestedNextAction: e.suggestedNextAction });
  } else if (e instanceof StudioOverwriteError) {
    fail('UNSAFE_PATH', e.message, 4);
  } else if (e && e.code === 'PROTECTION_VIOLATION') {
    fail(e.code, e.message, 3, { details: e.details });
  } else if (e && e.code === 'INVALID_DOCUMENT') {
    fail('INVALID_DOCUMENT', e.message, 3);
  } else if (e && e.code === 'ENOENT') {
    fail('INVALID_DOCUMENT', `文件不存在：${e.path ?? e.message}`, 2);
  } else {
    fail('CLIP_ERROR', e?.message ?? String(e), 3);
  }
}
