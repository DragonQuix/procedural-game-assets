// 全新 hold-out 布局；不导入演示资产或 v1.2 正式任务。
const ramps = { shell: ['#28343f', '#53716b', '#98ada0', '#d4dac2'], focal: ['#473132', '#98654c', '#d8ab6b', '#eee0b1'] };
const panel = (id, x, y, w, h, ramp = 'shell', layer = 0) => ({ id, kind: 'panel', x, y, w, h, ramp, material: 'bevel-metal', layer });
const base = (id, w, h, nodes, anchor, attachments) => ({ schemaVersion: 'pga-studio/2', id, seed: 8719, renderProfile: { name: 'pixel-flat', version: 1 }, style: { id: 'constraint-holdout', version: 1, ramps }, canvas: { w, h, outline: '#15232a' }, nodes, anchor, attachments });

export function materials() {
  const G = base('ore-pressure-unit', 50, 40, [
    panel('pump.base', 8, 31, 34, 5), panel('pump.body', 17, 6, 16, 25, 'shell', 1),
    panel('pump.gauge', 20, 15, 10, 8, 'focal', 2), panel('pump.readout', 23, 17, 4, 4, 'shell', 3),
  ], { x: 25, y: 36 }, { sensor: { x: 25, y: 19 } });
  G.constraints = [{ kind: 'pixels', target: 'pump.base' }, { kind: 'pixels', target: 'pump.gauge' }, { kind: 'metadata', target: 'anchor' }, { kind: 'metadata', target: 'attachments' }];
  const P = base('relay-stack', 34, 42, [
    panel('relay.base', 6, 35, 22, 3), panel('relay.body', 10, 16, 14, 19, 'shell', 1),
    panel('relay.mast', 15, 8, 4, 8, 'shell', 1), panel('relay.signal', 12, 5, 10, 4, 'focal', 2),
    panel('relay.socket', 14, 23, 6, 5, 'focal', 2),
  ], { x: 17, y: 38 }, { signal: { x: 17, y: 7 } });
  P.constraints = [{ kind: 'pixels', target: 'relay.signal' }, { kind: 'metadata', target: 'anchor' }, { kind: 'metadata', target: 'attachments' }];
  return {
    G: { baseline: G, protection: { allowedMutationRegions: [{ x: 2, y: 2, w: 48, h: 38 }], protectedRegions: [{ x: 9, y: 32, w: 34, h: 5 }, { x: 21, y: 16, w: 10, h: 8 }], metadataPaths: ['anchor', 'attachments'], nodeIds: ['pump.base', 'pump.gauge', 'pump.readout'] },
      control: { id: 'geometry.set', target: 'pump.body', params: { x: 13, y: 12, w: 24, h: 19 } },
      objectives: { target: 'pump.body', minWidth: 24, maxHeight: 19, centerX: 25, bottomY: 31 } },
    P: { baseline: P, protection: { allowedMutationRegions: [{ x: 3, y: 3, w: 30, h: 38 }], protectedRegions: [{ x: 13, y: 6, w: 10, h: 4 }], metadataPaths: ['anchor', 'attachments', 'bounds'], nodeIds: ['relay.signal', 'relay.socket'] },
      control: { id: 'geometry.set', target: 'relay.body', params: { x: 7, y: 19, w: 20, h: 16 } },
      objectives: { target: 'relay.body', minWidth: 20, maxHeight: 16, centerX: 17, bottomY: 35 } },
  };
}
