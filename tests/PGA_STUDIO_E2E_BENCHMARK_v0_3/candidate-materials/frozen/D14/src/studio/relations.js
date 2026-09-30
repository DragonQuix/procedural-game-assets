/** Pure relation diagnostics over compiled final geometry, never node names. */
import { documentHash } from './document.js';
import { RELATION_INVARIANTS } from './relation-model.js';

const FEATURES = Object.freeze({
  'top-edge': { axis: 'y', sign: -1 }, 'bottom-edge': { axis: 'y', sign: 1 },
  'min-x-edge': { axis: 'x', sign: -1 }, 'max-x-edge': { axis: 'x', sign: 1 },
});
export function relationEdge(sceneNode, feature) {
  const f = FEATURES[feature], r = sceneNode?.frameRect;
  if (!f || !r || !['panel', 'screen'].includes(sceneNode.kind)) return null;
  const size = f.axis === 'x' ? 'w' : 'h', tangent = f.axis === 'x' ? 'y' : 'x', span = f.axis === 'x' ? 'h' : 'w';
  return { ...f, coordinate: r[f.axis] + (f.sign > 0 ? r[size] : 0), interval: [r[tangent], r[tangent] + r[span]], bbox: { ...r } };
}

export function supportedResolution(relation, edgeA, edgeB) {
  const p = relation.resolution;
  return !!(p && edgeA && edgeB && edgeA.axis === edgeB.axis && edgeA.sign === -edgeB.sign &&
    p.axis === edgeA.axis && RELATION_INVARIANTS[p.mode] === p.invariant && ['A', 'B'].includes(p.follower));
}

export function evaluateRelation(relation, compiled) {
  const nodes = compiled.sceneMap?.nodes ?? [];
  const nodeA = nodes.find((n) => n.id === relation.endpointA.nodeId), nodeB = nodes.find((n) => n.id === relation.endpointB.nodeId);
  const edgeA = relationEdge(nodeA, relation.endpointA.feature), edgeB = relationEdge(nodeB, relation.endpointB.feature);
  const result = { relationId: relation.id, type: relation.type, endpointA: { ...relation.endpointA }, endpointB: { ...relation.endpointB },
    required: relation.required, tolerance: relation.tolerance, resolution: relation.resolution ?? null,
    affectedNodeIds: [...new Set([relation.endpointA.nodeId, relation.endpointB.nodeId])],
    status: 'UNSUPPORTED', reason: null, signedGapPx: null, absoluteGapPx: null, overlapPx: null,
    tangentGapPx: null, tangentialOverlapPx: null, coordinates: { space: 'final-frame', edgeA, edgeB }, repair: null };
  if (!nodeA || !nodeB) return { ...result, status: 'CONFLICT', reason: 'MISSING_NODE' };
  if (nodeA.id === nodeB.id) return { ...result, status: 'CONFLICT', reason: 'SAME_NODE' };
  if (relation.type !== 'contact') return { ...result, reason: 'UNSUPPORTED_RELATION_TYPE' };
  if (!edgeA || !edgeB || edgeA.axis !== edgeB.axis || edgeA.sign !== -edgeB.sign) return { ...result, reason: 'UNSUPPORTED_FEATURE_PAIR' };
  const signedGapPx = (edgeB.coordinate - edgeA.coordinate) * edgeA.sign || 0;
  const span = Math.min(edgeA.interval[1], edgeB.interval[1]) - Math.max(edgeA.interval[0], edgeB.interval[0]);
  const status = span < 1 ? 'GAP' : Math.abs(signedGapPx) <= relation.tolerance ? 'SATISFIED' : signedGapPx > 0 ? 'GAP' : 'OVERLAP';
  const repair = supportedResolution(relation, edgeA, edgeB) ? { ...relation.resolution,
    nodeId: relation[`endpoint${relation.resolution.follower}`].nodeId,
    feature: relation[`endpoint${relation.resolution.follower}`].feature,
    supportedSemanticTransforms: ['widen_about_center', 'squash_keep_base', 'resize_about_anchor'] } : null;
  return { ...result, status, reason: span < 1 ? 'INSUFFICIENT_TANGENTIAL_CONTACT' : null,
    signedGapPx, absoluteGapPx: Math.abs(signedGapPx), overlapPx: Math.max(0, -signedGapPx),
    tangentGapPx: Math.max(0, -span), tangentialOverlapPx: Math.max(0, span), repair };
}

export function evaluateRelations(compiled, { revision = null, relations = compiled.document.relations ?? [] } = {}) {
  const entries = relations.map((r) => evaluateRelation(r, compiled));
  const violations = entries.filter((r) => r.required && r.status !== 'SATISFIED');
  return { status: !entries.length ? 'NOT_CONFIGURED' : violations.length ? 'REJECTED' : 'PASS',
    revision, documentHash: compiled.hashes.documentHash, relationContractHash: relations.length ? documentHash(relations) : null,
    requiredViolationCount: violations.length, advisoryViolationCount: entries.filter((r) => !r.required && r.status !== 'SATISFIED').length,
    entries, conflicts: violations.map((r) => ({ kind: 'relation', target: r.relationId, status: r.status, reason: r.reason,
      signedGapPx: r.signedGapPx, absoluteGapPx: r.absoluteGapPx, overlapPx: r.overlapPx })) };
}

export function assertRelations(compiled) {
  const result = evaluateRelations(compiled);
  if (result.status === 'REJECTED') {
    const error = new Error('最终编译未满足 required relation contract');
    error.code = 'RELATION_VIOLATION'; error.details = result;
    throw error;
  }
  return result;
}

export function validateRelationBinding(binding, compiled, revision) {
  const current = evaluateRelations(compiled, { revision });
  if (!binding || binding.revision !== revision || binding.documentHash !== current.documentHash || binding.relationContractHash !== current.relationContractHash) {
    const error = new Error('relation inspection 已过期；请重新 inspect');
    error.code = 'STALE_RELATION_INSPECTION';
    throw error;
  }
}
