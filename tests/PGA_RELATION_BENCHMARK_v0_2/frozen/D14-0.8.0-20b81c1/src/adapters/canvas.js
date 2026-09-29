/**
 * adapters/canvas.js — 网页启动烘焙适配（ADR-0004 路径 1）
 *
 * 浏览器启动时把 BakedAsset 缓存为 Canvas 精灵；运行时只 drawImage，
 * 不强制导出 PNG/manifest。与离线导出共享同一烘焙核心（core/bake/recipes），
 * 像素一致性由同源保证。
 *
 * DOM 解耦：Canvas 工厂由调用方注入（浏览器传 document.createElement 包装，
 * Node 测试传 stub），本模块 import 时不触碰任何 DOM。
 *
 * 变体按需生成并缓存：'orig' | 'flip' | 'flash' | 'flashFlip'，
 * 镜像/白闪复用 core/transform.js 的纯函数（锚点/附件点随 W-x 联动）。
 */

import { PixelPainter } from '../core/raster.js';
import { flipHorizontal, silhouette, mirrorXFramePoints } from '../core/transform.js';

/**
 * @param {object} args
 * @param {Array} args.assets BakedAsset 列表（bakeHumanoid/bakeMachine/... 的结果）
 * @param {(w:number, h:number) => any} args.makeCanvas Canvas 工厂（注入）
 * @param {(canvas:any, width:number, height:number, rgba:Uint8ClampedArray) => void} [args.putPixels]
 *        自定义像素写入；默认走 canvas.getContext('2d') + ImageData
 */
export function createCanvasBank({ assets, makeCanvas, putPixels }) {
  if (typeof makeCanvas !== 'function') throw new TypeError('createCanvasBank 需要注入 makeCanvas(w, h)');
  const write = putPixels ?? defaultPutPixels;
  const frames = new Map(); // frameId -> BakedFrame
  const clips = {};
  const cache = new Map(); // `${frameId}:${variant}` -> sprite
  for (const asset of assets) {
    for (const f of asset.frames) {
      if (frames.has(f.id)) throw new Error(`CanvasBank 帧 ID 冲突：'${f.id}'`);
      frames.set(f.id, f);
    }
    Object.assign(clips, asset.clips);
  }

  function toCanvas(painter) {
    const c = makeCanvas(painter.w, painter.h);
    write(c, painter.w, painter.h, painter.toRGBA());
    return c;
  }

  /** 取精灵：{ canvas, width, height, anchor, attachments }，变体按需生成。 */
  function sprite(frameId, variant = 'orig') {
    const key = `${frameId}:${variant}`;
    if (cache.has(key)) return cache.get(key);
    const f = frames.get(frameId);
    if (!f) throw new Error(`CanvasBank 没有帧 '${frameId}'`);
    let painter = PixelPainter.fromRGBA(f.width, f.height, f.rgba);
    let points = { anchor: f.anchor, attachments: f.attachments };
    if (variant === 'flip' || variant === 'flashFlip') {
      painter = flipHorizontal(painter);
      points = mirrorXFramePoints(points, f.width);
    }
    if (variant === 'flash' || variant === 'flashFlip') {
      painter = silhouette(painter, '#ffffff');
    }
    const s = {
      canvas: toCanvas(painter),
      width: f.width,
      height: f.height,
      anchor: points.anchor,
      attachments: points.attachments,
    };
    cache.set(key, s);
    return s;
  }

  /** 帧元数据（不生成 Canvas）。 */
  function frame(frameId) {
    const f = frames.get(frameId);
    if (!f) throw new Error(`CanvasBank 没有帧 '${frameId}'`);
    return f;
  }

  return { sprite, frame, clips, has: (id) => frames.has(id), frameIds: () => [...frames.keys()] };
}

function defaultPutPixels(canvas, w, h, rgba) {
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
}

/**
 * 剪辑取帧（纯函数）：按毫秒时长序列取 now 时刻的帧 ID。
 * @param {{frames:string[], ms:number|number[]}} clip
 * @param {number} nowMs 相对剪辑起点的毫秒数
 */
export function clipFrameAt(clip, nowMs) {
  const seq = clip.frames;
  const ms = Array.isArray(clip.ms) ? clip.ms : seq.map(() => clip.ms);
  const total = ms.reduce((a, b) => a + b, 0);
  let t = ((nowMs % total) + total) % total;
  for (let i = 0; i < seq.length; i++) {
    if (t < ms[i]) return seq[i];
    t -= ms[i];
  }
  return seq[seq.length - 1];
}

/** 附件点世界坐标（含朝向）：pos + facing × (attachment - anchor)（ADR-0002）。 */
export function attachmentWorld(frame, name, pos, facing = 1) {
  const m = frame.attachments?.[name];
  if (!m) return null;
  return { x: pos.x + (m.x - frame.anchor.x) * facing, y: pos.y + (m.y - frame.anchor.y) };
}
