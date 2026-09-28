/**
 * adapters/studio-store.js — Studio 工作区存储（IO 层，ADR-0001/0009）
 *
 * 目录布局（默认位于项目 work/ 下，复用既有忽略规则）：
 *   <ws>/.pga.json            工具标记（覆盖保护）
 *   <ws>/head.json            { head: 'r3', seq: 3 }——最后一步原子替换，崩溃后仍指向最后完整版本
 *   <ws>/revisions/rN.json    不可变修订 { revision, parent, doc, hashes, source, toolVersion }
 *   <ws>/candidates/c-*.json  未提交候选 { candidateId, baseRevision, operation, preserve, doc, hashes, checks, previews }
 *   <ws>/requests/<id>.json   幂等台账 { requestId, requestHash, result }——重试返回同一结果
 *   <ws>/previews/...         证据 PNG（基准/候选 native+display）
 *   <ws>/lock                 单写者锁（pid；持锁进程死亡后允许接管）
 *
 * 约定（HANDOFF §7）：
 * - edit/explore 绝不移动 head；只有 commit 移动 head，且需 expectedHead 匹配。
 * - 不可变文件先写完整（临时文件 + 原子替换），head 最后更新；`*.tmp-*` 是可识别的未完成残留。
 * - 同 requestId + 同内容重试 → 同一结果；同 requestId + 不同内容 → REQUEST_ID_CONFLICT。
 * - 不自动删除任何文件；状态里如实列出临时残留，清理由调用方明确执行。
 */
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileStudioDocument, renderHash } from '../studio/compiler.js';
import { stableStringify, fnv1aHex } from '../studio/document.js';
import { applyOperation, exploreOperation } from '../studio/operators.js';
import { checkCandidate, preserveFromDocument } from '../studio/protect.js';
import { buildViews } from '../studio/observe.js';
import { encodePNG } from '../export/png.js';

const MARKER = '.pga.json';

export class StudioStoreError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'StudioStoreError';
    this.code = code;
    this.target = extra.target ?? null;
    this.details = extra.details ?? null;
    this.retryable = extra.retryable ?? false;
    this.suggestedNextAction = extra.suggestedNextAction ?? null;
  }
}

export class StudioOverwriteError extends Error {
  constructor(dir) {
    super(`输出目录 ${dir} 非空且不是本工具生成的目录；为避免覆盖你的文件已拒绝。请换空目录或先确认删除。`);
    this.name = 'StudioOverwriteError';
    this.code = 'UNSAFE_PATH';
  }
}

function fail(code, message, extra) {
  throw new StudioStoreError(code, message, extra);
}

/** 覆盖保护：目录非空且没有本工具标记时拒绝写入（与 bin/pga.mjs 同一语义）。 */
export async function ensureOutDir(dir) {
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir);
  if (entries.length === 0 || entries.includes(MARKER)) return;
  throw new StudioOverwriteError(dir);
}

export async function writeMarker(dir, generator) {
  await writeFile(join(dir, MARKER), JSON.stringify({ tool: 'procedural-game-assets', generator }) + '\n');
}

let tmpCounter = 0;
/** 临时文件 + 原子替换；临时文件名为可识别的 `*.tmp-<pid>-<n>` 残留形态。 */
async function writeFileAtomic(path, content) {
  const tmp = `${path}.tmp-${process.pid}-${++tmpCounter}`;
  await writeFile(tmp, content);
  await rename(tmp, path);
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function requestHashOf(payload) {
  return fnv1aHex(stableStringify(payload));
}

export class StudioStore {
  constructor(dir, opts = {}) {
    this.dir = dir;
    this.generator = opts.generator ?? 'unknown';
    this.toolVersion = opts.toolVersion ?? 'unknown';
    this.displayScale = opts.displayScale ?? 4;
    this.background = opts.background ?? '#202028';
    this.head = null;
    this.seq = 0;
    this._compiled = new Map();
  }

  /* ---------- 打开 / 创建 ---------- */

  static async open(dir, opts = {}) {
    const store = new StudioStore(dir, opts);
    let raw;
    try {
      raw = await readFile(join(dir, 'head.json'), 'utf8');
    } catch {
      fail('UNSAFE_PATH', `${dir} 不是 Studio 工作区（缺少 head.json）`, { suggestedNextAction: '先用 create 初始化工作区' });
    }
    const head = JSON.parse(raw);
    store.head = head.head;
    store.seq = head.seq;
    return store;
  }

  static async create(dir, doc, opts = {}) {
    await ensureOutDir(dir);
    try {
      await readFile(join(dir, 'head.json'), 'utf8');
      fail('UNSAFE_PATH', `${dir} 已是 Studio 工作区（head.json 存在）；为不重置历史已拒绝。请换新目录或用 --ws 打开`, { retryable: false });
    } catch (e) {
      if (e instanceof StudioStoreError) throw e;
      // head.json 不存在 → 可以初始化
    }
    const store = new StudioStore(dir, opts);
    await writeMarker(dir, store.generator);
    for (const sub of ['revisions', 'candidates', 'requests', 'previews']) await mkdir(join(dir, sub), { recursive: true });
    const compiled = compileStudioDocument(doc, { toolVersion: store.toolVersion });
    const revision = await store._writeRevision({ doc: compiled.document, parent: null, source: { kind: 'create' }, compiled, bumpSeq: 1 });
    await store._writeHead();
    return { store, revision, compiled };
  }

  /* ---------- 状态 ---------- */

  async state() {
    const revisions = (await readdir(join(this.dir, 'revisions'))).filter((f) => f.endsWith('.json')).sort();
    const candidates = (await readdir(join(this.dir, 'candidates'))).filter((f) => f.endsWith('.json')).sort();
    const candidateInfo = [];
    for (const f of candidates) {
      const c = JSON.parse(await readFile(join(this.dir, 'candidates', f), 'utf8'));
      candidateInfo.push({ candidateId: c.candidateId, baseRevision: c.baseRevision, operation: c.operation.id, target: c.operation.target, status: c.checks.status });
    }
    const staleTempFiles = (await readdir(this.dir)).filter((f) => f.includes('.tmp-'));
    return { head: this.head, seq: this.seq, revisions: revisions.map((f) => f.replace('.json', '')), candidates: candidateInfo, staleTempFiles };
  }

  /* ---------- 内部：修订 / head / 台账 / 锁 ---------- */

  async _writeHead() {
    await writeFileAtomic(join(this.dir, 'head.json'), JSON.stringify({ head: this.head, seq: this.seq }) + '\n');
  }

  async _writeRevision({ doc, parent, source, compiled, bumpSeq }) {
    const next = (bumpSeq ?? this.seq + 1);
    const revision = `r${next}`;
    const record = {
      revision,
      parent,
      doc,
      hashes: compiled.hashes,
      source,
      toolVersion: this.toolVersion,
    };
    await writeFileAtomic(join(this.dir, 'revisions', `${revision}.json`), JSON.stringify(record, null, 2) + '\n');
    this.head = revision;
    this.seq = next;
    this._compiled.set(revision, compiled);
    return record;
  }

  async _readRevision(revision) {
    let raw;
    try {
      raw = await readFile(join(this.dir, 'revisions', `${revision}.json`), 'utf8');
    } catch {
      fail('STALE_REVISION', `修订 '${revision}' 不存在`, { target: revision, retryable: false, suggestedNextAction: '用 state 查看当前修订列表' });
    }
    return JSON.parse(raw);
  }

  async _getCompiled(revision) {
    if (this._compiled.has(revision)) return this._compiled.get(revision);
    const record = await this._readRevision(revision);
    const compiled = compileStudioDocument(record.doc, { toolVersion: this.toolVersion });
    this._compiled.set(revision, compiled);
    return compiled;
  }

  async _acquireLock() {
    const lockPath = join(this.dir, 'lock');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fh = await open(lockPath, 'wx');
        await fh.write(JSON.stringify({ pid: process.pid }) + '\n');
        await fh.close();
        return;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        let pid = null;
        try {
          pid = JSON.parse(await readFile(lockPath, 'utf8')).pid;
        } catch {
          /* 损坏锁按死锁处理 */
        }
        if (pid && pidAlive(pid)) {
          fail('WORKSPACE_BUSY', `工作区被进程 ${pid} 占用`, { retryable: true, suggestedNextAction: '稍后重试；若确认该进程已退出，可人工删除 lock 文件' });
        }
        await rm(lockPath, { force: true }); // 死锁：持锁进程已退出，接管
      }
    }
    fail('WORKSPACE_BUSY', '无法取得工作区锁', { retryable: true });
  }

  async _releaseLock() {
    await rm(join(this.dir, 'lock'), { force: true });
  }

  async _checkLedger(requestId, requestHash) {
    const path = join(this.dir, 'requests', `${requestId}.json`);
    let raw;
    try {
      raw = await readFile(path, 'utf8');
    } catch {
      return null; // 无记录 → 新请求
    }
    const record = JSON.parse(raw);
    if (record.requestHash !== requestHash) {
      fail('REQUEST_ID_CONFLICT', `requestId '${requestId}' 已用于不同内容的请求`, { target: requestId, retryable: false, suggestedNextAction: '更换 requestId 或重发与原请求完全相同的内容' });
    }
    return { ...record.result, idempotentReplay: true };
  }

  async _writeLedger(requestId, requestHash, result) {
    await writeFileAtomic(join(this.dir, 'requests', `${requestId}.json`), JSON.stringify({ requestId, requestHash, result }, null, 2) + '\n');
  }

  /** 在锁内执行幂等变更操作。 */
  async _mutate(requestId, payload, fn) {
    const requestHash = requestHashOf(payload);
    const replay = await this._checkLedger(requestId, requestHash);
    if (replay) return replay;
    await this._acquireLock();
    try {
      const result = await fn();
      await this._writeLedger(requestId, requestHash, result);
      return result;
    } finally {
      await this._releaseLock();
    }
  }

  /* ---------- 预览 ---------- */

  async _writePreviews(compiled, label) {
    const views = buildViews(compiled, { displayScale: this.displayScale, background: this.background });
    const dir = join(this.dir, 'previews', label);
    await mkdir(dir, { recursive: true });
    const files = {
      native: join('previews', label, `${label}.native.png`),
      display: join('previews', label, `${label}.display.png`),
    };
    await writeFile(join(this.dir, files.native), encodePNG(views.native.width, views.native.height, views.native.rgba));
    await writeFile(join(this.dir, files.display), encodePNG(views.display.width, views.display.height, views.display.rgba));
    return files;
  }

  /* ---------- edit / explore / commit ---------- */

  /**
   * edit：从指定基准派生一个未提交候选。绝不移动 head。
   * 保护项 = 文档 constraints + 请求级 preserve 合并。
   */
  async edit({ baseRevision, operation, preserve = [], requestId }) {
    const reqId = requestId ?? `req-${fnv1aHex(stableStringify(['edit', baseRevision, operation, preserve]))}`;
    return this._mutate(reqId, ['edit', baseRevision, operation, preserve], async () => {
      const base = await this._getCompiled(baseRevision);
      const { doc: candDoc, plan } = applyOperation(base.document, operation); // 形状/范围错误向上抛（CANDIDATE_INVALID 等）
      const candidate = compileStudioDocument(candDoc, { toolVersion: this.toolVersion });
      const mergedPreserve = [...preserveFromDocument(base.document), ...preserve];
      const checks = checkCandidate({ baseCompiled: base, candidateCompiled: candidate, plan, preserve: mergedPreserve });
      const candidateId = `c-${fnv1aHex(stableStringify([baseRevision, operation, mergedPreserve]))}`;
      const previews = { base: await this._writePreviews(base, `${baseRevision}-base`), candidate: await this._writePreviews(candidate, candidateId) };
      const record = {
        candidateId,
        baseRevision,
        operation,
        preserve: mergedPreserve,
        doc: candidate.document,
        hashes: candidate.hashes,
        checks,
        previews,
      };
      await writeFileAtomic(join(this.dir, 'candidates', `${candidateId}.json`), JSON.stringify(record, null, 2) + '\n');
      return { requestId: reqId, candidateId, baseRevision, head: this.head, status: checks.status, code: checks.code, conflicts: checks.conflicts, diff: checks.diff, hashes: candidate.hashes, previews };
    });
  }

  /**
   * explore：同基准、同一操作一个字段的有限取值候选；渲染相同者标注去重。
   */
  async explore({ baseRevision, spec, preserve = [], requestId }) {
    const reqId = requestId ?? `req-${fnv1aHex(stableStringify(['explore', baseRevision, spec, preserve]))}`;
    return this._mutate(reqId, ['explore', baseRevision, spec, preserve], async () => {
      const base = await this._getCompiled(baseRevision);
      const entries = exploreOperation(base.document, spec);
      const mergedPreserve = [...preserveFromDocument(base.document), ...preserve];
      const seen = new Map([[base.hashes.renderHash, 'base']]);
      const candidates = [];
      for (const entry of entries) {
        if (entry.error) {
          candidates.push({ value: entry.value, status: 'ERROR', error: entry.error });
          continue;
        }
        const candidate = compileStudioDocument(entry.doc, { toolVersion: this.toolVersion });
        const checks = checkCandidate({ baseCompiled: base, candidateCompiled: candidate, plan: entry.plan, preserve: mergedPreserve });
        const candidateId = `c-${fnv1aHex(stableStringify([baseRevision, { id: spec.id, target: spec.target, field: spec.field, value: entry.value }, mergedPreserve]))}`;
        const duplicateOf = checks.status !== 'REJECTED' ? (seen.get(candidate.hashes.renderHash) ?? null) : null;
        if (!duplicateOf) seen.set(candidate.hashes.renderHash, candidateId);
        const previews = await this._writePreviews(candidate, candidateId);
        const record = {
          candidateId,
          baseRevision,
          operation: { id: spec.id, target: spec.target, params: spec.id === 'geometry.set' ? { [spec.field]: entry.value } : { [spec.field]: entry.value } },
          preserve: mergedPreserve,
          doc: candidate.document,
          hashes: candidate.hashes,
          checks,
          previews: { base: null, candidate: previews },
        };
        await writeFileAtomic(join(this.dir, 'candidates', `${candidateId}.json`), JSON.stringify(record, null, 2) + '\n');
        candidates.push({
          candidateId,
          value: entry.value,
          status: checks.status,
          code: checks.code,
          duplicateOf,
          conflicts: checks.conflicts,
          diff: checks.diff,
          hashes: candidate.hashes,
          previews,
        });
      }
      const basePreviews = await this._writePreviews(base, `${baseRevision}-base`);
      return {
        requestId: reqId,
        baseRevision,
        head: this.head,
        base: { revision: baseRevision, hashes: base.hashes, previews: basePreviews },
        candidates,
        uniqueCount: candidates.filter((c) => c.status !== 'ERROR' && !c.duplicateOf).length,
      };
    });
  }

  /**
   * commit：accept（候选成为新修订）或 restore（引用旧内容的新修订）。唯一移动 head 的入口。
   */
  async commit({ action, candidateId, targetRevision, expectedHead, requestId }) {
    const reqId = requestId ?? `req-${fnv1aHex(stableStringify(['commit', action, candidateId ?? targetRevision, expectedHead]))}`;
    return this._mutate(reqId, ['commit', action, candidateId ?? targetRevision, expectedHead], async () => {
      if (this.head !== expectedHead) {
        fail('STALE_REVISION', `expectedHead '${expectedHead}' 与当前 head '${this.head}' 不符`, {
          target: expectedHead,
          retryable: true,
          suggestedNextAction: '用 state 查看最新 head 与候选后重新决定',
        });
      }
      if (action === 'accept') {
        const record = await this._readCandidate(candidateId);
        if (record.baseRevision !== this.head) {
          fail('STALE_REVISION', `候选 '${candidateId}' 派生自已过期的基准 '${record.baseRevision}'（当前 head '${this.head}'）`, {
            target: candidateId,
            retryable: true,
            suggestedNextAction: '查看新 head 后重新探索',
          });
        }
        // 篡改防护：不信落盘的 checks——用基准 + 操作重新推导文档、重编译并重新执行保护检查
        const base = await this._getCompiled(record.baseRevision);
        const { doc: rederivedDoc, plan } = applyOperation(base.document, record.operation);
        const recompiled = compileStudioDocument(record.doc, { toolVersion: this.toolVersion });
        if (recompiled.hashes.documentHash !== record.hashes.documentHash || recompiled.hashes.renderHash !== record.hashes.renderHash) {
          fail('CANDIDATE_INVALID', `候选 '${candidateId}' 的内容哈希与记录不符（文件可能被篡改）`, { target: candidateId });
        }
        if (stableStringify(rederivedDoc) !== stableStringify(record.doc)) {
          fail('CANDIDATE_INVALID', `候选 '${candidateId}' 的文档与操作重新推导结果不符（文件可能被篡改）`, { target: candidateId });
        }
        const checks = checkCandidate({ baseCompiled: base, candidateCompiled: recompiled, plan, preserve: record.preserve });
        if (checks.status !== record.checks.status) {
          fail('CANDIDATE_INVALID', `候选 '${candidateId}' 落盘状态（${record.checks.status}）与重新校验（${checks.status}）不符（文件可能被篡改）`, { target: candidateId });
        }
        if (checks.status !== 'OK' && checks.status !== 'UNCHANGED') {
          fail('CANDIDATE_INVALID', `候选 '${candidateId}' 状态为 ${checks.status}，未通过保护检查，不能提交`, { target: candidateId, details: { conflicts: checks.conflicts } });
        }
        const revision = await this._writeRevision({
          doc: record.doc,
          parent: this.head,
          source: { kind: 'accept', candidateId, operation: record.operation, unchanged: checks.status === 'UNCHANGED' },
          compiled: recompiled,
        });
        await this._writeHead();
        return { requestId: reqId, action, candidateId, head: this.head, revision: revision.revision, parent: revision.parent, hashes: revision.hashes, unchanged: checks.status === 'UNCHANGED' };
      }
      if (action === 'restore') {
        const target = await this._readRevision(targetRevision);
        const compiled = compileStudioDocument(target.doc, { toolVersion: this.toolVersion });
        const revision = await this._writeRevision({ doc: target.doc, parent: this.head, source: { kind: 'restore', from: targetRevision }, compiled });
        await this._writeHead();
        return { requestId: reqId, action, restoredFrom: targetRevision, head: this.head, revision: revision.revision, parent: revision.parent, hashes: revision.hashes };
      }
      fail('UNSUPPORTED_OPERATION', `未知 commit 动作 '${action}'（可用：accept, restore）`);
    });
  }

  async _readCandidate(candidateId) {
    let raw;
    try {
      raw = await readFile(join(this.dir, 'candidates', `${candidateId}.json`), 'utf8');
    } catch {
      fail('CANDIDATE_INVALID', `候选 '${candidateId}' 不存在`, { target: candidateId });
    }
    return JSON.parse(raw);
  }
}
