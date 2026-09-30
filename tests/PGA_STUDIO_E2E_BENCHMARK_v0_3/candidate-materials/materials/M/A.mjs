import { PixelPainter } from './kit/src/core/raster.js';
export function render() {
  const layers = [];
  const add = (id, draw) => { const p = new PixelPainter(68, 68); draw(p); layers.push({ id, width: p.w, height: p.h, rgba: Array.from(p.toRGBA()) }); };
  add('node.jaw', p => p.poly([[10,9],[53,9],[53,20],[25,20],[25,43],[53,43],[53,54],[10,54]], '#526572'));
  add('node.spindle', p => p.rect(44, 21, 5, 21, '#526572'));
  add('node.pad', p => p.rect(36, 37, 19, 5, '#688b92'));
  add('node.handle', p => p.rect(29, 26, 31, 6, '#ba7951'));
  add('node.bolt.a', p => p.ellipse(16, 15, 2, 2, '#384852'));
  add('node.bolt.b', p => p.ellipse(16, 48, 2, 2, '#384852'));
  return { width: 68, height: 68, anchor: {"x":34,"y":63}, attachments: {}, layers };
}
