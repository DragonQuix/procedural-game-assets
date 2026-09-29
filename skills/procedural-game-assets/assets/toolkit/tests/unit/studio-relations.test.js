import test from 'node:test';
import assert from 'node:assert/strict';
import { compileStudioDocument as compile } from '../../src/studio/compiler.js';
import { normalizeStudioDocument, SCHEMA_VERSIONS } from '../../src/studio/document.js';
import { evaluateRelations, evaluateRelation, assertRelations, validateRelationBinding } from '../../src/studio/relations.js';
import { resolveRelations } from '../../src/studio/relation-resolution.js';
import { applyOperation } from '../../src/studio/operators.js';
import { checkCandidate, preserveFromDocument } from '../../src/studio/protect.js';
import { enumerateSafeDomain, evaluateSafeOperation, preflightGeometry, validateSafeBinding } from '../../src/studio/safe-domain.js';
import { relationFixture as fixture, squash } from '../fixtures/studio-v14.js';

const entry = (doc) => compile(doc).relations.entries[0];
const check = (doc, op) => {
  const base = compile(doc), result = applyOperation(doc, op), candidate = compile(result.doc);
  return { ...result, compiled: candidate, checks: checkCandidate({ baseCompiled: base, candidateCompiled: candidate, plan: result.plan, preserve: preserveFromDocument(base.document) }) };
};
const domain = (doc, extra = {}) => enumerateSafeDomain({ compiled: compile(doc), revision: 'r1', operator: 'squash_keep_base', target: 'node.a', field: 'deltaHeight', ...extra });

test('relation evaluator: exact contact, 1px gap, overlap, tolerance and deterministic diagnostics', () => {
  const doc = fixture();
  assert.equal(entry(doc).status, 'SATISFIED');
  assert.equal(entry(doc).signedGapPx, 0);
  doc.nodes[1].h--;
  assert.equal(entry(doc).status, 'GAP'); assert.equal(entry(doc).signedGapPx, 1); assert.equal(entry(doc).absoluteGapPx, 1);
  doc.relations[0].tolerance = 1;
  assert.equal(entry(doc).status, 'SATISFIED');
  doc.nodes[1].h += 3; doc.relations[0].tolerance = 0;
  assert.equal(entry(doc).status, 'OVERLAP'); assert.equal(entry(doc).signedGapPx, -2); assert.equal(entry(doc).overlapPx, 2);
  assert.deepEqual(evaluateRelations(compile(doc)), evaluateRelations(compile(doc)));
});

test('relation evaluator: unsupported feature/type, missing node, wrong axis and point-only contact', () => {
  const doc = fixture(), c = compile(doc), r = doc.relations[0];
  assert.equal(evaluateRelation({ ...r, type: 'unknown' }, c).status, 'UNSUPPORTED');
  assert.equal(evaluateRelation({ ...r, endpointB: { ...r.endpointB, feature: 'vertex-1' } }, c).status, 'UNSUPPORTED');
  assert.equal(evaluateRelation({ ...r, endpointB: { ...r.endpointB, nodeId: 'node.missing' } }, c).status, 'CONFLICT');
  assert.equal(evaluateRelation({ ...r, endpointB: { ...r.endpointB, feature: 'max-x-edge' } }, c).status, 'UNSUPPORTED');
  doc.nodes[1].x = 24;
  assert.equal(entry(doc).reason, 'INSUFFICIENT_TANGENTIAL_CONTACT'); assert.equal(entry(doc).status, 'GAP');
});

test('relation schema: stable IDs, strict fields, required flag and no inferred legacy relations', () => {
  const doc = fixture();
  for (const mutate of [d => d.relations.push(d.relations[0]), d => delete d.relations[0].required,
    d => d.relations[0].tolerance = -1, d => d.relations[0].endpointA.side = 'left', d => d.relations[0].resolution.follower = 'node.b']) {
    const invalid = structuredClone(doc); mutate(invalid); assert.throws(() => normalizeStudioDocument(invalid), { code: 'INVALID_DOCUMENT' });
  }
  const base = doc.protection.baseline;
  const hashes = [];
  for (const schemaVersion of SCHEMA_VERSIONS) {
    const c = compile({ ...base, schemaVersion });
    hashes.push(c.hashes.renderHash); assert.equal(c.relations.status, 'NOT_CONFIGURED');
    if (schemaVersion !== 'pga-studio/4') assert.throws(() => compile({ ...base, schemaVersion, relations: [] }), { code: 'INVALID_DOCUMENT' });
  }
  assert.equal(new Set(hashes).size, 1);
});

test('resolution: resize follower edge holds opposite edge and primary base; protection AND relation', () => {
  const result = check(fixture(), squash(true, -4));
  assert.equal(result.doc.nodes[0].y + result.doc.nodes[0].h, 24);
  assert.deepEqual([result.doc.nodes[1].y, result.doc.nodes[1].h], [5, 11]);
  assert.equal(result.checks.status, 'OK'); assert.equal(result.compiled.protection.status, 'PASS');
  assert.equal(result.checks.relationStatus, 'PASS'); assert.equal(result.checks.relationRepairs.length, 1);
  assert.equal(result.checks.diff.outside, 0);
});

test('resolution: translate follower preserves size and orthogonal geometry; explicit ID list', () => {
  const doc = fixture({ mode: 'translate-follower' }), r = check(doc, squash(['R1'], -3));
  assert.deepEqual([r.doc.nodes[1].x, r.doc.nodes[1].y, r.doc.nodes[1].w, r.doc.nodes[1].h], [14, 8, 4, 7]);
  assert.equal(r.checks.status, 'OK'); assert.deepEqual(r, check(doc, squash(['R1'], -3)));
  assert.throws(() => applyOperation(doc, squash(['R404'])), { code: 'RELATION_CONFLICT' });
});

test('required final contract is enforced without preserve; advisory reports but does not block', () => {
  const doc = fixture();
  for (const selection of [false, []]) assert.equal(check(doc, squash(selection)).checks.relationStatus, 'REJECTED');
  assert.throws(() => assertRelations(check(doc, squash(false)).compiled), { code: 'RELATION_VIOLATION' });
  doc.relations[0].required = false;
  const r = check(doc, squash(false));
  assert.equal(r.checks.status, 'OK'); assert.equal(r.compiled.relations.advisoryViolationCount, 1);
  assert.equal(check(doc, squash(['R1'])).compiled.relations.advisoryViolationCount, 0);
});

test('resolution: integer grid, protected follower and unsupported policy/type fail closed', () => {
  const doc = fixture();
  assert.throws(() => applyOperation(doc, { id: 'widen_about_center', target: 'node.a', params: { deltaWidth: 1 }, preserveRelations: true }), { code: 'REJECTED_UNSAFE' });
  doc.protection.nodeIds.push('node.b');
  assert.equal(evaluateSafeOperation(compile(doc), squash()).legal, false);
  for (const mutate of [d => d.relations[0].type = 'unsupported', d => d.relations[0].resolution.mode = 'guess',
    d => d.relations[0].resolution.axis = 'x', d => d.relations[0].resolution.invariant = 'guess']) {
    const d = fixture(); mutate(d); assert.throws(() => applyOperation(d, squash()), { code: 'RELATION_CONFLICT' });
  }
});

test('multiple required relations: DAG propagation, competing follower proposals and cycles', () => {
  const doc = fixture({ mode: 'translate-follower', protection: false });
  Object.assign(doc.nodes[2], { x: 14, y: 2, w: 4, h: 3 });
  doc.relations.push({ ...structuredClone(doc.relations[0]), id: 'R2', endpointA: { nodeId: 'node.b', feature: 'top-edge' }, endpointB: { nodeId: 'node.c', feature: 'bottom-edge' } });
  const r = check(doc, squash());
  assert.equal(r.checks.status, 'OK'); assert.equal(r.plan.relationRepairs.length, 2);
  assert.equal(r.doc.nodes[2].y, 3);
  const conflict = fixture({ protection: false });
  Object.assign(conflict.nodes[2], { x: 8, y: 12, w: 16, h: 12 });
  conflict.relations.push({ ...structuredClone(conflict.relations[0]), id: 'R2', endpointA: { nodeId: 'node.c', feature: 'top-edge' } });
  assert.throws(() => applyOperation(conflict, squash()), { code: 'RELATION_CONFLICT' });
  const cycle = fixture({ protection: false });
  cycle.relations.push({ ...structuredClone(cycle.relations[0]), id: 'R2', resolution: { ...cycle.relations[0].resolution, follower: 'A' } });
  assert.throws(() => applyOperation(cycle, squash()), e => e.details.reason === 'CYCLIC_RELATIONS');
});

test('selected IDs do not exempt unselected required contracts; primary cannot become repair follower', () => {
  const doc = fixture({ protection: false });
  doc.relations[0].resolution.follower = 'A';
  assert.throws(() => applyOperation(doc, squash()), e => e.details.reason === 'PRIMARY_INVARIANT_CONFLICT');
  const invalid = fixture({ protection: false }); invalid.nodes[1].h--;
  delete invalid.relations[0].resolution;
  assert.throws(() => resolveRelations(invalid, true, 'node.a'), e => e.details.reason === 'NO_RESOLUTION_POLICY');
});

test('safe domain: relation reduces domain, requested repair restores feasible values; protection remains binding', () => {
  const doc = fixture();
  assert.deepEqual(domain(doc).safeRange.values, [0]);
  assert.deepEqual(domain(doc, { preserveRelations: true }).safeRange.values, Array.from({ length: 12 }, (_, i) => i - 11));
  doc.protection.nodeIds.push('node.b');
  assert.deepEqual(domain(doc, { preserveRelations: true }).safeRange.values, [0]);
  assert.throws(() => domain(doc, { maxSearch: 2 }), { code: 'SEARCH_LIMIT' });
  const fallback = preflightGeometry(compile(fixture()), squash(), { revision: 'r1', maxSearch: 2 });
  assert.equal(fallback.validationMode, 'POINT_FALLBACK'); assert.equal(fallback.safeDomain.status, 'SEARCH_LIMIT');
  assert.equal(fallback.status, 'SAFE'); assert.equal(fallback.safeDomain.safeRange, undefined);
});

test('relation definition and repair selection invalidate safe-domain and relation-inspection identity', () => {
  const doc = fixture(), c = compile(doc), binding = domain(doc, { preserveRelations: true }), inspection = evaluateRelations(c, { revision: 'r1' });
  assert.doesNotThrow(() => validateSafeBinding(binding, c, 'r1', squash()));
  assert.doesNotThrow(() => validateRelationBinding(inspection, c, 'r1'));
  assert.throws(() => validateSafeBinding(binding, c, 'r2', squash()), { code: 'STALE_SAFE_DOMAIN' });
  assert.throws(() => validateSafeBinding(binding, c, 'r1', squash(false)), { code: 'STALE_SAFE_DOMAIN' });
  for (const mutate of [d => d.relations[0].tolerance++, d => d.relations[0].required = false,
    d => d.relations[0].endpointB.nodeId = 'node.c', d => d.relations[0].resolution.follower = 'A']) {
    const d = structuredClone(doc); mutate(d); const changed = compile(d);
    assert.notEqual(changed.hashes.documentHash, c.hashes.documentHash);
    assert.throws(() => validateSafeBinding({ ...binding, documentHash: changed.hashes.documentHash }, changed, 'r1', squash()), { code: 'STALE_SAFE_DOMAIN' });
    assert.throws(() => validateRelationBinding(inspection, changed, 'r1'), { code: 'STALE_RELATION_INSPECTION' });
  }
});

test('horizontal contact and follower A use geometry IDs, not node order or name', () => {
  const doc = fixture({ protection: false });
  Object.assign(doc.nodes[1], { x: 2, y: 14, w: 6, h: 4 });
  doc.relations[0].endpointA = { nodeId: 'node.b', feature: 'max-x-edge' };
  doc.relations[0].endpointB = { nodeId: 'node.a', feature: 'min-x-edge' };
  Object.assign(doc.relations[0].resolution, { follower: 'A', axis: 'x' });
  const r = check(doc, { id: 'widen_about_center', target: 'node.a', params: { deltaWidth: 4 }, preserveRelations: true });
  assert.equal(r.doc.nodes[1].w, 4); assert.equal(r.doc.nodes[1].x, 2); assert.equal(r.checks.status, 'OK');
});
