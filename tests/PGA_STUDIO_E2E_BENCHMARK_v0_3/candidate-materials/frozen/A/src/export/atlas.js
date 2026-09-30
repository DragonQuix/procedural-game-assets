/**
 * export/atlas.js — 图集打包：稳定排序的货架式打包（纯函数）
 *
 * 首版约定（ADR-0003）：不旋转打包、不裁边（帧以原始尺寸放入）、
 * 帧间留透明边距、支持页面最大尺寸与多页。同一输入集合必得同一布局：
 * 排序键为（高降序、宽降序、ID 升序），与输入顺序无关。
 */
import { PixelPainter } from '../core/raster.js';

/**
 * @param {Array<{id:string, width:number, height:number}>} frames
 * @param {object} [opts]
 * @param {number} [opts.maxPage] 页面边长上限（像素），默认 1024
 * @param {number} [opts.margin] 帧间透明边距，默认 2
 * @returns {{pages: Array<{width:number, height:number, placements: Array<{id:string,x:number,y:number,w:number,h:number}>}>}}
 */
export function packAtlas(frames, opts = {}) {
  const maxPage = opts.maxPage ?? 1024;
  const margin = opts.margin ?? 2;
  if (!Number.isInteger(maxPage) || maxPage < 8) throw new RangeError(`非法页面尺寸 ${maxPage}`);
  if (!Number.isInteger(margin) || margin < 0) throw new RangeError(`非法边距 ${margin}`);
  for (const f of frames) {
    if (f.width + margin > maxPage || f.height + margin > maxPage) {
      throw new RangeError(`帧 '${f.id}' ${f.width}×${f.height} 加边距后超过页面 ${maxPage}`);
    }
  }
  const sorted = [...frames].sort((a, b) => b.height - a.height || b.width - a.width || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pages = [];
  let page = null;
  let cursorX = margin;
  let cursorY = margin;
  let shelfH = 0;
  const newPage = () => {
    page = { width: 0, height: 0, placements: [] };
    pages.push(page);
    cursorX = margin;
    cursorY = margin;
    shelfH = 0;
  };
  newPage();
  for (const f of sorted) {
    if (cursorX + f.width + margin > maxPage) {
      // 换一行货架
      cursorX = margin;
      cursorY += shelfH + margin;
      shelfH = 0;
    }
    if (cursorY + f.height + margin > maxPage) {
      if (page.placements.length === 0) throw new RangeError(`帧 '${f.id}' 无法放入空页（逻辑错误）`);
      newPage(); // 换一页
    }
    page.placements.push({ id: f.id, x: cursorX, y: cursorY, w: f.width, h: f.height });
    cursorX += f.width + margin;
    shelfH = Math.max(shelfH, f.height);
  }
  // 逐页按实际放置计算页面尺寸（收缩到使用区域，保持确定性）
  for (const p of pages) {
    let w = 0;
    let h = 0;
    for (const pl of p.placements) {
      w = Math.max(w, pl.x + pl.w + margin);
      h = Math.max(h, pl.y + pl.h + margin);
    }
    p.width = Math.max(1, w);
    p.height = Math.max(1, h);
  }
  return { pages };
}

/** 把帧按打包结果画进页面像素（返回每页的 PixelPainter）。 */
export function renderAtlasPages(packed, frameMap) {
  return packed.pages.map((page) => {
    const painter = new PixelPainter(page.width, page.height, { clip: 'error' });
    for (const pl of page.placements) {
      const f = frameMap.get(pl.id);
      if (!f) throw new Error(`图集缺少帧 '${pl.id}'`);
      painter.blit(PixelPainter.fromRGBA(f.width, f.height, f.rgba), pl.x, pl.y);
    }
    return painter;
  });
}

/** 从页面像素按放置信息切回一帧（往返校验用）。 */
export function extractFrame(pagePainter, placement) {
  const p = new PixelPainter(placement.w, placement.h, { clip: 'error' });
  for (let y = 0; y < placement.h; y++) {
    for (let x = 0; x < placement.w; x++) {
      p.data[y * placement.w + x] = pagePainter.data[(placement.y + y) * pagePainter.w + (placement.x + x)];
    }
  }
  return p;
}
