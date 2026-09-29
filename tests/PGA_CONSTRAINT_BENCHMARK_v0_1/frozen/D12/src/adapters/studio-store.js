/**
 * adapters/studio-store.js — Studio 工作区存储（IO 层，ADR-0001/0009）
 *
 * 目录布局（默认位于项目 work/ 下，复用既有忽略规则）：
 *   <ws>/.pga.json            工具标记（覆盖保护）
 *   <ws>/head.json            { head: 'r3', seq: 3 }——最后一步原子替换，崩溃后仍指向最后完整版本
 *   <ws>/revisions/rN.json    不可变修订 { revision, parent, doc, hashes, source, toolVersion }
 *   <ws>/candidates/c-*.json  未提交候选 { candidateId, baseRevision, operation, preserveRequest, preserveDoc, doc, hashes, checks, previews }
 *   <ws>/requests/<id>.json   幂等台账两阶段 { requestId, requestHash, status: 'pending'|'done', payload|result }
 *   <ws>/previews/...         证据 PNG（基准/候选 native+display）
 *   <ws>/lock                 单写者锁（pid；持锁进程死亡后允许接管）
 *
 * 约定（HANDOFF §7，含 2026-09-28 审查修复轮收紧）：
 * - edit/explore 绝不移动 head；只有 commit 移动 head，且需 expectedHead 匹配。
 * - 不可变文件先写完整（临时文件 + 原子替换），head 最后更新；`*.tmp-*` 是可识别的未完成残留。
 * - 同名修订文件已存在时只允许逐字节相同（崩溃重试的幂等接管），否则报 REVISION_CONFLICT；
 *   历史修订绝不静默覆盖。
 * - 锁内从磁盘重读 head/seq 与请求台账后再校验 expectedHead 与候选基准——打开时缓存的
 *   head 只作读取默认值，不作变更依据；state() 每次重读磁盘（新鲜度合同）。
 * - 请求台账两阶段：先写 pending（含请求指纹）再执行变更，成功后写 done（含结果）。
 *   同 requestId + 同内容重试 → 同一结果；同 requestId + 不同内容 → REQUEST_ID_CONFLICT。
 *   重放 pending（上次变更中途失败）时：既定效果已完整持久化（修订文件在链上且内容哈希
 *   匹配既定推导）则补写 done 返回原结果；无效果则幂等前滚；状态冲突则 STALE_REVISION。
 * - 不自动删除任何文件；状态里如实列出临时残留，清理由调用方明确执行。
 */
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { stableStringify, fnv1aHex } from '../studio/document.js';
import { compileAny, applyAnyOperation, exploreAnyOperation, operationFromAnyExplore, checkAnyCandidate, preserveFromAnyDocument, validatePreserve, docKindOf } from '../studio/dispatch.js';
import { buildViews, buildCharacterViews } from '../studio/observe.js';
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

/** R7：文件 ID 白名单（CLI 与模块 API 的共享边界）；禁路径分隔符、绝对路径与 '..'。 */
export const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const REVISION_ID_RE = /^r[0-9]{1,9}$/;
const CANDIDATE_ID_RE = /^c-[0-9a-f]{8}$/;

export function assertSafeId(id, kind, re = REQUEST_ID_RE) {
  if (typeof id !== 'string' || !re.test(id)) {
    fail('UNSAFE_PATH', `${kind} 非法：${JSON.stringify(id)}（只允许字母数字开头、不超过 64 字符的字母数字与 . _ -；禁止路径分隔符、绝对路径与 '..'）`, { target: typeof id === 'string' ? id : null, retryable: false });
  }
  return id;
}

/** R7 双重防线：ID 白名单之外，resolve 后核实路径仍在工作区内。 */
function workspacePath(wsDir, ...segments) {
  const root = resolve(wsDir);
  const p = resolve(join(wsDir, ...segments));
  if (p !== root && !p.startsWith(root + sep)) {
    fail('UNSAFE_PATH', `路径越出工作区：${segments.join('/')}`, { retryable: false });
  }
  return p;
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
    try {
      await store._refreshHead();
    } catch (e) {
      if (e instanceof StudioStoreError) throw e;
      fail('UNSAFE_PATH', `${dir} 不是 Studio 工作区（缺少 head.json）`, { suggestedNextAction: '先用 create 初始化工作区' });
    }
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
    const compiled = compileAny(doc, { toolVersion: store.toolVersion });
    const revision = await store._writeRevision({ doc: compiled.document, parent: null, source: { kind: 'create' }, compiled, bumpSeq: 1 });
    await store._writeHead();
    return { store, revision, compiled };
  }

  /* ---------- 状态 ---------- */

  async state() {
    await this._refreshHead(); // 新鲜度合同：state 每次重读磁盘 head（R1）
    const revisions = (await readdir(join(this.dir, 'revisions'))).filter((f) => f.endsWith('.json')).sort();
    const candidates = (await readdir(join(this.dir, 'candidates'))).filter((f) => f.endsWith('.json')).sort();
    const candidateInfo = [];
    for (const f of candidates) {
      const c = JSON.parse(await readFile(join(this.dir, 'candidates', f), 'utf8'));
      candidateInfo.push({ candidateId: c.candidateId, baseRevision: c.baseRevision, operation: c.operation.id, target: c.operation.target, status: c.checks.status });
    }
    const pendingRequests = [];
    for (const f of (await readdir(join(this.dir, 'requests'))).filter((f) => f.endsWith('.json')).sort()) {
      const record = JSON.parse(await readFile(join(this.dir, 'requests', f), 'utf8'));
      if (record.status === 'pending') pendingRequests.push(record.requestId);
    }
    const staleTempFiles = (await readdir(this.dir)).filter((f) => f.includes('.tmp-'));
    return { head: this.head, seq: this.seq, revisions: revisions.map((f) => f.replace('.json', '')), candidates: candidateInfo, pendingRequests, staleTempFiles };
  }

  /* ---------- 内部：修订 / head / 台账 / 锁 ---------- */

  /** 从磁盘重读 head.json 并刷新缓存（锁内变更前置与 state 新鲜度共用，R1）。 */
  async _refreshHead() {
    const raw = await readFile(join(this.dir, 'head.json'), 'utf8');
    const head = JSON.parse(raw);
    this.head = head.head;
    this.seq = head.seq;
  }

  async _writeHead() {
    await writeFileAtomic(join(this.dir, 'head.json'), JSON.stringify({ head: this.head, seq: this.seq }) + '\n');
  }

  async _writeRevision({ doc, parent, source, compiled, bumpSeq }) {
    const next = (bumpSeq ?? this.seq + 1);
    const revision = assertSafeId(`r${next}`, 'revision', REVISION_ID_RE);
    const record = {
      revision,
      parent,
      doc,
      hashes: compiled.hashes,
      source,
      toolVersion: this.toolVersion,
    };
    const content = JSON.stringify(record, null, 2) + '\n';
    const path = workspacePath(this.dir, 'revisions', `${revision}.json`);
    // 历史修订绝不静默覆盖（R1）：同名文件已存在时只允许逐字节相同
    // （崩溃重试的幂等接管），否则明确报冲突。
    let existing = null;
    try {
      existing = await readFile(path, 'utf8');
    } catch {
      /* 不存在 → 正常写入 */
    }
    if (existing !== null && existing !== content) {
      fail('REVISION_CONFLICT', `修订 '${revision}' 已存在且内容不同；为不覆盖历史已拒绝`, { target: revision, retryable: false, suggestedNextAction: '用 state 核对当前修订；这是完整性保护，不要删除既有修订文件' });
    }
    if (existing === null) await writeFileAtomic(path, content);
    this.head = revision;
    this.seq = next;
    this._compiled.set(revision, compiled);
    return record;
  }

  async _readRevision(revision) {
    let raw;
    try {
      raw = await readFile(workspacePath(this.dir, 'revisions', `${assertSafeId(revision, 'revision', REVISION_ID_RE)}.json`), 'utf8');
    } catch (e) {
      if (e instanceof StudioStoreError) throw e;
      fail('STALE_REVISION', `修订 '${revision}' 不存在`, { target: revision, retryable: false, suggestedNextAction: '用 state 查看当前修订列表' });
    }
    return JSON.parse(raw);
  }

  async _getCompiled(revision) {
    if (this._compiled.has(revision)) return this._compiled.get(revision);
    const record = await this._readRevision(revision);
    const compiled = compileAny(record.doc, { toolVersion: this.toolVersion });
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

  _ledgerPath(requestId) {
    return workspacePath(this.dir, 'requests', `${assertSafeId(requestId, 'requestId')}.json`);
  }

  /** 读取请求台账记录；无记录返回 null。 */
  async _readLedger(requestId) {
    let raw;
    try {
      raw = await readFile(this._ledgerPath(requestId), 'utf8');
    } catch {
      return null; // 无记录 → 新请求
    }
    return JSON.parse(raw);
  }

  /** 写台账记录（pending 或 done，临时文件 + 原子替换）。 */
  async _writeLedger(requestId, record) {
    await writeFileAtomic(this._ledgerPath(requestId), JSON.stringify(record, null, 2) + '\n');
  }

  async _deleteLedger(requestId) {
    await rm(this._ledgerPath(requestId), { force: true });
  }

  /**
   * 在锁内执行幂等变更操作（R1/R6）。
   * 流程：锁外只读快速路径（done 记录不可变，读取安全）→ 锁内重读 head 与台账 →
   * 无记录则写 pending → 执行 → 写 done；fn 失败时尽力删除 pending（head 未移动，
   * 孤儿修订由重试经 _writeRevision 的逐字节核对幂等接管）。
   * 重放 pending 走 _recover 恢复路径。
   */
  async _mutate(requestId, payload, fn) {
    const requestHash = requestHashOf(payload);
    const quick = await this._readLedger(requestId);
    if (quick) {
      if (quick.requestHash !== requestHash) {
        fail('REQUEST_ID_CONFLICT', `requestId '${requestId}' 已用于不同内容的请求`, { target: requestId, retryable: false, suggestedNextAction: '更换 requestId 或重发与原请求完全相同的内容' });
      }
      if (quick.status !== 'pending') return { ...quick.result, idempotentReplay: true };
    }
    await this._acquireLock();
    try {
      await this._refreshHead(); // R1：锁内重读持久化 head，旧实例不得凭缓存变更
      const record = await this._readLedger(requestId); // R1：锁内再核台账
      if (record) {
        if (record.requestHash !== requestHash) {
          fail('REQUEST_ID_CONFLICT', `requestId '${requestId}' 已用于不同内容的请求`, { target: requestId, retryable: false, suggestedNextAction: '更换 requestId 或重发与原请求完全相同的内容' });
        }
        if (record.status !== 'pending') return { ...record.result, idempotentReplay: true };
        return await this._recover(requestId, requestHash, payload, fn);
      }
      await this._writeLedger(requestId, { requestId, requestHash, status: 'pending', payload });
      let result;
      try {
        result = await fn();
      } catch (e) {
        await this._deleteLedger(requestId).catch(() => {}); // 尽力清理；删除失败留下的 pending 由恢复路径处理
        throw e;
      }
      await this._writeLedger(requestId, { requestId, requestHash, status: 'done', result });
      return result;
    } finally {
      await this._releaseLock();
    }
  }

  /**
   * R6：重放 pending（上次变更在执行后、done 落盘前中断）的恢复。
   * - edit/explore：效果幂等且不移动 head，直接前滚重执行。
   * - commit：既定效果已完整持久化（既定修订在链上且内容与既定推导逐字节一致）→
   *   补写 done 返回原结果；head 仍是基准（无效果，可能有内容相同的孤儿修订）→ 幂等前滚；
   *   其余状态（槽位被他人内容占据或 head 已移动而效果未持久化）→ STALE_REVISION。
   */
  async _recover(requestId, requestHash, payload, fn) {
    if (payload[0] !== 'commit') {
      const result = await fn();
      await this._writeLedger(requestId, { requestId, requestHash, status: 'done', result });
      return result;
    }
    const [, action, subject, expectedHead] = payload; // subject = candidateId（accept）或 targetRevision（restore）
    const baseSeq = /^r([0-9]+)$/.exec(expectedHead ?? '');
    const intendedRevision = baseSeq ? `r${Number(baseSeq[1]) + 1}` : null;
    const persisted = intendedRevision ? await this._readIntendedCommitEffect(requestId, action, subject, expectedHead, intendedRevision) : null;
    if (persisted) {
      // 既定效果已在历史链上：返回原结果（head 之后是否继续前进不影响既成事实）
      await this._writeLedger(requestId, { requestId, requestHash, status: 'done', result: persisted });
      return { ...persisted, idempotentReplay: true };
    }
    if (this.head === expectedHead) {
      const result = await fn(); // 无效果或仅内容相同的孤儿修订：幂等前滚
      await this._writeLedger(requestId, { requestId, requestHash, status: 'done', result });
      return result;
    }
    fail('STALE_REVISION', `requestId '${requestId}' 的上次提交中途失败，且当前 head '${this.head}' 既非基准 '${expectedHead}' 也无可核实的既定结果；无法安全恢复`, {
      target: requestId,
      retryable: true,
      suggestedNextAction: '用 state 查看最新 head 与修订内容后，按新基准重新发起请求',
    });
  }

  /**
   * 重推导 commit 的既定效果并核实其已完整持久化：修订文件在链上（parent === 基准）、
   * 内容与既定推导逐字节一致、内容哈希与重编译一致。全部满足返回原结果对象，否则 null。
   */
  async _readIntendedCommitEffect(requestId, action, subject, expectedHead, intendedRevision) {
    let record;
    try {
      record = await this._readRevision(intendedRevision);
    } catch {
      return null;
    }
    if (record.revision !== intendedRevision || record.parent !== expectedHead) return null;
    const base = await this._getCompiled(expectedHead);
    const recompiled = compileAny(record.doc, { toolVersion: this.toolVersion });
    if (recompiled.hashes.documentHash !== record.hashes.documentHash || recompiled.hashes.renderHash !== record.hashes.renderHash) return null;
    if (action === 'accept') {
      const candidate = await this._readCandidate(subject);
      let mergedPreserve;
      try {
        mergedPreserve = this._authoritativePreserve(base, candidate);
      } catch {
        return null; // 保护记录被篡改的候选无法核实既定效果，按未持久化处理
      }
      const expectedCandidateId = `c-${fnv1aHex(stableStringify([expectedHead, candidate.operation, mergedPreserve]))}`;
      if (expectedCandidateId !== subject || candidate.candidateId !== subject) return null;
      const { doc: intendedDoc, plan } = applyAnyOperation(base.document, candidate.operation);
      if (stableStringify(intendedDoc) !== stableStringify(record.doc)) return null;
      const checks = checkAnyCandidate({ baseCompiled: base, candidateCompiled: recompiled, plan, preserve: mergedPreserve });
      return { requestId, action, candidateId: subject, head: intendedRevision, revision: intendedRevision, parent: expectedHead, hashes: record.hashes, unchanged: checks.status === 'UNCHANGED' };
    }
    if (action === 'restore') {
      const target = await this._readRevision(subject);
      if (stableStringify(target.doc) !== stableStringify(record.doc)) return null;
      return { requestId, action, restoredFrom: subject, head: intendedRevision, revision: intendedRevision, parent: expectedHead, hashes: record.hashes };
    }
    return null;
  }

  /* ---------- 预览 ---------- */

  async _writePreviews(compiled, label) {
    const dir = join(this.dir, 'previews', label);
    await mkdir(dir, { recursive: true });
    if (compiled.kind === 'character') {
      const views = buildCharacterViews(compiled, { displayScale: this.displayScale, background: this.background, encode: encodePNG });
      const files = { frames: {}, player: join('previews', label, `${label}.player.html`) };
      for (const fv of views.frames) {
        files.frames[fv.id] = {
          native: join('previews', label, `${label}.${fv.id}.native.png`),
          display: join('previews', label, `${label}.${fv.id}.display.png`),
        };
        await writeFile(join(this.dir, files.frames[fv.id].native), encodePNG(fv.native.width, fv.native.height, fv.native.rgba));
        await writeFile(join(this.dir, files.frames[fv.id].display), encodePNG(fv.display.width, fv.display.height, fv.display.rgba));
      }
      await writeFile(join(this.dir, files.player), views.playerHtml);
      return files;
    }
    const views = buildViews(compiled, { displayScale: this.displayScale, background: this.background });
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
   * 保护项 = 文档 constraints + 请求级 preserve 合并，两侧共用 validatePreserve 严格校验（R4）。
   * 候选记录拆分 preserveRequest（请求级，commit 权威合并的来源之一）与 preserveDoc（信息性）。
   */
  async edit({ baseRevision, operation, preserve = [], requestId }) {
    const reqId = requestId ?? `req-${fnv1aHex(stableStringify(['edit', baseRevision, operation, preserve]))}`;
    return this._mutate(reqId, ['edit', baseRevision, operation, preserve], async () => {
      const base = await this._getCompiled(baseRevision);
      const kind = docKindOf(base.document);
      const preserveRequest = validatePreserve(preserve, base.document, kind); // R4：拼错/未知目标/未知类别在此明确拒绝
      const preserveDoc = validatePreserve(preserveFromAnyDocument(base.document), base.document, kind);
      const mergedPreserve = [...preserveDoc, ...preserveRequest];
      const { doc: candDoc, plan } = applyAnyOperation(base.document, operation); // 形状/范围错误向上抛（CANDIDATE_INVALID 等）
      const candidate = compileAny(candDoc, { toolVersion: this.toolVersion });
      const checks = checkAnyCandidate({ baseCompiled: base, candidateCompiled: candidate, plan, preserve: mergedPreserve });
      const candidateId = `c-${fnv1aHex(stableStringify([baseRevision, operation, mergedPreserve]))}`;
      const previews = { base: await this._writePreviews(base, `${baseRevision}-base`), candidate: await this._writePreviews(candidate, candidateId) };
      const record = {
        candidateId,
        baseRevision,
        operation,
        preserveRequest,
        preserveDoc,
        doc: candidate.document,
        hashes: candidate.hashes,
        checks,
        previews,
      };
      await writeFileAtomic(workspacePath(this.dir, 'candidates', `${candidateId}.json`), JSON.stringify(record, null, 2) + '\n');
      return { requestId: reqId, candidateId, baseRevision, head: this.head, status: checks.status, code: checks.code, conflicts: checks.conflicts, diff: checks.diff, checks, hashes: candidate.hashes, previews };
    });
  }

  /**
   * explore：同基准、同一操作一个字段的有限取值候选；渲染相同者标注去重。
   */
  async explore({ baseRevision, spec, preserve = [], requestId }) {
    const reqId = requestId ?? `req-${fnv1aHex(stableStringify(['explore', baseRevision, spec, preserve]))}`;
    return this._mutate(reqId, ['explore', baseRevision, spec, preserve], async () => {
      const base = await this._getCompiled(baseRevision);
      const kind = docKindOf(base.document);
      const preserveRequest = validatePreserve(preserve, base.document, kind); // R4
      const preserveDoc = validatePreserve(preserveFromAnyDocument(base.document), base.document, kind);
      const mergedPreserve = [...preserveDoc, ...preserveRequest];
      const entries = exploreAnyOperation(base.document, spec);
      const seen = new Map([[base.hashes.renderHash, 'base']]);
      const candidates = [];
      for (const entry of entries) {
        if (entry.error) {
          candidates.push({ value: entry.value, status: 'ERROR', error: entry.error });
          continue;
        }
        const candidate = compileAny(entry.doc, { toolVersion: this.toolVersion });
        const checks = checkAnyCandidate({ baseCompiled: base, candidateCompiled: candidate, plan: entry.plan, preserve: mergedPreserve });
        // 探索项 → 标准 operation 与候选身份：与 edit 同一公式，commit 重执行/重算共用（R3/R5）
        const operation = operationFromAnyExplore(base.document, spec, entry.value);
        const candidateId = `c-${fnv1aHex(stableStringify([baseRevision, operation, mergedPreserve]))}`;
        const duplicateOf = checks.status !== 'REJECTED' ? (seen.get(candidate.hashes.renderHash) ?? null) : null;
        if (!duplicateOf) seen.set(candidate.hashes.renderHash, candidateId);
        const previews = await this._writePreviews(candidate, candidateId);
        const record = {
          candidateId,
          baseRevision,
          operation,
          preserveRequest,
          preserveDoc,
          doc: candidate.document,
          hashes: candidate.hashes,
          checks,
          previews: { base: null, candidate: previews },
        };
        await writeFileAtomic(workspacePath(this.dir, 'candidates', `${candidateId}.json`), JSON.stringify(record, null, 2) + '\n');
        candidates.push({
          candidateId,
          value: entry.value,
          status: checks.status,
          code: checks.code,
          duplicateOf,
          conflicts: checks.conflicts,
          diff: checks.diff,
          checks,
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
        // R5：保护列表也不信落盘——从基准修订重取文档级 constraints，与候选的请求级保护
        // 重新合并并重算候选身份；三者（基准+操作+保护）任一被改动都会改变身份，即拒绝。
        const mergedPreserve = this._authoritativePreserve(base, record);
        const expectedCandidateId = `c-${fnv1aHex(stableStringify([record.baseRevision, record.operation, mergedPreserve]))}`;
        if (expectedCandidateId !== record.candidateId || record.candidateId !== candidateId) {
          fail('CANDIDATE_INVALID', `候选 '${candidateId}' 的身份（基准+操作+保护）与重新计算不符（文件可能被篡改）`, { target: candidateId });
        }
        const { doc: rederivedDoc, plan } = applyAnyOperation(base.document, record.operation);
        const recompiled = compileAny(record.doc, { toolVersion: this.toolVersion });
        if (recompiled.hashes.documentHash !== record.hashes.documentHash || recompiled.hashes.renderHash !== record.hashes.renderHash) {
          fail('CANDIDATE_INVALID', `候选 '${candidateId}' 的内容哈希与记录不符（文件可能被篡改）`, { target: candidateId });
        }
        if (stableStringify(rederivedDoc) !== stableStringify(record.doc)) {
          fail('CANDIDATE_INVALID', `候选 '${candidateId}' 的文档与操作重新推导结果不符（文件可能被篡改）`, { target: candidateId });
        }
        const checks = checkAnyCandidate({ baseCompiled: base, candidateCompiled: recompiled, plan, preserve: mergedPreserve });
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
        const compiled = compileAny(target.doc, { toolVersion: this.toolVersion });
        const revision = await this._writeRevision({ doc: target.doc, parent: this.head, source: { kind: 'restore', from: targetRevision }, compiled });
        await this._writeHead();
        return { requestId: reqId, action, restoredFrom: targetRevision, head: this.head, revision: revision.revision, parent: revision.parent, hashes: revision.hashes };
      }
      fail('UNSUPPORTED_OPERATION', `未知 commit 动作 '${action}'（可用：accept, restore）`);
    });
  }

  /**
   * R5：权威保护合并 = 基准文档的 constraints（重取，候选记录删不掉）+ 候选记录的
   * 请求级 preserveRequest（严格校验后）。候选记录缺少 preserveRequest 视为旧格式或篡改，拒绝。
   */
  _authoritativePreserve(base, candidateRecord) {
    const kind = docKindOf(base.document);
    const preserveDoc = validatePreserve(preserveFromAnyDocument(base.document), base.document, kind);
    if (!Array.isArray(candidateRecord.preserveRequest)) {
      fail('CANDIDATE_INVALID', `候选 '${candidateRecord.candidateId}' 缺少 preserveRequest 记录（旧格式或文件被篡改）`, { target: candidateRecord.candidateId ?? null });
    }
    try {
      const preserveRequest = validatePreserve(candidateRecord.preserveRequest, base.document, kind);
      return [...preserveDoc, ...preserveRequest];
    } catch (e) {
      fail('CANDIDATE_INVALID', `候选 '${candidateRecord.candidateId}' 的请求级保护记录非法或已被篡改：${e.message}`, { target: candidateRecord.candidateId ?? null });
    }
  }

  async _readCandidate(candidateId) {
    let raw;
    try {
      raw = await readFile(workspacePath(this.dir, 'candidates', `${assertSafeId(candidateId, 'candidateId', CANDIDATE_ID_RE)}.json`), 'utf8');
    } catch (e) {
      if (e instanceof StudioStoreError) throw e;
      fail('CANDIDATE_INVALID', `候选 '${candidateId}' 不存在`, { target: candidateId });
    }
    return JSON.parse(raw);
  }
}
