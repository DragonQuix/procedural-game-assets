import { createProtectedDocument } from '../../src/studio/compiler.js';

export function relationFixture({ mode = 'resize-follower-edge', required = true, protection = true } = {}) {
  const doc = {
    schemaVersion: 'pga-studio/4', id: 'relation-fixture', seed: 14,
    renderProfile: { name: 'pixel-flat', version: 1 },
    style: { id: 'test', version: 1, ramps: { metal: ['#202830', '#556677', '#99aabb', '#ddeeff'] } },
    canvas: { w: 32, h: 32, outline: null }, anchor: { x: 16, y: 26 }, attachments: {}, constraints: [],
    nodes: [
      { id: 'node.a', kind: 'panel', x: 8, y: 12, w: 16, h: 12, ramp: 'metal', material: 'flat', layer: 0 },
      { id: 'node.b', kind: 'panel', x: 14, y: 5, w: 4, h: 7, ramp: 'metal', material: 'flat', layer: 1 },
      { id: 'node.c', kind: 'panel', x: 4, y: 24, w: 24, h: 2, ramp: 'metal', material: 'flat', layer: 2 },
    ],
    relations: [{ id: 'R1', type: 'contact', endpointA: { nodeId: 'node.a', feature: 'top-edge' },
      endpointB: { nodeId: 'node.b', feature: 'bottom-edge' }, tolerance: 0, required,
      resolution: { mode, follower: 'B', axis: 'y', invariant: mode === 'translate-follower' ? 'size-and-orthogonal-position' : 'opposite-edge-and-orthogonal-geometry' } }],
  };
  return protection ? createProtectedDocument(doc, { protectedRegions: [{ x: 0, y: 24, w: 32, h: 8 }], metadataPaths: ['anchor'], nodeIds: ['node.c'] }) : doc;
}
export const squash = (preserveRelations = true, deltaHeight = -1) => ({ id: 'squash_keep_base', target: 'node.a', params: { deltaHeight }, preserveRelations });
