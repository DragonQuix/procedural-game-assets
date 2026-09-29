/** Bounded DAG propagation, not an iterative constraint solver. */
import { compileStudioDocument } from './compiler.js';
import { evaluateRelation, relationEdge, supportedResolution } from './relations.js';
import { stableStringify } from './document.js';

function reject(reason, details = {}) {
  const error = new Error(`关系修复被拒绝：${reason}`);
  error.code = 'RELATION_CONFLICT'; error.details = { status: 'CONFLICT', reason, ...details };
  throw error;
}

function selection(doc, request, target) {
  const all = doc.relations ?? [];
  if (request === true) {
    const nodes = new Set([target]), selected = new Set();
    for (let pass = 0; pass <= all.length; pass++) {
      const size = selected.size;
      for (const r of all) if (r.required && (nodes.has(r.endpointA.nodeId) || nodes.has(r.endpointB.nodeId))) {
        selected.add(r.id); nodes.add(r.endpointA.nodeId); nodes.add(r.endpointB.nodeId);
      }
      if (size === selected.size) break;
    }
    return all.filter((r) => selected.has(r.id));
  }
  if (!Array.isArray(request) || request.some((id) => typeof id !== 'string') || new Set(request).size !== request.length) reject('INVALID_SELECTION');
  for (const id of request) if (!all.some((r) => r.id === id)) reject('UNKNOWN_RELATION_ID', { relationId: id });
  return all.filter((r) => request.includes(r.id));
}

export function resolveRelations(doc, request, primaryTarget) {
  const selected = selection(doc, request, primaryTarget).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const next = JSON.parse(JSON.stringify(doc)), repairs = [];
  let trialCompiles = 0;
  const compile = () => {
    trialCompiles++;
    try { return compileStudioDocument(next); }
    catch (e) { reject('REPAIR_GEOMETRY_INVALID', { issues: e.issues ?? [], message: e.message }); }
  };
  const initialCompiled = compile();
  const incoming = new Map(), followers = new Map(), edges = new Map();
  for (const r of selected) {
    const initial = evaluateRelation(r, initialCompiled);
    if (!r.resolution) {
      if (initial.status !== 'SATISFIED') reject('NO_RESOLUTION_POLICY', { relationId: r.id, evaluation: initial });
      continue;
    }
    if (!supportedResolution(r, initial.coordinates.edgeA, initial.coordinates.edgeB) || r.type !== 'contact') reject('UNSUPPORTED_RESOLUTION', { relationId: r.id, evaluation: initial });
    const f = r[`endpoint${r.resolution.follower}`].nodeId;
    const leader = r[r.resolution.follower === 'A' ? 'endpointB' : 'endpointA'].nodeId;
    if (!incoming.has(leader)) incoming.set(leader, 0);
    incoming.set(f, (incoming.get(f) ?? 0) + 1);
    edges.set(leader, [...(edges.get(leader) ?? []), f]);
    followers.set(f, [...(followers.get(f) ?? []), r]);
  }
  const order = [], queue = [...incoming].filter(([, n]) => n === 0).map(([id]) => id).sort();
  while (queue.length) {
    const id = queue.shift(); order.push(id);
    for (const f of edges.get(id) ?? []) {
      incoming.set(f, incoming.get(f) - 1);
      if (incoming.get(f) === 0) { queue.push(f); queue.sort(); }
    }
  }
  if (order.length !== incoming.size) reject('CYCLIC_RELATIONS');
  for (const nodeId of order) {
    const relations = followers.get(nodeId) ?? [], proposals = {};
    if (!relations.length) continue;
    const compiled = compile(), node = next.nodes.find((n) => n.id === nodeId);
    for (const r of relations) {
      const result = evaluateRelation(r, compiled);
      if (result.status === 'SATISFIED') continue;
      if (!['GAP', 'OVERLAP'].includes(result.status) || result.tangentialOverlapPx < 1) reject('UNREPAIRABLE_CONTACT', { relationId: r.id, evaluation: result });
      if (nodeId === primaryTarget) reject('PRIMARY_INVARIANT_CONFLICT', { relationId: r.id, nodeId });
      const p = r.resolution, f = r[`endpoint${p.follower}`], leader = r[p.follower === 'A' ? 'endpointB' : 'endpointA'];
      const fe = relationEdge(compiled.sceneMap.nodes.find((n) => n.id === nodeId), f.feature);
      const le = relationEdge(compiled.sceneMap.nodes.find((n) => n.id === leader.nodeId), leader.feature);
      const delta = le.coordinate - fe.coordinate, axis = p.axis, size = axis === 'x' ? 'w' : 'h';
      const change = p.mode === 'translate-follower' ? { [axis]: node[axis] + delta }
        : fe.sign > 0 ? { [size]: node[size] + delta } : { [axis]: node[axis] + delta, [size]: node[size] - delta };
      if (!Object.values(change).every(Number.isInteger)) reject('INTEGER_GRID', { relationId: r.id, change });
      if (change[size] !== undefined && change[size] < 1) reject('NON_POSITIVE_SIZE', { relationId: r.id, change });
      for (const [key, value] of Object.entries(change)) {
        if (Object.hasOwn(proposals, key) && proposals[key] !== value) reject('INCOMPATIBLE_FOLLOWER_PROPOSALS', { relationId: r.id, nodeId, field: key });
        proposals[key] = value;
      }
      repairs.push({ relationId: r.id, nodeId, mode: p.mode, invariant: p.invariant, deltaPx: delta, fields: change });
    }
    Object.assign(node ?? {}, proposals);
  }
  const compiled = compile();
  for (const repair of repairs) {
    const old = doc.nodes.find((n) => n.id === repair.nodeId), now = next.nodes.find((n) => n.id === repair.nodeId);
    const r = selected.find((r) => r.id === repair.relationId), p = r.resolution;
    const axis = p.axis, size = axis === 'x' ? 'w' : 'h', other = axis === 'x' ? 'y' : 'x', otherSize = axis === 'x' ? 'h' : 'w';
    const f = relationEdge(initialCompiled.sceneMap.nodes.find((n) => n.id === repair.nodeId), r[`endpoint${p.follower}`].feature);
    const invariant = p.mode === 'translate-follower' ? old[size] === now[size]
      : f.sign > 0 ? old[axis] === now[axis] : old[axis] + old[size] === now[axis] + now[size];
    if (!invariant || old[other] !== now[other] || old[otherSize] !== now[otherSize]) reject('FOLLOWER_INVARIANT_CONFLICT', { relationId: r.id, nodeId: repair.nodeId });
  }
  const evaluations = selected.map((r) => evaluateRelation(r, compiled));
  if (evaluations.some((r) => r.status !== 'SATISFIED')) reject('RELATIONS_NOT_SIMULTANEOUSLY_SATISFIED', { evaluations });
  const changes = next.nodes.flatMap((n) => {
    const old = doc.nodes.find((b) => b.id === n.id);
    const changedFields = Object.fromEntries(['x', 'y', 'w', 'h'].filter((k) => stableStringify(old[k]) !== stableStringify(n[k])).map((k) => [k, { from: old[k], to: n[k] }]));
    return Object.keys(changedFields).length ? [{ target: n.id, changedFields }] : [];
  });
  return { doc: next, changes, repairs, selectedRelationIds: selected.map((r) => r.id), trialCompiles };
}
