import { canonical, sha256 } from './accounting.mjs';

export function compose({ width, height, anchor, attachments, layers }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 65536 || !Array.isArray(layers) || layers.length < 1 || layers.length > 64) throw new Error('INVALID_RENDER_SHAPE');
  const rgba = new Array(width * height * 4).fill(0), ids = new Set();
  for (const layer of layers) {
    if (typeof layer.id !== 'string' || ids.has(layer.id) || layer.width !== width || layer.height !== height || !Array.isArray(layer.rgba) || layer.rgba.length !== rgba.length || layer.rgba.some((v, i) => !Number.isInteger(v) || v < 0 || v > 255 || (i % 4 === 3 && v !== 0 && v !== 255))) throw new Error('INVALID_LAYER');
    ids.add(layer.id);
    for (let i = 0; i < rgba.length; i += 4) if (layer.rgba[i + 3]) for (let k = 0; k < 4; k++) rgba[i + k] = layer.rgba[i + k];
  }
  return { frame: { width, height, anchor, attachments, rgba }, layers };
}

export function bounds(layer) {
  let x0 = layer.width, y0 = layer.height, x1 = 0, y1 = 0;
  for (let y = 0; y < layer.height; y++) for (let x = 0; x < layer.width; x++) if (layer.rgba[(y * layer.width + x) * 4 + 3]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
  }
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

export function evaluateFinal(first, second, baseline, contract) {
  const checks = {}, a = baseline.frame, b = first.frame;
  try {
    checks.validOutput = canonical(compose({ ...b, layers: first.layers })) === canonical(first);
    checks.dimensions = b.width === contract.width && b.height === contract.height;
    if (!checks.validOutput || !checks.dimensions) return { status: 'FAIL', checks, reason: 'INVALID_FINAL_OUTPUT' };
    checks.deterministic = canonical(first) === canonical(second);
    checks.metadata = canonical(b.anchor) === canonical(contract.anchor) && canonical(b.attachments) === canonical(contract.attachments);
    const oldLayers = new Map(baseline.layers.map(l => [l.id, l])), layers = new Map(first.layers.map(l => [l.id, l]));
    checks.parts = canonical([...layers.keys()].sort()) === canonical([...contract.requiredNodeIds].sort()) && first.layers.every(l => bounds(l));
    let changed = 0, silhouette = 0, area = 0, protectionViolations = 0;
    const colors = new Set(), inRect = (x, y, r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
      const i = (y * b.width + x) * 4, diff = b.rgba.slice(i, i + 4).some((v, k) => v !== a.rgba[i + k]);
      if (diff) changed++;
      if (!!b.rgba[i + 3] !== !!a.rgba[i + 3]) silhouette++;
      if (b.rgba[i + 3]) { area++; colors.add(b.rgba.slice(i, i + 3).join(',')); }
      if (diff && (contract.protectedRegions.some(r => inRect(x, y, r)) || (contract.allowedMutationRect && !inRect(x, y, contract.allowedMutationRect)))) protectionViolations++;
    }
    checks.protection = protectionViolations === 0 && contract.protectedNodeIds.every(id => canonical(oldLayers.get(id)) === canonical(layers.get(id)));
    checks.changed = changed >= contract.minChangedPixels;
    checks.palette = colors.size <= contract.maxColors && [...colors].every(c => { const [r, g, v] = c.split(',').map(Number), value = .2126 * r + .7152 * g + .0722 * v; return value >= contract.valueBounds[0] && value <= contract.valueBounds[1]; });
    const between = (n, interval) => !interval || (n >= interval[0] && n <= interval[1]);
    checks.silhouette = between(silhouette, contract.silhouetteChange);
    checks.area = between(area, contract.opaqueArea);
    checks.requiredRelation = true;
    for (const relation of contract.relations ?? []) {
      const p = layers.get(relation.endpointA.nodeId), q = layers.get(relation.endpointB.nodeId), pr = p && bounds(p), qr = q && bounds(q);
      const filledRect = (l, r) => r && l.rgba.filter((v, i) => i % 4 === 3 && v > 0).length === r.w * r.h;
      checks.requiredRelation &&= !!pr && !!qr && filledRect(p, pr) && filledRect(q, qr) && pr.x + pr.w === qr.x && Math.min(pr.y + pr.h, qr.y + qr.h) - Math.max(pr.y, qr.y) >= 1;
    }
    if (contract.structuralChange) {
      const displacement = [...oldLayers].map(([id, layer]) => {
        const p = bounds(layer), q = layers.has(id) && bounds(layers.get(id));
        return p && q ? Math.abs(p.x + p.w / 2 - q.x - q.w / 2) + Math.abs(p.y + p.h / 2 - q.y - q.h / 2) : 0;
      });
      checks.structuralChange = displacement.filter(n => n >= 2).length >= contract.structuralChange.minimumMovedParts && displacement.reduce((x, y) => x + y, 0) >= contract.structuralChange.minimumTotalCenterDisplacement;
    }
    if (contract.ownershipExpansion !== undefined) {
      const d = contract.ownershipExpansion;
      checks.ownership = first.layers.every(l => {
        const p = oldLayers.has(l.id) && bounds(oldLayers.get(l.id)), q = bounds(l);
        return p && q && q.x >= p.x - d && q.y >= p.y - d && q.x + q.w <= p.x + p.w + d && q.y + q.h <= p.y + p.h + d;
      });
      const workColors = new Set(first.layers.filter(l => contract.workNodes.includes(l.id)).flatMap(l => l.rgba.reduce((out, v, i) => { if (i % 4 === 3 && v) out.push(l.rgba.slice(i - 3, i).join(',')); return out; }, [])));
      checks.workColors = workColors.size >= contract.minWorkColors;
    }
    if (contract.symbolArea) {
      const marks = first.layers.filter(l => l.id.startsWith(contract.symbolNodePrefix));
      let count = 0; for (let i = 3; i < b.rgba.length; i += 4) if (marks.some(l => l.rgba[i])) count++;
      checks.symbolArea = between(count, contract.symbolArea);
    }
    return { status: Object.values(checks).every(v => v === true) ? 'PASS' : 'FAIL', checks,
      changedPixels: changed, silhouetteChangedPixels: silhouette, protectionViolationCount: protectionViolations,
      finalHash: sha256(canonical(first)), textProhibition: contract.forbiddenText ? 'VISUAL_REVIEW_REQUIRED' : 'NOT_REQUIRED' };
  } catch (error) { return { status: 'FAIL', checks, reason: 'INVALID_FINAL_OUTPUT', error: error.message }; }
}
