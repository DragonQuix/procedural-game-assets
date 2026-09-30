import { PixelPainter } from './kit/src/core/raster.js';
export function render() {
  const layers = [];
  const add = (id, draw) => { const p = new PixelPainter(80, 64); draw(p); layers.push({ id, width: p.w, height: p.h, rgba: Array.from(p.toRGBA()) }); };
  add('node.cradle', p => p.poly([[12,49],[20,24],[26,24],[24,49],[64,49],[68,55],[10,55]], '#384852'));
  add('node.drive', p => p.rect(32, 40, 24, 10, '#526572'));
  add('node.outlet', p => p.rect(56, 42, 12, 6, '#ba7951'));
  add('node.drum', p => p.ellipse(44, 28, 10, 10, '#688b92'));
  add('node.hub', p => p.ellipse(44, 28, 3, 3, '#ba7951'));
  add('node.grip', p => p.rect(24, 13, 29, 4, '#688b92'));
  add('node.foot', p => p.rect(10, 55, 60, 4, '#526572'));
  return { width: 80, height: 64, anchor: {"x":40,"y":59}, attachments: {}, layers };
}
