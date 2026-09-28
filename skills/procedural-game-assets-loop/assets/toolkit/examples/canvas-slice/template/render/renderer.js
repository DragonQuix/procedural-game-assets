/**
 * template/render/renderer.js — 表现层（浏览器侧，ADR-0005）
 *
 * 层序：场景层（背景/图块/实体）→ 自发光层（子弹/枪口焰/粒子）→ HUD 层。
 * 全部像素来自 CanvasBank（启动烘焙缓存）；动画由游戏 tick 显式驱动，
 * 暂停即冻结（显式预览时钟），不依赖 CSS/rAF 进度。
 */
import { clipFrameAt } from '../../../../src/adapters/canvas.js';
import { TICK_MS } from '../logic/game.js';

export function createRenderer({ ctx, bank, level, view, night = true }) {
  const { w: VW, h: VH } = view;

  function drawBackground(cam) {
    const sky = ctx.createLinearGradient(0, 0, 0, VH);
    if (night) {
      sky.addColorStop(0, '#0a0e1e');
      sky.addColorStop(1, '#1c2846');
    } else {
      sky.addColorStop(0, '#7db4e0');
      sky.addColorStop(1, '#d8ecf4');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VW, VH);
    if (night) {
      ctx.fillStyle = '#e8ecff';
      for (let i = 0; i < 30; i++) {
        let sx = ((i * 53) % 500) - cam * 0.3;
        sx = ((sx % (VW + 20)) + VW + 20) % (VW + 20) - 10;
        ctx.fillRect(sx, ((i * 29) % 110) + 4, 1, 1);
      }
    }
  }

  function drawTiles(cam) {
    for (let ty = 0; ty < level.rows; ty++) {
      for (let tx = 0; tx < level.cols; tx++) {
        if (level.tiles[ty * level.cols + tx] !== 1) continue;
        const topOpen = ty === 0 || level.tiles[(ty - 1) * level.cols + tx] !== 1;
        const id = topOpen ? 'top' : 'fill';
        if (!bank.has(id)) continue;
        const s = bank.sprite(id);
        ctx.drawImage(s.canvas, tx * level.tileSize - cam, ty * level.tileSize, level.tileSize, level.tileSize);
      }
    }
  }

  function drawScene(v) {
    const cam = Math.round(v.cameraX);
    drawBackground(cam);
    drawTiles(cam);
    ctx.save();
    ctx.translate(-cam, 0);

    // 敌人（损毁后保持损坏态残骸；受击白闪）
    for (const e of v.enemies) {
      const fid = e.alive ? 'mole_base' : 'mole_base_damaged';
      const variant = e.flashTicks > 0 ? 'flash' : 'orig';
      const s = bank.sprite(fid, variant);
      ctx.drawImage(s.canvas, Math.round(e.x + e.w / 2 - s.anchor.x), Math.round(e.y + e.h - s.anchor.y));
    }

    // 玩家（无敌帧闪烁：每 4 tick 隐 1 tick）
    const blink = v.invuln > 0 && v.tick % 4 === 3;
    if (!blink) {
      const nowMs = v.tick * TICK_MS;
      let fid;
      if (!v.player.onGround) fid = 'p_fall_fwd';
      else if (v.player.vx !== 0) fid = clipFrameAt(bank.clips.run_fwd, nowMs);
      else fid = v.aimUp ? 'p_stand_up' : 'p_stand_fwd';
      const s = bank.sprite(fid, v.facing < 0 ? 'flip' : 'orig');
      const ax = v.facing < 0 ? s.width - s.anchor.x : s.anchor.x;
      ctx.drawImage(s.canvas, Math.round(v.player.x + v.player.w / 2 - ax), Math.round(v.player.y + v.player.h - s.anchor.y));
    }
    ctx.restore();
  }

  function drawEmissive(v) {
    const cam = Math.round(v.cameraX);
    ctx.save();
    ctx.translate(-cam, 0);
    // 子弹
    for (const b of v.bullets) {
      ctx.fillStyle = '#ffe08a';
      ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 1, 4, 2);
    }
    // 枪口焰（3 tick 星形）
    if (v.muzzleFlash > 0) {
      const { x, y } = v.lastMuzzle;
      ctx.fillStyle = '#fff2b0';
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 3, 2, 6);
      ctx.fillRect(Math.round(x) - 3, Math.round(y) - 1, 6, 2);
    }
    // 粒子
    for (const p of v.particles) {
      ctx.globalAlpha = Math.max(0.2, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawHud(v) {
    // 护盾格
    for (let i = 0; i < v.shieldMax; i++) {
      ctx.fillStyle = i < v.shield ? '#39d0c4' : '#2a3440';
      ctx.fillRect(6 + i * 8, 6, 6, 6);
    }
  }

  function draw(game) {
    const v = game.view();
    drawScene(v);
    drawEmissive(v);
    drawHud(v);
  }

  return { draw };
}
