import { createProtectedDocument } from '../../src/studio/compiler.js';

const style = { id: 'harbor-workshop', version: 1, ramps: {
  iron: ['#202f3b', '#455d6b', '#819caa', '#bfd3d5'],
  rust: ['#54352b', '#a3613b', '#dca060', '#f4d497'],
  teal: ['#123746', '#23748a', '#5bc1c3', '#b4eece'],
} };
const panel = (id, x, y, w, h, ramp, material, layer) => ({ id, kind: 'panel', x, y, w, h, ramp, material, layer });

export function geometryDemoDocument() {
  return createProtectedDocument({
    schemaVersion: 'pga-studio/2', id: 'harbor-compressor', seed: 9031,
    renderProfile: { name: 'pixel-flat', version: 1 }, style,
    canvas: { w: 46, h: 42, outline: '#101e28' }, anchor: { x: 23, y: 38 },
    attachments: { focal: { x: 23, y: 20 }, base: { x: 23, y: 33 } },
    nodes: [
      panel('compressor.base', 6, 33, 34, 5, 'iron', 'bevel-metal', 0),
      panel('compressor.body', 13, 7, 20, 26, 'rust', 'shade-diag', 1),
      panel('compressor.rib', 15, 25, 3, 5, 'iron', 'bevel-metal', 2),
      panel('compressor.vent', 21, 27, 7, 3, 'iron', 'flat', 2),
      panel('compressor.bezel', 19, 16, 8, 8, 'iron', 'bevel-metal', 2),
      { id: 'compressor.optic', kind: 'disc', cx: 23, cy: 20, rx: 3, ry: 3, ramp: 'teal', material: 'shade-diag', layer: 3 },
    ],
    constraints: [{ kind: 'pixels', target: 'compressor.base' }, { kind: 'pixels', target: 'compressor.optic' }],
  }, {
    allowedMutationRegions: [{ x: 2, y: 2, w: 44, h: 40 }],
    protectedRegions: [{ x: 7, y: 34, w: 34, h: 5 }, { x: 21, y: 18, w: 6, h: 6 }],
    metadataPaths: ['anchor', 'attachments'], nodeIds: ['compressor.base', 'compressor.optic'],
  });
}

export function protectionDemoDocument() {
  return createProtectedDocument({
    schemaVersion: 'pga-studio/2', id: 'tidal-vault', seed: 741,
    renderProfile: { name: 'pixel-flat', version: 1 }, style,
    canvas: { w: 30, h: 30, outline: '#101e28' }, anchor: { x: 15, y: 27 },
    attachments: { lock: { x: 15, y: 15 } },
    nodes: [
      panel('vault.base', 7, 23, 16, 4, 'iron', 'bevel-metal', 0),
      panel('vault.body', 10, 8, 10, 15, 'teal', 'shade-diag', 1),
      panel('vault.lock', 13, 13, 4, 4, 'rust', 'bevel-metal', 2),
    ],
  }, { allowedMutationRegions: [{ x: 3, y: 3, w: 26, h: 26 }], metadataPaths: ['anchor', 'attachments'], nodeIds: ['vault.lock'] });
}
