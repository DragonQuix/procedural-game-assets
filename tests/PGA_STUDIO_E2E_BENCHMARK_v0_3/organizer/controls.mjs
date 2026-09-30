import { directSource } from './materials.mjs';

// 仅机械可行性样本，无审美标签，不进 participant/reviewer package。
export function controlOperations(task, variant = 0) {
  if (task === 'H') return [
    { id: 'resize_about_anchor', target: 'node.body', params: { targetWidth: 38 + variant * 2, targetHeight: 26 - variant * 2, anchor: 'bottom-center' } },
    { id: 'ramp.set', target: 'node.display', ramp: 'signal' },
  ];
  if (task === 'K') return [
    { id: 'resize_about_anchor', target: 'node.drive', params: { targetWidth: 34 + variant * 2, targetHeight: 10, anchor: 'bottom-center' }, preserveRelations: true },
    { id: 'geometry.set', target: 'node.drum', params: { cx: 37 - variant * 2, cy: 28 } },
    { id: 'geometry.set', target: 'node.hub', params: { cx: 37 - variant * 2, cy: 28 } },
  ];
  if (task === 'M') return [
    { id: 'material.set', target: 'node.jaw', material: 'shade-diag' },
    { id: 'ramp.set', target: 'node.jaw', ramp: { shades: ['#526572', variant ? '#758993' : '#829aaa', variant ? '#aec3cd' : '#c2d0d0', '#526572'] } },
    { id: 'ramp.set', target: 'node.handle', ramp: 'dark' },
  ];
  if (task === 'S') return [
    { id: 'geometry.set', target: 'node.mark.a', params: { vertices: [[18, 24], [23, 24], [23, 39], [18, 39]] } },
    { id: 'geometry.set', target: 'node.mark.b', params: { vertices: [[41, 24], [46, 24], [46, 39], [41, 39]] } },
    { id: 'geometry.set', target: 'node.mark.c', params: { vertices: variant ? [[25, 26], [36, 26], [36, 30], [25, 30]] : [[25, 30], [36, 30], [36, 34], [25, 34]] } },
    { id: 'geometry.set', target: 'node.mark.d', params: { vertices: [[34, 24], [40, 32], [34, 40]] } },
  ];
  throw new Error('UNKNOWN_CONTROL');
}

export function controlDocument(api, start, task, variant = 0) {
  let current = api.compileAny(start);
  for (const operation of controlOperations(task, variant)) {
    const applied = api.applyAnyOperation(current.document, operation), next = api.compileAny(applied.doc);
    const check = api.checkAnyCandidate({ baseCompiled: current, candidateCompiled: next, plan: applied.plan, preserve: api.preserveFromAnyDocument(current.document) });
    if (!['OK', 'UNCHANGED'].includes(check.status)) throw new Error(`CONTROL_REJECTED ${task} ${JSON.stringify(check)}`);
    current = next;
  }
  return current.document;
}

export function directControlSource(doc) {
  const flat = structuredClone(doc);
  for (const n of flat.nodes) if (typeof n.ramp !== 'string') { flat.style.ramps[n.id] = n.ramp.shades; n.ramp = n.id; }
  let source = directSource(flat);
  for (const n of doc.nodes.filter(n => n.material === 'shade-diag')) {
    const shades = typeof n.ramp === 'string' ? doc.style.ramps[n.ramp] : n.ramp.shades;
    const x = n.kind === 'poly' ? Math.min(...n.vertices.map(p => p[0])) : n.x;
    const y = n.kind === 'poly' ? Math.min(...n.vertices.map(p => p[1])) : n.y;
    const w = n.kind === 'poly' ? Math.max(...n.vertices.map(p => p[0])) - x : n.w;
    const h = n.kind === 'poly' ? Math.max(...n.vertices.map(p => p[1])) - y : n.h;
    const line = source.split('\n').find(l => l.includes(`add('${n.id}',`));
    const draw = line.slice(line.indexOf('p => ') + 5, -2);
    source = source.replace(line, `  add('${n.id}', p => { ${draw}; const s = ${JSON.stringify(shades)}; p.map((x, y) => { const t = (x - ${x} + y - ${y}) / ${Math.max(1, w + h - 2)}; return s[t < .15 ? 3 : t < .4 ? 2 : t < .75 ? 1 : 0]; }); });`);
  }
  return source;
}
