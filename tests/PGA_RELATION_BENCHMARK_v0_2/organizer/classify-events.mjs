#!/usr/bin/env node
/**
 * v0.2 冻结事件分类器（计数 schema 的一部分，运行前冻结，不得按结果改口径）。
 *
 * 口径（arm-neutral，全部来自 workspace 台账，不由 participant 自报）：
 * - candidateCount：candidates/*.json 去重数量；预算 6。
 * - semanticTransformCount：operation.id ∈ {widen_about_center, squash_keep_base, resize_about_anchor} 的物化候选。
 * - relationAwareTransformCount：operation.preserveRelations === true 或非空数组的物化候选。
 * - relationRepairCount：Σ 候选 checks.relationRepairs.length。
 * - manualCoordinateRepairCount：operation.id === 'geometry.set' 的物化候选中——
 *   (a) absolutePair：params 同时含 x+w 或 y+h → 计 1；
 *   (b) coordOnly：含 x 或 y 且不含 w/h → 当目标节点 centerX 与 bottomY
 *       均等于其 baseRevision 文档中的值（纯挪位且语义锚点未变）→ 计 1；
 *   (c) 其余（单字段尺寸、vertices 等）不计。
 *   语义变换天然不属于手工修复；比较基准是候选自身的 baseRevision 文档，无需事件时间戳。
 * - validationProbeCount：Σ 候选 validationProbeCount + Σ 被拒请求 result.safeDomain.validation.tested。
 * - relationEvaluationProbeCount：试次目录中可观察的关系诊断产物计数（下界；两臂同口径）。
 * - rejectedOperationCount：result.status ∉ {OK, UNCHANGED} 且无 revision 的请求。
 * - protectionRejectionCount：被拒请求的 conflicts 含 pixels/structure/metadata 类。
 * - retries：result.idempotentReplay === true；errors：result.error 存在或 result.status === 'ERROR'。
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const GEOMETRY_TRANSFORMS = ['widen_about_center', 'squash_keep_base', 'resize_about_anchor'];
const rect = (n) => n && { centerX: n.x + n.w / 2, bottomY: n.y + n.h };

export async function classifyTrialEvents(trialDir) {
  const ws = join(trialDir, 'ws');
  const requestFiles = (await readdir(join(ws, 'requests'))).filter((f) => f.endsWith('.json')).sort();
  const candidateFiles = (await readdir(join(ws, 'candidates'))).filter((f) => f.endsWith('.json')).sort();
  const revisionFiles = (await readdir(join(ws, 'revisions'))).filter((f) => f.endsWith('.json')).sort();

  const revisions = new Map();
  for (const f of revisionFiles) {
    const r = JSON.parse(await readFile(join(ws, 'revisions', f), 'utf8'));
    revisions.set(r.revision, r.doc);
  }
  const candidates = [];
  for (const f of candidateFiles) candidates.push(JSON.parse(await readFile(join(ws, 'candidates', f), 'utf8')));
  const requests = [];
  for (const f of requestFiles) requests.push(JSON.parse(await readFile(join(ws, 'requests', f), 'utf8')));

  const events = [];
  for (const c of candidates) {
    const op = c.operation ?? {};
    const materialized = Array.isArray(c.previews) ? c.previews.length > 0 : !!c.previews;
    const event = { kind: 'candidate', candidateId: c.candidateId, operationId: op.id ?? null, target: op.target ?? null, materialized };
    const preserve = op.preserveRelations;
    event.semanticTransform = GEOMETRY_TRANSFORMS.includes(op.id);
    event.relationAwareTransform = preserve === true || (Array.isArray(preserve) && preserve.length > 0);
    event.relationRepairCount = (c.checks?.relationRepairs ?? []).length;
    event.validationProbeCount = Number.isInteger(c.validationProbeCount) ? c.validationProbeCount : 0;
    if (op.id === 'geometry.set') {
      const p = op.params ?? {};
      const hasX = p.x !== undefined, hasY = p.y !== undefined, hasW = p.w !== undefined, hasH = p.h !== undefined;
      const absolutePair = (hasX && hasW) || (hasY && hasH);
      const coordOnly = (hasX || hasY) && !hasW && !hasH;
      let repair = false;
      if (absolutePair) repair = true;
      else if (coordOnly) {
        const baseDoc = revisions.get(c.baseRevision);
        const now = rect(c.doc?.nodes?.find((n) => n.id === op.target));
        const prev = baseDoc && rect(baseDoc.nodes?.find((n) => n.id === op.target));
        if (now && prev) repair = now.centerX === prev.centerX && now.bottomY === prev.bottomY;
      }
      event.lowLevelGeometryEdit = true;
      event.manualCoordinateRepair = repair;
      event.repairBasis = absolutePair ? 'absolute-pair' : repair ? 'anchor-preserving-nudge' : 'no';
    }
    events.push(event);
  }
  for (const r of requests) {
    const result = r.result ?? {};
    const accepted = result.revision !== undefined;
    const rejected = !accepted && !['OK', 'UNCHANGED'].includes(result.status);
    if (rejected || result.idempotentReplay === true || result.error !== undefined || result.status === 'ERROR') {
      events.push({ kind: 'request', requestId: r.requestId, rejected,
        manualCoordinateRepair: false, semanticTransform: false, relationAwareTransform: false,
        protectionRejected: rejected && (result.conflicts ?? result.checks?.conflicts ?? []).some((c) => ['pixels', 'structure', 'metadata'].includes(c.kind)),
        validationProbeCount: rejected ? (result.safeDomain?.validation?.tested ?? result.safeDomain?.search?.tested ?? 0) : 0,
        relationEvaluationProbeCount: 0, retry: result.idempotentReplay === true, error: result.error !== undefined || result.status === 'ERROR' });
    }
  }
  return { events, revisions: revisions.size };
}

export function countTrialEvents(events) {
  const uniqueCandidates = new Set();
  const counts = { candidateCount: 0, manualCoordinateRepairCount: 0, rejectedOperationCount: 0, semanticTransformCount: 0,
    relationAwareTransformCount: 0, validationProbeCount: 0, relationEvaluationProbeCount: 0, relationRepairCount: 0,
    protectionRejectionCount: 0, retries: 0, errors: 0, lowLevelGeometryEditCount: 0 };
  for (const e of events) {
    if (e.kind === 'candidate' && e.candidateId) uniqueCandidates.add(e.candidateId);
    if (e.manualCoordinateRepair === true) counts.manualCoordinateRepairCount++;
    if (e.rejected === true) counts.rejectedOperationCount++;
    if (e.semanticTransform === true) counts.semanticTransformCount++;
    if (e.relationAwareTransform === true) counts.relationAwareTransformCount++;
    if (e.lowLevelGeometryEdit === true) counts.lowLevelGeometryEditCount++;
    for (const k of ['validationProbeCount', 'relationEvaluationProbeCount', 'relationRepairCount']) {
      if (e[k] !== undefined && (!Number.isInteger(e[k]) || e[k] < 0)) throw new Error(`Invalid event count: ${k}`);
      counts[k] += e[k] ?? 0;
    }
    if (e.protectionRejected === true) counts.protectionRejectionCount++;
    if (e.retry === true) counts.retries++;
    if (e.error === true) counts.errors++;
  }
  counts.candidateCount = uniqueCandidates.size;
  return counts;
}

if (process.argv[1]?.endsWith('classify-events.mjs')) {
  const i = process.argv.indexOf('--trial');
  const trial = i > 0 ? process.argv[i + 1] : null;
  if (!trial) { console.error('用法：node classify-events.mjs --trial <试次目录>'); process.exit(2); }
  const { events } = await classifyTrialEvents(trial);
  console.log(JSON.stringify({ counts: countTrialEvents(events), events }, null, 2));
}
