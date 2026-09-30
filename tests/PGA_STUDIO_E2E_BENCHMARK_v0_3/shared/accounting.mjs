import { canonical, sha256 } from './hashes.mjs';
export { canonical, sha256 };
export const renderHash = frame => sha256(canonical({ width: frame.width, height: frame.height, rgba: Array.from(frame.rgba) }));
export const stateHash = state => sha256(canonical({ anchor: state.frame.anchor, attachments: state.frame.attachments, layers: state.layers }));

// 源码格式、变量名与注释不是新语义状态；有序部件像素及元数据才是。
export function accountCandidate(ledger, state, sourceHash) {
  const key = `${renderHash(state.frame)}:${stateHash(state)}`;
  const existing = ledger.candidates.find(c => c.key === key);
  if (existing) return { entry: existing, added: false };
  const entry = { id: `c${ledger.candidates.length + 1}`, key, renderHash: renderHash(state.frame), semanticStateHash: stateHash(state), sourceHash };
  ledger.candidates.push(entry);
  return { entry, added: true };
}

export function metrics(ledger) {
  const events = ledger.events ?? [];
  const counts = { candidateCount: ledger.candidates.length,
    lowLevelEditCount: { value: null, comparability: 'NOT_COMPARABLE', reason: '源码编辑批次与 Studio 原子操作不是同一单位；须保留宿主原始轨迹。' },
    manualCoordinateRepairCount: { value: null, comparability: 'NOT_COMPARABLE', reason: '仅凭几何 diff 无法识别修复意图；运行前需冻结跨臂人工编码规范。' },
    semanticTransformCount: 0, relationAwareTransformCount: 0, rejectedOperationCount: 0,
    validationProbeCount: 0, observableRelationDiagnosticCount: 0, retries: 0, errors: 0,
    submitSuccess: ledger.submitted === true, probeInterpretation: 'DIAGNOSTIC_ONLY',
    wallClockMs: null, cpuTimeMs: null, compileInvocations: null, timingInterpretation: 'EXPLORATORY_NOT_COMPARABLE' };
  for (const e of events) {
    for (const k of ['semanticTransformCount', 'relationAwareTransformCount', 'rejectedOperationCount', 'validationProbeCount', 'observableRelationDiagnosticCount', 'retries', 'errors']) {
      if (e[k] !== undefined && (!Number.isSafeInteger(e[k]) || e[k] < 0)) throw new Error(`Invalid ${k}`);
      counts[k] += e[k] ?? 0;
    }
  }
  return counts;
}
