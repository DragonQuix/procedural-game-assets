/** 全新 hold-outs；控制解只供主持人机械自检，不进入 participant 材料。 */
import { createProtectedDocument } from '../../../src/studio/compiler.js';

export function materials() {
  const make = (task, size, geometry, objectives) => {
    const [a, b, c] = geometry;
    const baseline = {
      schemaVersion: 'pga-studio/2', id: `holdout-${task.toLowerCase()}-v02`, seed: task === 'C' ? 204711 : 204929,
      renderProfile: { name: 'pixel-flat', version: 1 },
      style: { id: task === 'C' ? 'slate-amber' : 'oxide-jade', version: 1, ramps: {
        body: task === 'C' ? ['#202936', '#47637d', '#81a1b2', '#dbe2d4'] : ['#293335', '#637871', '#a0b6a0', '#e3ddbf'],
        detail: task === 'C' ? ['#4d342e', '#b76e43', '#e8ae64', '#ffe3a2'] : ['#402d32', '#a76351', '#d79770', '#f8d5a1'],
      } },
      canvas: { w: size[0], h: size[1], outline: null }, anchor: { x: size[0] / 2, y: c.y + c.h }, attachments: {}, constraints: [],
      nodes: [
        { id: 'node.a', kind: 'panel', ...a, ramp: 'body', material: 'bevel-metal', layer: 0 },
        { id: 'node.b', kind: 'panel', ...b, ramp: 'detail', material: 'shade-diag', layer: 1 },
        { id: 'node.c', kind: 'panel', ...c, ramp: 'body', material: 'bevel-metal', layer: 2 },
      ],
    };
    const relations = [{ id: 'R1', type: 'contact', endpointA: { nodeId: 'node.a', feature: 'top-edge' },
      endpointB: { nodeId: 'node.b', feature: 'bottom-edge' }, required: true, tolerance: 0,
      resolution: { mode: 'resize-follower-edge', follower: 'B', axis: 'y', invariant: 'opposite-edge-and-orthogonal-geometry' } }];
    if (task === 'R') relations.push({ id: 'R2', type: 'contact', endpointA: { nodeId: 'node.a', feature: 'bottom-edge' },
      endpointB: { nodeId: 'node.c', feature: 'top-edge' }, required: true, tolerance: 0 });
    const D13 = createProtectedDocument(baseline, { protectedRegions: [{ x: 0, y: c.y, w: size[0], h: size[1] - c.y }], metadataPaths: ['anchor'], nodeIds: ['node.c'] });
    const D14 = { ...structuredClone(D13), schemaVersion: 'pga-studio/4', relations };
    const taskContract = { schema: 'pga-relation-task/1', task, coordinateSpace: 'final-frame', nodeLabels: { 'Node A': 'node.a', 'Node B': 'node.b', 'Node C': 'node.c' },
      edgeIds: { E1: { nodeId: 'node.a', feature: 'top-edge' }, E2: { nodeId: 'node.b', feature: 'bottom-edge' }, E3: { nodeId: 'node.a', feature: 'bottom-edge' }, E4: { nodeId: 'node.c', feature: 'top-edge' } },
      objectives, protection: D13.protection, regions: { P1: D13.protection.protectedRegions[0] }, relations, requiredClips: [], candidateBudget: 6,
      visualRequirement: '重构后的比例变化清楚，部件结构连续、接触明确、像素边缘整洁，Node C 的承托关系保持；不是目标图复制。' };
    const targetY = objectives.bottomY - objectives.maxHeight;
    const control = [
      { id: 'geometry.set', target: 'node.a', params: { x: objectives.centerX - objectives.minWidth / 2, y: targetY, w: objectives.minWidth, h: objectives.maxHeight } },
      { id: 'geometry.set', target: 'node.b', params: { h: targetY - b.y } },
    ];
    const semanticControl = { id: 'resize_about_anchor', target: 'node.a', params: { targetWidth: objectives.minWidth, targetHeight: objectives.maxHeight, anchor: 'bottom-center' }, preserveRelations: true };
    return { D13, D14, taskContract, control, semanticControl };
  };
  return {
    C: make('C', [48, 40], [{ x: 12, y: 14, w: 16, h: 16 }, { x: 18, y: 6, w: 4, h: 8 }, { x: 6, y: 30, w: 36, h: 3 }], { target: 'node.a', minWidth: 26, maxHeight: 10, centerX: 20, bottomY: 30 }),
    R: make('R', [56, 48], [{ x: 18, y: 18, w: 20, h: 20 }, { x: 25, y: 7, w: 6, h: 11 }, { x: 10, y: 38, w: 36, h: 3 }], { target: 'node.a', minWidth: 32, maxHeight: 12, centerX: 28, bottomY: 38 }),
  };
}
