/**
 * tools/gallery/app.js — 最低可用审图画廊
 * 所有动画由显式预览时钟驱动；视图选择写入 URL，可复现截图状态。
 */

const $ = (id) => document.getElementById(id);
const state = {
  asset: null,
  frames: [],
  clips: {},
  frameId: null,
  zoom: 4,
  playing: false,
  timer: null,
  clipName: '',
  clipIndex: 0,
};

const canvases = new Map(); // frameId -> offscreen canvas（原尺寸）

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8ClampedArray(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function frameCanvas(f) {
  if (!canvases.has(f.id)) {
    const c = document.createElement('canvas');
    c.width = f.width;
    c.height = f.height;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(f.width, f.height);
    img.data.set(b64ToBytes(f.rgbaB64));
    ctx.putImageData(img, 0, 0);
    canvases.set(f.id, c);
  }
  return canvases.get(f.id);
}

function currentFrame() {
  return state.frames.find((f) => f.id === state.frameId) ?? state.frames[0];
}

function draw() {
  const f = currentFrame();
  if (!f) return;
  const z = state.zoom;
  const cv = $('cv');
  cv.width = f.width * z;
  cv.height = f.height * z;
  const ctx = cv.getContext('2d');
  // 背景
  const bg = $('bg').value;
  if (bg === 'checker') {
    for (let y = 0; y < cv.height; y += 8) {
      for (let x = 0; x < cv.width; x += 8) {
        ctx.fillStyle = ((x + y) / 8) % 2 ? '#3a3a44' : '#555560';
        ctx.fillRect(x, y, 8, 8);
      }
    }
  } else {
    ctx.fillStyle = bg === 'light' ? '#c8c8d0' : '#202028';
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frameCanvas(f), 0, 0, cv.width, cv.height);
  // 网格
  if ($('grid').checked && z >= 4) {
    ctx.strokeStyle = 'rgba(128,128,160,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= f.width; x++) {
      ctx.moveTo(x * z + 0.5, 0);
      ctx.lineTo(x * z + 0.5, cv.height);
    }
    for (let y = 0; y <= f.height; y++) {
      ctx.moveTo(0, y * z + 0.5);
      ctx.lineTo(cv.width, y * z + 0.5);
    }
    ctx.stroke();
  }
  // 包围盒
  if ($('ovBounds').checked && f.bounds) {
    ctx.strokeStyle = '#e0a030';
    ctx.strokeRect(f.bounds.x0 * z + 0.5, f.bounds.y0 * z + 0.5, (f.bounds.x1 - f.bounds.x0) * z - 1, (f.bounds.y1 - f.bounds.y0) * z - 1);
  }
  // 锚点十字
  if ($('ovAnchor').checked && f.anchor) {
    ctx.strokeStyle = '#30e050';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(f.anchor.x * z, 0);
    ctx.lineTo(f.anchor.x * z, cv.height);
    ctx.moveTo(0, f.anchor.y * z);
    ctx.lineTo(cv.width, f.anchor.y * z);
    ctx.stroke();
  }
  // 附件点
  if ($('ovAttach').checked && f.attachments) {
    for (const [name, pt] of Object.entries(f.attachments)) {
      ctx.fillStyle = name === 'muzzle' ? '#ff4040' : '#40a0ff';
      ctx.fillRect(pt.x * z - 2, pt.y * z - 2, 5, 5);
    }
  }
  // 信息
  const att = Object.entries(f.attachments ?? {}).map(([k, v]) => `${k}=(${v.x},${v.y})`).join(' ');
  const diag = f.diagnostics && f.diagnostics.clips > 0 ? `\n诊断：${f.diagnostics.clips} 次越界写入（配方已声明）` : '';
  $('info').textContent = `${f.id}  ${f.width}×${f.height}  锚点 (${f.anchor.x},${f.anchor.y})  ${att}${diag}`;
  // 帧列表高亮
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
  if (state.clipName) p.set('clip', state.clipName);
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

async function loadAsset(id) {
  const doc = await (await fetch(`/asset/${encodeURIComponent(id)}`)).json();
  state.asset = id;
  state.frames = doc.frames;
  state.clips = doc.clips ?? {};
  canvases.clear();
  // 帧列表
  const inClip = new Set(Object.values(state.clips).flatMap((c) => c.frames));
  $('frames').innerHTML = state.frames
    .map((f) => `<div class="f" data-id="${f.id}">${inClip.has(f.id) ? '<span class="clip">▶</span> ' : ''}${f.id}</div>`)
    .join('');
  for (const el of document.querySelectorAll('#frames .f')) el.addEventListener('click', () => { stopPlayback(); setFrame(el.dataset.id); });
  // 剪辑下拉
  const names = Object.keys(state.clips);
  $('clip').innerHTML = `<option value="">（单帧）</option>` + names.map((n) => `<option>${n}</option>`).join('');
  const q = new URLSearchParams(location.search);
  state.clipName = q.get('clip') && state.clips[q.get('clip')] ? q.get('clip') : '';
  $('clip').value = state.clipName;
  state.clipIndex = 0;
  const start = q.get('frame') && state.frames.some((f) => f.id === q.get('frame')) ? q.get('frame') : state.frames[0]?.id;
  setFrame(start);
}

async function boot() {
  const assets = await (await fetch('/assets')).json();
  $('asset').innerHTML = assets.map((a) => `<option>${a}</option>`).join('');
  const q = new URLSearchParams(location.search);
  const first = q.get('asset') && assets.includes(q.get('asset')) ? q.get('asset') : assets[0];
  $('asset').value = first;
  if (q.get('zoom')) state.zoom = Number(q.get('zoom'));
  $('zoom').value = String(state.zoom);
  if (q.get('bg')) $('bg').value = q.get('bg');
  await loadAsset(first);
}

$('asset').addEventListener('change', () => { stopPlayback(); loadAsset($('asset').value); });
$('zoom').addEventListener('change', () => { state.zoom = Number($('zoom').value); syncURL(); draw(); });
for (const id of ['grid', 'bg', 'ovAnchor', 'ovAttach', 'ovBounds']) $(id).addEventListener('change', () => { syncURL(); draw(); });
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

document.addEventListener('keydown', (e) => {
  if (e.key === ' ') { e.preventDefault(); state.playing ? stopPlayback() : startPlayback(); }
  if (e.key === 'ArrowLeft') stepFrame(-1);
  if (e.key === 'ArrowRight') stepFrame(1);
});

boot();
