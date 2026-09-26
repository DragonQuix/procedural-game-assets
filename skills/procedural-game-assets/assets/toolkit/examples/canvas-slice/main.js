/**
 * examples/canvas-slice/main.js — Canvas 消费切片
 *
 * 只消费离线导出产物（manifest + 图集 PNG），不碰烘焙器：
 * - 帧矩形从 manifest.pages/frames 取得
 * - 绘制位置 = 世界坐标 - anchor（锚点对齐脚底）
 * - 子弹出膛点 = 角色位置 + (attachments.muzzle - anchor)，面朝左时 x 取反
 * - 镜像：加载时整页预翻一次；镜像帧锚点 = W - x（ADR-0002 点镜像）
 * - 剪辑播放按 manifest.clips 的毫秒时长驱动
 * 检查清单：移动、一个动作切换（↑朝上瞄准）、一种交互（J 射击）、日夜背景对照（B）。
 */

const VIEW_W = 320;
const VIEW_H = 180;
const GROUND_Y = 150;

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const scene = document.createElement('canvas');
scene.width = VIEW_W;
scene.height = VIEW_H;
const g = scene.getContext('2d');

async function loadManifest(id) {
  const manifest = await (await fetch(`/assets/${id}.manifest.json`)).json();
  if (manifest.schemaVersion !== 1) throw new Error(`schemaVersion ${manifest.schemaVersion} 与本切片不兼容`);
  const pages = await Promise.all(
    manifest.pages.map(
      (p) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`无法加载图集 ${p.file}`));
          img.src = `/assets/${p.file}`;
        }),
    ),
  );
  return { manifest, pages };
}

const { manifest, pages } = await loadManifest('ember');
if (manifest.hints?.filter !== 'nearest' || manifest.hints?.mipmap !== false) console.warn('清单采样提示缺失');
const frames = new Map(manifest.frames.map((f) => [f.id, f]));

// 每页预生成一个水平镜像画布（像素 W-1-i）；镜像帧锚点/附件点用点镜像 W-x
const flippedPages = pages.map((img) => {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const cctx = c.getContext('2d');
  cctx.translate(img.width, 0);
  cctx.scale(-1, 1);
  cctx.drawImage(img, 0, 0);
  return c;
});

const player = { x: 80, facing: 1, moving: false, firing: 0 };
const keys = new Set();
const bullets = [];
let night = true;
let last = performance.now();
const clipClocks = new Map();

addEventListener('keydown', (e) => {
  keys.add(e.key);
  if (e.key === 'b' || e.key === 'B') night = !night;
});
addEventListener('keyup', (e) => keys.delete(e.key));

function clipFrame(clipName, now) {
  const clip = manifest.clips[clipName];
  if (!clip) return null;
  const seq = clip.frames;
  const ms = Array.isArray(clip.ms) ? clip.ms : seq.map(() => clip.ms);
  const total = ms.reduce((a, b) => a + b, 0);
  if (!clipClocks.has(clipName)) clipClocks.set(clipName, now);
  let t = (now - clipClocks.get(clipName)) % total;
  for (let i = 0; i < seq.length; i++) {
    if (t < ms[i]) return seq[i];
    t -= ms[i];
  }
  return seq[0];
}

function frameId(now) {
  if (player.moving) return keys.has('ArrowUp') ? 'p_stand_up' : clipFrame('run_fwd', now);
  return keys.has('ArrowUp') ? 'p_stand_up' : 'p_stand_fwd';
}

/** 附件点的世界坐标（含朝向）：pos + facing * (attachment - anchor) */
function attachmentWorld(f, name) {
  const m = f.attachments[name];
  return { x: player.x + (m.x - f.anchor.x) * player.facing, y: GROUND_Y + (m.y - f.anchor.y) };
}

function update(dt, now) {
  player.moving = false;
  if (keys.has('ArrowLeft')) {
    player.x -= 0.09 * dt;
    player.facing = -1;
    player.moving = true;
  }
  if (keys.has('ArrowRight')) {
    player.x += 0.09 * dt;
    player.facing = 1;
    player.moving = true;
  }
  player.x = Math.max(20, Math.min(VIEW_W - 20, player.x));
  if ((keys.has('j') || keys.has('J')) && player.firing <= 0) {
    const m = attachmentWorld(frames.get(frameId(now)), 'muzzle');
    bullets.push({ x: m.x, y: m.y, vx: 0.3 * player.facing });
    player.firing = 120;
  }
  player.firing -= dt;
  for (const b of bullets) b.x += b.vx * dt;
  for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].x < -10 || bullets[i].x > VIEW_W + 10) bullets.splice(i, 1);
}

function drawFrame(fid, wx, wy, facing) {
  const f = frames.get(fid);
  if (!f) return;
  const dy = Math.round(wy - f.anchor.y);
  if (facing > 0) {
    g.drawImage(pages[f.page], f.rect.x, f.rect.y, f.rect.w, f.rect.h, Math.round(wx - f.anchor.x), dy, f.rect.w, f.rect.h);
  } else {
    // 镜像帧：rect 在预翻页上的位置 + 锚点点镜像 W-x
    const page = pages[f.page];
    const fx = page.width - f.rect.x - f.rect.w;
    const ax = f.rect.w - f.anchor.x;
    g.drawImage(flippedPages[f.page], fx, f.rect.y, f.rect.w, f.rect.h, Math.round(wx - ax), dy, f.rect.w, f.rect.h);
  }
}

function drawBackground() {
  const sky = g.createLinearGradient(0, 0, 0, VIEW_H);
  if (night) {
    sky.addColorStop(0, '#0a0e1e');
    sky.addColorStop(1, '#1c2846');
  } else {
    sky.addColorStop(0, '#7db4e0');
    sky.addColorStop(1, '#d8ecf4');
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  if (night) {
    g.fillStyle = '#e8ecff';
    for (let i = 0; i < 24; i++) g.fillRect((i * 53) % VIEW_W, ((i * 29) % 90) + 4, 1, 1);
  }
  g.fillStyle = night ? '#10160f' : '#5e7a42';
  g.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);
  g.fillStyle = night ? '#1d2a1a' : '#74904e';
  g.fillRect(0, GROUND_Y, VIEW_W, 2);
}

function render(now) {
  drawBackground();
  const fid = frameId(now);
  drawFrame(fid, player.x, GROUND_Y, player.facing);
  for (const b of bullets) {
    g.fillStyle = '#ffe08a';
    g.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 1, 4, 2);
  }
  const m = attachmentWorld(frames.get(fid), 'muzzle'); // 调试叠加：枪口附件点
  g.fillStyle = '#ff4040';
  g.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 1, 3, 3);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scene, 0, 0, cv.width, cv.height);
}

function loop(now) {
  const dt = Math.min(50, now - last);
  last = now;
  update(dt, now);
  render(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
