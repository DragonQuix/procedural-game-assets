/**
 * tools/gallery/app.js — 审图画廊
 * 动画由显式预览时钟驱动；视图选择全部写入 URL，可复现截图状态。
 * 变体（镜像/白闪/剪影/灰度）在浏览器端对解码 RGBA 做确定变换。
 */

const $ = (id) => document.getElementById(id);
const state = {
  asset: null,
  meta: null,
  frames: [],
  clips: {},
  frameId: null,
  zoom: 4,
  playing: false,
  timer: null,
  clipName: '',
  clipIndex: 0,
  compare: null, // 对比资产 { id, frames } | null
};

const canvases = new Map(); // `${assetId}/${frameId}/${variant}` -> canvas

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8ClampedArray(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 对 RGBA 应用变体，返回新的 Uint8ClampedArray。 */
function applyVariant(rgba, variant) {
  const out = new Uint8ClampedArray(rgba);
  if (variant === 'orig' || variant === 'flip') return out; // flip 在绘制时处理
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    if (variant === 'flash') {
      out[i] = 255; out[i + 1] = 255; out[i + 2] = 255;
    } else if (variant === 'sil') {
      out[i] = 16; out[i + 1] = 16; out[i + 2] = 24;
    } else if (variant === 'gray') {
      const y = Math.round(0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2]);
      out[i] = y; out[i + 1] = y; out[i + 2] = y;
    }
  }
  return out;
}

function frameCanvas(assetId, f, variant) {
  const key = `${assetId}/${f.id}/${variant}`;
  if (!canvases.has(key)) {
    const c = document.createElement('canvas');
    c.width = f.width;
    c.height = f.height;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(f.width, f.height);
    img.data.set(applyVariant(b64ToBytes(f.rgbaB64), variant));
    ctx.putImageData(img, 0, 0);
    canvases.set(key, c);
  }
  return canvases.get(key);
}

function currentFrame() {
  return state.frames.find((f) => f.id === state.frameId) ?? state.frames[0];
}

/** 背景：深色/浅色/棋盘/夜间场景/日间场景。scene 用锚点地平线。 */
function paintBackground(ctx, W, H, f, z) {
  const bg = $('bg').value;
  if (bg === 'checker') {
    for (let y = 0; y < H; y += 8) {
      for (let x = 0; x < W; x += 8) {
        ctx.fillStyle = ((x + y) / 8) % 2 ? '#3a3a44' : '#555560';
        ctx.fillRect(x, y, 8, 8);
      }
    }
    return;
  }
  if (bg === 'dark' || bg === 'light') {
    ctx.fillStyle = bg === 'light' ? '#c8c8d0' : '#202028';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  // 场景：天空渐变 + 锚点以下的地面
  const night = bg === 'night';
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  if (night) {
    sky.addColorStop(0, '#0a0e1e');
    sky.addColorStop(1, '#1c2846');
  } else {
    sky.addColorStop(0, '#7db4e0');
    sky.addColorStop(1, '#d8ecf4');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  if (night) {
    ctx.fillStyle = '#e8ecff';
    for (let i = 0; i < 14; i++) {
      const sx = ((i * 137) % 100) / 100 * W;
      const sy = ((i * 61) % 60) / 100 * H;
      ctx.fillRect(sx, sy, 2, 2);
    }
  }
  const groundY = f.anchor ? f.anchor.y * z : H * 0.8;
  ctx.fillStyle = night ? '#10160f' : '#5e7a42';
  ctx.fillRect(0, groundY, W, H - groundY);
}

function drawOne(ctx, assetId, f, z, W, H) {
  const variant = $('variant').value;
  ctx.imageSmoothingEnabled = false;
  if (variant === 'flip') {
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(frameCanvas(assetId, f, 'orig'), 0, 0, W, H);
    ctx.restore();
  } else {
    ctx.drawImage(frameCanvas(assetId, f, variant), 0, 0, W, H);
  }
}

function drawOverlays(ctx, f, z, W, H) {
  const mirrored = $('variant').value === 'flip';
  const mx = (x) => (mirrored ? f.width - x : x) * z;
  if ($('ovBounds').checked && f.bounds) {
    ctx.strokeStyle = '#e0a030';
    const x0 = mirrored ? W - f.bounds.x1 * z : f.bounds.x0 * z;
    ctx.strokeRect(x0 + 0.5, f.bounds.y0 * z + 0.5, (f.bounds.x1 - f.bounds.x0) * z - 1, (f.bounds.y1 - f.bounds.y0) * z - 1);
  }
  if ($('ovAnchor').checked && f.anchor) {
    ctx.strokeStyle = '#30e050';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx(f.anchor.x), 0);
    ctx.lineTo(mx(f.anchor.x), H);
    ctx.moveTo(0, f.anchor.y * z);
    ctx.lineTo(W, f.anchor.y * z);
    ctx.stroke();
  }
  if ($('ovAttach').checked && f.attachments) {
    for (const [name, pt] of Object.entries(f.attachments)) {
      ctx.fillStyle = name === 'muzzle' ? '#ff4040' : '#40a0ff';
      ctx.fillRect(mx(pt.x) - 2, pt.y * z - 2, 5, 5);
    }
  }
}

function drawInto(canvas, assetId, f) {
  const z = state.zoom;
  canvas.width = f.width * z;
  canvas.height = f.height * z;
  canvas.style.display = '';
  const ctx = canvas.getContext('2d');
  paintBackground(ctx, canvas.width, canvas.height, f, z);
  drawOne(ctx, assetId, f, z, canvas.width, canvas.height);
  if ($('grid').checked && z >= 4) {
    ctx.strokeStyle = 'rgba(128,128,160,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= f.width; x++) {
      ctx.moveTo(x * z + 0.5, 0);
      ctx.lineTo(x * z + 0.5, canvas.height);
    }
    for (let y = 0; y <= f.height; y++) {
      ctx.moveTo(0, y * z + 0.5);
      ctx.lineTo(canvas.width, y * z + 0.5);
    }
    ctx.stroke();
  }
  drawOverlays(ctx, f, z, canvas.width, canvas.height);
}

function draw() {
  const f = currentFrame();
  if (!f) return;
  drawInto($('cv'), state.asset, f);
  // 对比资产：同帧 ID、同视图设置
  const cv2 = $('cv2');
  const cmp = state.compare;
  if (cmp) {
    // 先按同帧 ID（版本 A/B），再按同位置（异资产对照）
    const idx = state.frames.indexOf(f);
    const cf = cmp.frames.find((x) => x.id === f.id) ?? cmp.frames[idx] ?? cmp.frames[0];
    if (cf) {
      drawInto(cv2, cmp.id, cf);
      $('cmpLabel').textContent = `对比：${cmp.id} / ${cf.id}`;
    } else {
      cv2.style.display = 'none';
      $('cmpLabel').textContent = `对比：${cmp.id}（无帧）`;
    }
  } else {
    cv2.style.display = 'none';
    $('cmpLabel').textContent = '';
  }
  const att = Object.entries(f.attachments ?? {}).map(([k, v]) => `${k}=(${v.x},${v.y})`).join(' ');
  const diag = f.diagnostics && f.diagnostics.clips > 0 ? `\n诊断：${f.diagnostics.clips} 次越界写入（配方已声明）` : '';
  const memKiB = (state.frames.reduce((n, x) => n + x.width * x.height * 4, 0) / 1024).toFixed(1);
  const meta = state.meta ?? {};
  $('info').textContent =
    `${f.id}  ${f.width}×${f.height}  锚点 (${f.anchor.x},${f.anchor.y})  ${att}${diag}\n` +
    `资产 ${meta.id}（${meta.kind}，种子 ${meta.seed}，${meta.frameCount} 帧，像素约 ${memKiB} KiB，${meta.generator}）`;
  for (const el of document.querySelectorAll('#frames .f')) el.classList.toggle('sel', el.dataset.id === f.id);
}

function setFrame(id) {
  state.frameId = id;
  syncURL();
  draw();
}

function syncURL() {
  const p = new URLSearchParams(location.search);
  if (state.asset) p.set('asset', state.asset);
  if (state.frameId) p.set('frame', state.frameId);
  p.set('zoom', state.zoom);
  p.set('bg', $('bg').value);
  p.set('variant', $('variant').value);
  if (state.clipName) p.set('clip', state.clipName);
  if (state.compare) p.set('compare', state.compare.id);
  else p.delete('compare');
  history.replaceState(null, '', `?${p}`);
}

function stopPlayback() {
  state.playing = false;
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  $('play').textContent = '播放';
}

function startPlayback() {
  const clip = state.clips[state.clipName];
  if (!clip) return;
  state.playing = true;
  $('play').textContent = '暂停';
  const ms = Array.isArray(clip.ms) ? clip.ms[0] : clip.ms;
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => {
    state.clipIndex = (state.clipIndex + 1) % clip.frames.length;
    setFrame(clip.frames[state.clipIndex]);
  }, ms);
}

async function fetchAsset(id) {
  const doc = await (await fetch(`/asset/${encodeURIComponent(id)}`)).json();
  return { id, meta: doc.meta, frames: doc.frames, clips: doc.clips ?? {} };
}

async function loadAsset(id) {
  const doc = await fetchAsset(id);
  state.asset = id;
  state.meta = doc.meta;
  state.frames = doc.frames;
  state.clips = doc.clips;
  canvases.clear();
  const inClip = new Set(Object.values(state.clips).flatMap((c) => c.frames));
  $('frames').innerHTML = state.frames
    .map((f) => `<div class="f" data-id="${f.id}">${inClip.has(f.id) ? '<span class="clip">▶</span> ' : ''}${f.id}</div>`)
    .join('');
  for (const el of document.querySelectorAll('#frames .f')) el.addEventListener('click', () => { stopPlayback(); setFrame(el.dataset.id); });
  const names = Object.keys(state.clips);
  $('clip').innerHTML = `<option value="">（单帧）</option>` + names.map((n) => `<option>${n}</option>`).join('');
  const q = new URLSearchParams(location.search);
  state.clipName = q.get('clip') && state.clips[q.get('clip')] ? q.get('clip') : '';
  $('clip').value = state.clipName;
  state.clipIndex = 0;
  const start = q.get('frame') && state.frames.some((f) => f.id === q.get('frame')) ? q.get('frame') : state.frames[0]?.id;
  setFrame(start);
}

async function loadCompare(id) {
  if (!id) {
    state.compare = null;
  } else {
    state.compare = await fetchAsset(id);
  }
  draw();
}

async function boot() {
  const assets = await (await fetch('/assets')).json();
  $('asset').innerHTML = assets.map((a) => `<option>${a}</option>`).join('');
  $('compare').innerHTML = `<option value="">（无）</option>` + assets.map((a) => `<option>${a}</option>`).join('');
  const q = new URLSearchParams(location.search);
  const first = q.get('asset') && assets.includes(q.get('asset')) ? q.get('asset') : assets[0];
  $('asset').value = first;
  if (q.get('zoom')) state.zoom = Number(q.get('zoom'));
  $('zoom').value = String(state.zoom);
  if (q.get('bg')) $('bg').value = q.get('bg');
  if (q.get('variant')) $('variant').value = q.get('variant');
  if (q.get('compare') && assets.includes(q.get('compare'))) {
    $('compare').value = q.get('compare');
    await loadCompare(q.get('compare'));
  }
  await loadAsset(first);
}

$('asset').addEventListener('change', () => { stopPlayback(); loadAsset($('asset').value); });
$('compare').addEventListener('change', () => { loadCompare($('compare').value).then(syncURL); });
$('zoom').addEventListener('change', () => { state.zoom = Number($('zoom').value); syncURL(); draw(); });
for (const id of ['grid', 'bg', 'variant', 'ovAnchor', 'ovAttach', 'ovBounds']) $(id).addEventListener('change', () => { syncURL(); draw(); });
$('clip').addEventListener('change', () => {
  stopPlayback();
  state.clipName = $('clip').value;
  state.clipIndex = 0;
  const clip = state.clips[state.clipName];
  if (clip) setFrame(clip.frames[0]);
  syncURL();
});
$('play').addEventListener('click', () => (state.playing ? stopPlayback() : startPlayback()));
$('prev').addEventListener('click', () => stepFrame(-1));
$('next').addEventListener('click', () => stepFrame(1));

function stepFrame(d) {
  stopPlayback();
  const clip = state.clips[state.clipName];
  const seq = clip ? clip.frames : state.frames.map((f) => f.id);
  const i = seq.indexOf(state.frameId);
  setFrame(seq[(i + d + seq.length) % seq.length]);
}

// 网格在主绘制里单独处理（避免与对比画布重复逻辑）
document.addEventListener('keydown', (e) => {
  if (e.key === ' ') { e.preventDefault(); state.playing ? stopPlayback() : startPlayback(); }
  if (e.key === 'ArrowLeft') stepFrame(-1);
  if (e.key === 'ArrowRight') stepFrame(1);
});

boot();
