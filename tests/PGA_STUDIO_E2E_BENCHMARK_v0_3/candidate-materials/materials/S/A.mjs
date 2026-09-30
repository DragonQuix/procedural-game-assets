import { PixelPainter } from './kit/src/core/raster.js';
export function render() {
  const layers = [];
  const add = (id, draw) => { const p = new PixelPainter(64, 64); draw(p); layers.push({ id, width: p.w, height: p.h, rgba: Array.from(p.toRGBA()) }); };
  add('node.case', p => p.poly([[16,7],[48,7],[57,18],[57,46],[48,57],[16,57],[7,46],[7,18]], '#526572'));
  add('node.face', p => p.rect(14, 14, 36, 36, '#384852'));
  add('node.mark.a', p => p.poly([[22,24],[29,24],[29,29],[22,29]], '#688b92'));
  add('node.mark.b', p => p.poly([[35,24],[42,24],[42,29],[35,29]], '#688b92'));
  add('node.mark.c', p => p.poly([[22,35],[29,35],[29,40],[22,40]], '#688b92'));
  add('node.mark.d', p => p.poly([[35,35],[42,35],[42,40],[35,40]], '#688b92'));
  add('node.mark.e', p => p.ellipse(32, 32, 2, 2, '#ba7951'));
  add('node.anchor', p => p.rect(26, 54, 12, 5, '#ba7951'));
  return { width: 64, height: 64, anchor: {"x":32,"y":59}, attachments: {}, layers };
}
