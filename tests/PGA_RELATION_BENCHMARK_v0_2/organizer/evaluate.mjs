/** 两臂同一最终合同；消费各自工具真实 compiled output，不重新用 D14 渲染 D13。 */
import { checkAssetProtection } from '../../../src/studio/protection-contract.js';
import { evaluateRelations } from '../../../src/studio/relations.js';
import { stableStringify } from '../../../src/studio/document.js';

export function evaluateFinal(compiled, repeatedCompiled, contract, protectionBaseline) {
  const n = compiled.sceneMap.nodes.find(n => n.id === contract.objectives.target)?.frameRect, o = contract.objectives;
  const mechanical = !!n && n.w >= o.minWidth && n.h <= o.maxHeight && n.x + n.w / 2 === o.centerX && n.y + n.h === o.bottomY;
  const protection = checkAssetProtection(contract.protection, protectionBaseline, { ...compiled, document: { ...compiled.document, protection: contract.protection } });
  const relations = evaluateRelations(compiled, { relations: contract.relations });
  const a = compiled.asset.frames[0], b = repeatedCompiled.asset.frames[0];
  const deterministic = a.width === b.width && a.height === b.height && a.rgba.length === b.rgba.length && a.rgba.every((v, i) => v === b.rgba[i]) && stableStringify(a.anchor) === stableStringify(b.anchor) && stableStringify(a.attachments) === stableStringify(b.attachments);
  return { mechanical: mechanical ? 'PASS' : 'FAIL', deterministic: deterministic ? 'PASS' : 'FAIL', protection, relations,
    finalRequiredRelationViolationCount: relations.requiredViolationCount, finalProtectionViolationCount: protection.conflicts.length };
}

export function taskSuccess({ submitted, final, budget, protocol, visual }) {
  const statuses = [final.mechanical, final.deterministic, final.protection.status, final.relations.status, budget, protocol, visual];
  if (!submitted) return 'NOT_SUBMITTED';
  if (statuses.some(s => ['FAIL', 'REJECTED', 'NOT_YET'].includes(s))) return 'FAIL';
  return statuses.every(s => s === 'PASS') ? 'PASS' : 'UNVERIFIED';
}

export function countEvents(events) {
  const uniqueCandidates = new Set();
  const counts = { candidateCount: 0, manualCoordinateRepairCount: 0, rejectedOperationCount: 0, semanticTransformCount: 0,
    relationAwareTransformCount: 0, validationProbeCount: 0, relationEvaluationProbeCount: 0, relationRepairCount: 0, protectionRejectionCount: 0, retries: 0, errors: 0 };
  for (const e of events) {
    if (e.materialized && e.candidateId) uniqueCandidates.add(e.candidateId);
    if (e.manualCoordinateRepair === true) counts.manualCoordinateRepairCount++;
    if (e.rejected === true) counts.rejectedOperationCount++;
    if (e.semanticTransform === true) counts.semanticTransformCount++;
    if (e.relationAwareTransform === true) counts.relationAwareTransformCount++;
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
