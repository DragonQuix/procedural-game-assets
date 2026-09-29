import { createProtectedDocument } from '../../src/studio/compiler.js';

export function borderFixture() {
  return createProtectedDocument({
    schemaVersion: 'pga-studio/2', id: 'border-regression', seed: 13,
    renderProfile: { name: 'pixel-flat', version: 1 },
    style: { id: 'steel', version: 1, ramps: { steel: ['#222233', '#556677', '#8899aa', '#ccddee'] } },
    canvas: { w: 38, h: 38, outline: '#120d16' }, anchor: { x: 19, y: 36 },
    attachments: { sensor: { x: 19, y: 10 } },
    nodes: [
      { id: 'beacon.base', kind: 'panel', x: 8, y: 32, w: 23, h: 3, ramp: 'steel', material: 'flat', layer: 0 },
      { id: 'beacon.light', kind: 'panel', x: 17, y: 8, w: 4, h: 4, ramp: 'steel', material: 'flat', layer: 1 },
    ],
  }, { allowedMutationRegions: [{ x: 2, y: 2, w: 36, h: 36 }], metadataPaths: ['anchor', 'attachments'], nodeIds: ['beacon.light'] });
}

export const t05Operation = { id: 'geometry.set', target: 'beacon.base', params: { x: 6, y: 33, w: 27, h: 4 } };

export function searchLimitFixture() {
  const doc = borderFixture();
  doc.canvas.w = doc.canvas.h = 260;
  doc.protection.baseline.canvas.w = doc.protection.baseline.canvas.h = 260;
  return doc;
}
