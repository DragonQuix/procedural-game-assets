import { PixelPainter } from './kit/src/core/raster.js';
export function render() {
  const layers = [];
  const add = (id, draw) => { const p = new PixelPainter(72, 64); draw(p); layers.push({ id, width: p.w, height: p.h, rgba: Array.from(p.toRGBA()) }); };
  add('node.body', p => p.rect(23, 16, 26, 32, '#526572'));
  add('node.brace', p => p.poly([[14,44],[22,35],[25,48],[50,48],[56,44],[60,52],[10,52]], '#384852'));
  add('node.fin.a', p => p.rect(10, 19, 10, 21, '#ba7951'));
  add('node.fin.b', p => p.rect(53, 24, 9, 17, '#688b92'));
  add('node.display', p => p.ellipse(36, 28, 7, 7, '#688b92'));
  add('node.vent', p => p.rect(29, 40, 14, 3, '#ba7951'));
  add('node.base', p => p.rect(8, 52, 56, 7, '#526572'));
  add('node.emblem', p => p.poly([[33,53],[39,53],[36,57]], '#ba7951'));
  return { width: 72, height: 64, anchor: {"x":36,"y":59}, attachments: {}, layers };
}
