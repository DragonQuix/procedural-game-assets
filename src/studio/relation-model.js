/** Serialized relation shape only; unsupported vocabulary remains inspectable. */
export const CONTACT_FEATURES = Object.freeze(['top-edge', 'bottom-edge', 'min-x-edge', 'max-x-edge']);
export const RELATION_INVARIANTS = Object.freeze({
  'translate-follower': 'size-and-orthogonal-position',
  'resize-follower-edge': 'opposite-edge-and-orthogonal-geometry',
});
const id = (v) => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(v);
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validateRelations(relations) {
  const issues = [];
  const bad = (target, message) => issues.push({ code: 'INVALID_DOCUMENT', target, message });
  const keys = (value, allowed, at) => {
    if (!object(value)) { bad(at, '需要对象'); return false; }
    for (const key of Object.keys(value)) if (!allowed.includes(key)) bad(at, `未知字段 '${key}'`);
    return true;
  };
  if (!Array.isArray(relations) || relations.length > 64) return [{ code: 'INVALID_DOCUMENT', target: 'relations', message: '需要至多 64 条关系的数组' }];
  const seen = new Set();
  for (const [i, r] of relations.entries()) {
    const at = `relations[${i}]`;
    if (!keys(r, ['id', 'type', 'endpointA', 'endpointB', 'tolerance', 'required', 'resolution'], at)) continue;
    if (!id(r.id) || seen.has(r.id)) bad(`${at}.id`, '需要唯一稳定 ID');
    seen.add(r.id);
    if (!id(r.type)) bad(`${at}.type`, '需要 relation type');
    for (const k of ['endpointA', 'endpointB']) {
      if (keys(r[k], ['nodeId', 'feature'], `${at}.${k}`)) {
        if (!id(r[k].nodeId)) bad(`${at}.${k}.nodeId`, '需要稳定 node ID');
        if (!id(r[k].feature)) bad(`${at}.${k}.feature`, '需要 feature ID');
      }
    }
    if (typeof r.tolerance !== 'number' || !Number.isFinite(r.tolerance) || r.tolerance < 0 || r.tolerance > 512) bad(`${at}.tolerance`, '需要 0–512 的有限像素容差');
    if (typeof r.required !== 'boolean') bad(`${at}.required`, '需要明确的 required boolean');
    if (r.resolution !== undefined && keys(r.resolution, ['mode', 'follower', 'axis', 'invariant'], `${at}.resolution`)) {
      const p = r.resolution;
      if (!id(p.mode)) bad(`${at}.resolution.mode`, '需要显式策略');
      if (!['A', 'B'].includes(p.follower)) bad(`${at}.resolution.follower`, '需要 A 或 B');
      if (!['x', 'y'].includes(p.axis)) bad(`${at}.resolution.axis`, '需要 x 或 y');
      if (!id(p.invariant)) bad(`${at}.resolution.invariant`, '需要显式 invariant');
    }
  }
  return issues;
}
