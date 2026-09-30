/**
 * studio/observe.js — Studio 观察视图（纯函数，ADR-0001/0008）
 *
 * 视图数据只含 RGBA 字节与元数据；PNG 编码与写盘在 IO 层（adapters/studio-files.js）。
 * native 不放大（不靠放大掩盖缺陷）；display 用最近邻整数倍 + 明确背景色；
 * target_crop 截取指定节点及邻域。UI 标号/遮罩只属于观察产物，不进最终资产。
 */
import { PixelPainter } from '../core/raster.js';
import { scaleNearest } from '../core/transform.js';
import { targetCrop } from '../observe/frame-views.js';
import { validateRasterRegion, regionContains } from './raster-doc.js';

const LIGHT_BACKGROUND = '#eee8db';
const SILHOUETTE_COLOR = '#151922';

/** 帧 → { width, height, rgba } 普通数据。 */
function frameView(frame) {
  return { width: frame.width, height: frame.height, rgba: frame.rgba };
}

/** painter → 背景填充后的 RGBA 视图（背景色 '#rrggbb'）。 */
function withBackground(painter, background) {
  const out = new PixelPainter(painter.w, painter.h, { clip: 'error' });
  out.rect(0, 0, painter.w, painter.h, background);
  out.blit(painter, 0, 0);
  return { width: out.w, height: out.h, rgba: out.toRGBA() };
}

function rasterContrastViews(painter) {
  const silhouette = painter.clone();
  silhouette.map(() => SILHOUETTE_COLOR);
  return {
    light: withBackground(painter, LIGHT_BACKGROUND),
    silhouette: withBackground(silhouette, LIGHT_BACKGROUND),
  };
}

/**
 * 构建一次编译的观察视图集。
 * @param {object} compiled compileStudioDocument 的结果
 * @param {object} [opts]
 * @param {number} [opts.displayScale] display 放大倍数（正整数），默认 4
 * @param {string} [opts.background] display 背景色，默认 '#202028'
 * @param {string} [opts.node] 需要 target_crop 的节点 ID
 * @param {object} [opts.region] 位图选区，追加透明裁切、局部浅底与剪影
 * @returns {{ native, display, crop?: object, meta: object }}
 */
export function buildViews(compiled, opts = {}) {
  const frame = compiled.asset.frames[0];
  const scale = opts.displayScale ?? 4;
  if (!Number.isInteger(scale) || scale < 1 || scale > 32) throw new RangeError(`非法 display 放大倍数：${opts.displayScale}`);
  const background = opts.background ?? '#202028';
  const native = frameView(frame);
  const scaled = scaleNearest(PixelPainter.fromRGBA(frame.width, frame.height, frame.rgba), scale);
  const display = withBackground(scaled, background);
  const views = {
    native,
    display,
    meta: {
      frameId: frame.id,
      scale,
      background,
      sampling: 'nearest',
      documentHash: compiled.hashes.documentHash,
      renderHash: compiled.hashes.renderHash,
    },
  };
  if (compiled.kind === 'raster') {
    Object.assign(views, rasterContrastViews(scaled));
  }
  if (opts.region !== undefined) {
    if (compiled.kind !== 'raster' || opts.node !== undefined) throw new RangeError('region 只用于位图且不能与 node 同时使用');
    const region = validateRasterRegion(opts.region, frame.width, frame.height);
    views.target_crop = targetCrop(frame, { rect: region, contextPx: 2, scale, identity: { revision: opts.revision ?? null, candidateId: opts.candidateId ?? null, documentHash: compiled.hashes.documentHash, regionId: region.id } });
    views.crop = views.target_crop.native;
    views.meta.target_crop = views.target_crop.meta;
    const cropPainter = PixelPainter.fromRGBA(views.crop.width, views.crop.height, views.crop.rgba);
    const contrast = rasterContrastViews(scaleNearest(cropPainter, scale));
    views.cropLight = contrast.light;
    views.cropSilhouette = contrast.silhouette;
    views.meta.target_crop.backgrounds = { light: LIGHT_BACKGROUND, silhouette: LIGHT_BACKGROUND };
    views.meta.region = region;
    const selection = PixelPainter.fromRGBA(frame.width, frame.height, frame.rgba);
    for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
      if (regionContains(region, x, y)) selection.set(x, y, '#ef4584');
    }
    views.selection = withBackground(scaleNearest(selection, scale), background);
  }
  if (opts.node !== undefined) {
    const entry = compiled.sceneMap.nodes.find((n) => n.id === opts.node);
    if (!entry) throw new RangeError(`sceneMap 中不存在节点 '${opts.node}'`);
    views.target_crop = targetCrop(frame, { rect: entry.frameRect, contextPx: 2, scale, identity: { revision: opts.revision ?? null, candidateId: opts.candidateId ?? null, documentHash: compiled.hashes.documentHash, nodeId: entry.id } });
    views.crop = { ...views.target_crop.native, nodeId: entry.id };
    views.meta.target_crop = views.target_crop.meta;
  }
  return views;
}

/* ---------- 角色（多帧）视图与播放材料 ---------- */

/** 纯 JS base64（核心无 Buffer 依赖；bytes → base64 字符串）。 */
function base64Encode(bytes) {
  const TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += TABLE[a >> 2] + TABLE[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? TABLE[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < bytes.length ? TABLE[c & 63] : '=');
  }
  return out;
}

/**
 * 角色编译结果 → 逐帧视图 + 自包含播放页（player.html）。
 * 播放材料：帧以 data URL 内嵌，按剪辑毫秒时长用 requestAnimationFrame 逐帧播放，
 * 可暂停/逐帧步进/切换剪辑；是真实播放材料，不是静态帧拼图。PNG 编码在 IO 层：
 * 调用方传 encode(width,height,rgba)→PNG 字节后才有 playerHtml，否则为 null。
 */
export function buildCharacterViews(compiled, opts = {}) {
  if (opts.region !== undefined) throw new RangeError('region 只用于位图');
  const scale = opts.displayScale ?? 4;
  const background = opts.background ?? '#202028';
  const encode = opts.encode;
  const frames = compiled.asset.frames.map((f) => {
    const scaled = scaleNearest(PixelPainter.fromRGBA(f.width, f.height, f.rgba), scale);
    return { id: f.id, native: frameView(f), display: withBackground(scaled, background) };
  });
  let playerHtml = null;
  if (typeof encode === 'function') {
    const frameData = compiled.asset.frames.map((f) => {
      const scaled = scaleNearest(PixelPainter.fromRGBA(f.width, f.height, f.rgba), Math.max(2, scale));
      const bg = withBackground(scaled, background);
      return { id: f.id, width: bg.width, height: bg.height, dataUrl: `data:image/png;base64,${base64Encode(encode(bg.width, bg.height, bg.rgba))}` };
    });
    playerHtml = buildPlayerHtml(compiled, frameData, { background });
  }
  return { frames, playerHtml };
}

/** 自包含播放页（无外部资源；file:// 直接打开可播）。 */
export function buildPlayerHtml(compiled, frameData, opts = {}) {
  const background = opts.background ?? '#202028';
  const payload = JSON.stringify({
    id: compiled.asset.id,
    frames: frameData,
    clips: compiled.asset.clips,
    renderHash: compiled.hashes.renderHash,
  });
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>PGA Studio 播放预览 — ${compiled.asset.id}</title>
<style>
  body { background: #17171d; color: #d8d8e0; font: 14px/1.5 system-ui, sans-serif; margin: 24px; }
  h1 { font-size: 16px; } code { color: #8ff0e8; }
  .stage { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
  canvas { background: ${background}; image-rendering: pixelated; border: 1px solid #333; }
  button { background: #2a2a33; color: inherit; border: 1px solid #444; padding: 4px 10px; margin: 2px; cursor: pointer; }
  button.active { border-color: #8ff0e8; }
  .meta { color: #9a9aa5; font-size: 12px; margin-top: 8px; }
</style>
</head>
<body>
<h1>PGA Studio 播放预览：<code>${compiled.asset.id}</code></h1>
<div class="stage">
  <div>
    <canvas id="cv"></canvas>
    <div class="meta" id="info"></div>
    <div id="ctl">
      <button data-act="play">播放/暂停</button>
      <button data-act="prev">‹ 上一帧</button>
      <button data-act="next">下一帧 ›</button>
    </div>
    <div id="clips"></div>
  </div>
</div>
<div class="meta">renderHash=<code>${compiled.hashes.renderHash}</code>；帧内嵌为 data URL，时长来自资产剪辑（毫秒）。</div>
<script id="pga-data" type="application/json">${payload.replace(/</g, '\u003c')}</script>
<script>
const DATA = JSON.parse(document.getElementById('pga-data').textContent);
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const info = document.getElementById('info');
const byId = new Map(DATA.frames.map((f) => [f.id, f]));
const images = new Map();
let clipName = Object.keys(DATA.clips)[0] ?? null;
let frameIds = clipName ? DATA.clips[clipName].frames : DATA.frames.map((f) => f.id);
let durations = clipName ? (Array.isArray(DATA.clips[clipName].ms) ? DATA.clips[clipName].ms : frameIds.map(() => DATA.clips[clipName].ms)) : frameIds.map(() => 500);
let idx = 0;
let playing = true;

function draw() {
  const f = byId.get(frameIds[idx]);
  const img = images.get(f.id);
  cv.width = f.width;
  cv.height = f.height;
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (img && img.complete) ctx.drawImage(img, 0, 0);
  info.textContent = (clipName ? '剪辑 ' + clipName + ' · ' : '') + '帧 ' + frameIds[idx] + '（' + (idx + 1) + '/' + frameIds.length + '，' + durations[idx] + 'ms）' + (playing ? ' · 播放中' : ' · 已暂停');
}
function select(name) {
  clipName = name;
  frameIds = name ? DATA.clips[name].frames : DATA.frames.map((f) => f.id);
  const ms = name ? DATA.clips[name].ms : 500;
  durations = Array.isArray(ms) ? ms : frameIds.map(() => ms);
  idx = 0;
  acc = 0;
  for (const b of document.querySelectorAll('#clips button')) b.classList.toggle('active', b.dataset.clip === name);
  draw();
}
const clipsBox = document.getElementById('clips');
for (const name of Object.keys(DATA.clips)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.dataset.clip = name;
  b.onclick = () => select(name);
  clipsBox.appendChild(b);
}
document.getElementById('ctl').addEventListener('click', (e) => {
  const act = e.target.dataset.act;
  if (act === 'play') playing = !playing;
  if (act === 'prev') { idx = (idx - 1 + frameIds.length) % frameIds.length; playing = false; }
  if (act === 'next') { idx = (idx + 1) % frameIds.length; playing = false; }
  draw();
});
function tick(now) {
  if (playing) {
    if (!lastTick) lastTick = now;
    acc += now - lastTick;
    while (acc >= durations[idx]) { acc -= durations[idx]; idx = (idx + 1) % frameIds.length; }
    lastTick = now;
    draw();
  } else {
    lastTick = 0;
  }
}
let acc = 0;
let lastTick = 0;
let loaded = 0;
for (const f of DATA.frames) {
  const img = new Image();
  img.onload = () => { if (++loaded === DATA.frames.length) { select(clipName); setInterval(() => tick(performance.now()), 50); requestAnimationFrame(function raf(t) { tick(t); requestAnimationFrame(raf); }); } };
  img.src = f.dataUrl;
  images.set(f.id, img);
}
</script>
</body>
</html>
`;
}
