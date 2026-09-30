// 全新任务组合；只复用公开 PixelPainter 几何原语，不读取历史任务或 demo。
const panel = (id, x, y, w, h, ramp, layer) => ({ id, kind: 'panel', x, y, w, h, ramp, layer, material: 'flat' });
const disc = (id, cx, cy, rx, ry, ramp, layer) => ({ id, kind: 'disc', cx, cy, rx, ry, ramp, layer, material: 'flat' });
const poly = (id, vertices, ramp, layer) => ({ id, kind: 'poly', vertices, ramp, layer, material: 'flat' });
const ramps = {
  shell: ['#202e3b', '#526572', '#92a3a5', '#dce7da'],
  signal: ['#493529', '#ba7951', '#e7b275', '#f0e6b8'],
  trim: ['#253947', '#688b92', '#99b9b3', '#d1e4cc'],
  dark: ['#202c35', '#384852', '#596870', '#849292'],
};

export function materials(api) {
  const make = (task, width, height, nodes, rules, extra) => {
    const doc = { schemaVersion: 'pga-studio/2', id: `e2e-${task.toLowerCase()}-v03`, seed: 90300 + task.charCodeAt(0),
      renderProfile: { name: 'pixel-flat', version: 1 }, style: { id: `e2e-${task.toLowerCase()}`, version: 1, ramps: structuredClone(ramps) },
      canvas: { w: width, h: height, outline: null }, anchor: { x: width / 2, y: height - 5 }, attachments: {}, constraints: [], nodes };
    const protectedDoc = api.createProtectedDocument(doc, { ...rules, metadataPaths: ['anchor', 'attachments'] });
    const relations = extra.relations ?? [];
    const D14 = { ...protectedDoc, schemaVersion: 'pga-studio/4', relations };
    const contract = { schema: 'pga-e2e-task/0.3', task, width, height, anchor: doc.anchor, attachments: {},
      protectedRegions: rules.protectedRegions, protectedNodeIds: rules.nodeIds,
      requiredNodeIds: nodes.map(n => n.id), crop: { x: 4, y: 4, w: width - 8, h: height - 8 },
      candidateBudget: 8, minChangedPixels: 40, maxColors: 24, valueBounds: [20, 245], ...extra };
    const regionList = extra.allowedMutationRect ? [extra.allowedMutationRect, ...rules.protectedRegions] : rules.protectedRegions;
    contract.regions = Object.fromEntries(regionList.map((r, i) => [`P${i + 1}`, r]));
    return { baseline: doc, D14, contract };
  };
  const H = make('H', 72, 64, [
    panel('node.body', 23, 16, 26, 32, 'shell', 0),
    poly('node.brace', [[14, 44], [22, 35], [25, 48], [50, 48], [56, 44], [60, 52], [10, 52]], 'dark', 1),
    panel('node.fin.a', 10, 19, 10, 21, 'signal', 2), panel('node.fin.b', 53, 24, 9, 17, 'trim', 3),
    disc('node.display', 36, 28, 7, 7, 'trim', 4), panel('node.vent', 29, 40, 14, 3, 'signal', 5),
    panel('node.base', 8, 52, 56, 7, 'shell', 6),
    poly('node.emblem', [[33, 53], [39, 53], [36, 57]], 'signal', 7),
  ], { protectedRegions: [{ x: 0, y: 52, w: 72, h: 12 }], nodeIds: ['node.base', 'node.emblem'] },
  { silhouetteChange: [60, 560], opaqueArea: [700, 2300], focalNode: 'node.display' });
  const K = make('K', 80, 64, [
    poly('node.cradle', [[12, 49], [20, 24], [26, 24], [24, 49], [64, 49], [68, 55], [10, 55]], 'dark', 0),
    panel('node.drive', 32, 40, 24, 10, 'shell', 1), panel('node.outlet', 56, 42, 12, 6, 'signal', 2),
    disc('node.drum', 44, 28, 10, 10, 'trim', 3), disc('node.hub', 44, 28, 3, 3, 'signal', 4),
    panel('node.grip', 24, 13, 29, 4, 'trim', 5), panel('node.foot', 10, 55, 60, 4, 'shell', 6),
  ], { protectedRegions: [{ x: 0, y: 55, w: 80, h: 9 }], nodeIds: ['node.foot'] },
  { structuralChange: { minimumMovedParts: 2, minimumTotalCenterDisplacement: 12 },
    relations: [{ id: 'R1', type: 'contact', endpointA: { nodeId: 'node.drive', feature: 'max-x-edge' },
      endpointB: { nodeId: 'node.outlet', feature: 'min-x-edge' }, required: true, tolerance: 0,
      resolution: { mode: 'translate-follower', follower: 'B', axis: 'x', invariant: 'size-and-orthogonal-position' } }] });
  const M = make('M', 68, 68, [
    poly('node.jaw', [[10, 9], [53, 9], [53, 20], [25, 20], [25, 43], [53, 43], [53, 54], [10, 54]], 'shell', 0),
    panel('node.spindle', 44, 21, 5, 21, 'shell', 1), panel('node.pad', 36, 37, 19, 5, 'trim', 2),
    panel('node.handle', 29, 26, 31, 6, 'signal', 3), disc('node.bolt.a', 16, 15, 2, 2, 'dark', 4),
    disc('node.bolt.b', 16, 48, 2, 2, 'dark', 5),
  ], { protectedRegions: [{ x: 10, y: 9, w: 2, h: 2 }, { x: 51, y: 52, w: 2, h: 2 },
    { x: 14, y: 13, w: 4, h: 4, mask: [0,1,1,0,1,1,1,1,1,1,1,1,0,1,1,0] },
    { x: 14, y: 46, w: 4, h: 4, mask: [0,1,1,0,1,1,1,1,1,1,1,1,0,1,1,0] }], nodeIds: ['node.bolt.a', 'node.bolt.b'] },
  { silhouetteChange: [0, 24], ownershipExpansion: 1, minChangedPixels: 80, maxColors: 20,
    workNodes: ['node.jaw', 'node.spindle', 'node.pad'], secondaryNodes: ['node.handle'], minWorkColors: 3 });
  // 端点保护兼容逐步材质编辑；起点仍平涂，不预置完成图。
  M.baseline.nodes.find(n => n.id === 'node.jaw').ramp = { shades: ['#526572', '#526572', '#92a3a5', '#526572'] };
  M.D14 = api.createProtectedDocument(M.baseline, { protectedRegions: M.contract.protectedRegions, nodeIds: M.contract.protectedNodeIds, metadataPaths: ['anchor', 'attachments'] });
  M.D14 = { ...M.D14, schemaVersion: 'pga-studio/4', relations: [] };
  const S = make('S', 64, 64, [
    poly('node.case', [[16, 7], [48, 7], [57, 18], [57, 46], [48, 57], [16, 57], [7, 46], [7, 18]], 'shell', 0),
    panel('node.face', 14, 14, 36, 36, 'dark', 1),
    poly('node.mark.a', [[22, 24], [29, 24], [29, 29], [22, 29]], 'trim', 2),
    poly('node.mark.b', [[35, 24], [42, 24], [42, 29], [35, 29]], 'trim', 3),
    poly('node.mark.c', [[22, 35], [29, 35], [29, 40], [22, 40]], 'trim', 4),
    poly('node.mark.d', [[35, 35], [42, 35], [42, 40], [35, 40]], 'trim', 5),
    disc('node.mark.e', 32, 32, 2, 2, 'signal', 6),
    panel('node.anchor', 26, 54, 12, 5, 'signal', 7),
  ], { protectedRegions: [{ x: 0, y: 0, w: 64, h: 14 }, { x: 0, y: 50, w: 64, h: 14 },
    { x: 0, y: 14, w: 14, h: 36 }, { x: 50, y: 14, w: 14, h: 36 }], nodeIds: ['node.case', 'node.anchor'] },
  { allowedMutationRect: { x: 14, y: 14, w: 36, h: 36 }, silhouetteChange: [0, 0], symbolArea: [70, 650],
    symbolNodePrefix: 'node.mark.', functionalTheme: 'energy-transfer', forbiddenText: true });
  return { H, K, M, S };
}

// 直绘起点只有普通函数与完整 PixelPainter；没有文档解释器或语义编辑 API。
export function directSource(doc) {
  const lines = ["import { PixelPainter } from './kit/src/core/raster.js';", 'export function render() {',
    `  const layers = [];`, `  const add = (id, draw) => { const p = new PixelPainter(${doc.canvas.w}, ${doc.canvas.h}); draw(p); layers.push({ id, width: p.w, height: p.h, rgba: Array.from(p.toRGBA()) }); };`];
  for (const n of doc.nodes.toSorted((a, b) => a.layer - b.layer)) {
    const color = typeof n.ramp === 'string' ? doc.style.ramps[n.ramp][1] : n.ramp.shades[1];
    const call = n.kind === 'poly' ? `p.poly(${JSON.stringify(n.vertices)}, '${color}')` : n.kind === 'disc' ? `p.ellipse(${n.cx}, ${n.cy}, ${n.rx}, ${n.ry}, '${color}')` : `p.rect(${n.x}, ${n.y}, ${n.w}, ${n.h}, '${color}')`;
    lines.push(`  add('${n.id}', p => ${call});`);
  }
  lines.push(`  return { width: ${doc.canvas.w}, height: ${doc.canvas.h}, anchor: ${JSON.stringify(doc.anchor)}, attachments: {}, layers };`, '}', '');
  return lines.join('\n');
}
