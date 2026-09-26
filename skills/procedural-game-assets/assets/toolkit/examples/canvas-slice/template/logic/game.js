/**
 * template/logic/game.js — 轻量 Canvas 网页游戏模板逻辑层（无 DOM，ADR-0005）
 *
 * createGame({ seed, level, content, params }) 返回可手动推进的游戏：
 *   step(n, input)  逐 tick 推进；input = { left, right, up, fire, jump, pause, restart }
 *   state()         可 JSON 断言的快照（同种子同输入序列必同状态）
 *   setPaused(b) / paused / reset()
 *
 * 内容（content）全部是数据：帧元数据（锚点/附件点）、敌人表、手感参数。
 * 帧数据可来自任何烘焙器（BakedAsset.frames），本层不接触 Canvas。
 */
import { Rng } from '../../../../src/core/rng.js';
import { attachmentWorld } from '../../../../src/adapters/canvas.js';
import { moveAndCollide, overlaps, solidAt } from './collision.js';
import { createParticles } from './particles.js';

export const TICK_MS = 1000 / 60;

const DEFAULT_PARAMS = {
  runSpeed: 1.4,
  jumpSpeed: 4.6,
  gravity: 0.22,
  maxFall: 5,
  bulletSpeed: 5,
  bulletLife: 60,
  fireCooldown: 9,
  shield: 3,
  invulnTicks: 60,
  hitFlashTicks: 6,
};

export function createGame({ seed = 1, level, content }) {
  const params = { ...DEFAULT_PARAMS, ...(content.params ?? {}) };
  const frames = content.frames; // Map 或普通对象：frameId -> { anchor, attachments, width, height }
  const getFrame = (id) => (frames instanceof Map ? frames.get(id) : frames[id]);
  const initial = structuredClone({
    player: { x: content.player.x, y: content.player.y, w: content.player.w ?? 14, h: content.player.h ?? 30, vx: 0, vy: 0, onGround: true },
    enemies: content.enemies.map((e) => ({ hp: 3, alive: true, flashTicks: 0, ...e })),
  });

  let rng;
  let particles;
  let player;
  let enemies;
  let bullets;
  let camera;
  let shield;
  let invuln;
  let fireCd;
  let facing;
  let tick;
  let status;
  let paused;
  let prevInput;
  let muzzleFlash;
  let aimUp;
  let lastMuzzle;

  function reset() {
    rng = new Rng(seed);
    particles = createParticles(seed ^ 0x5eed);
    player = structuredClone(initial.player);
    enemies = structuredClone(initial.enemies);
    bullets = [];
    camera = { x: 0 };
    shield = params.shield;
    invuln = 0;
    fireCd = 0;
    facing = 1;
    tick = 0;
    status = 'playing';
    paused = false;
    prevInput = {};
    muzzleFlash = 0;
    aimUp = false;
    lastMuzzle = { x: 0, y: 0 };
  }

  function enemyBox(e) {
    return { x: e.x, y: e.y, w: e.w ?? 20, h: e.h ?? 16 };
  }

  function stepTick(input) {
    if (status !== 'playing') {
      // 终局后仍更新粒子（余韵），便于观察
      particles.update();
      tick += 1;
      return;
    }
    // 移动与跳跃
    const wantLeft = Boolean(input.left);
    const wantRight = Boolean(input.right);
    player.vx = wantLeft && !wantRight ? -params.runSpeed : wantRight && !wantLeft ? params.runSpeed : 0;
    if (player.vx !== 0) facing = Math.sign(player.vx);
    if (input.jump && player.onGround) player.vy = -params.jumpSpeed;
    player.vy = Math.min(params.maxFall, player.vy + params.gravity);
    moveAndCollide(player, level);
    if (player.y > level.pixelH + 64) {
      // 掉出关卡：失败
      shield = 0;
      status = 'fail';
      return;
    }

    // 射击（交互）：子弹从枪口附件点出膛
    aimUp = Boolean(input.up);
    if (input.fire && fireCd <= 0) {
      const fid = aimUp ? 'p_stand_up' : 'p_stand_fwd';
      const f = getFrame(fid);
      const m = attachmentWorld(f, 'muzzle', { x: player.x + player.w / 2, y: player.y + player.h }, facing);
      lastMuzzle = m;
      bullets.push({ x: m.x, y: m.y, vx: aimUp ? 0 : params.bulletSpeed * facing, vy: aimUp ? -params.bulletSpeed : 0, life: params.bulletLife });
      fireCd = params.fireCooldown;
      muzzleFlash = 3;
      particles.burst(m.x, m.y, 2, { speed: 0.6, life: 8, colors: ['#ffe08a'], updraft: 0 });
    }
    fireCd -= 1;
    muzzleFlash = Math.max(0, muzzleFlash - 1);

    // 子弹推进与命中（先撞图块，再撞敌人）
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx;
      b.y += b.vy;
      b.life -= 1;
      let dead = b.life <= 0;
      if (!dead && solidAt(level, Math.floor(b.x / level.tileSize), Math.floor(b.y / level.tileSize))) {
        particles.burst(b.x, b.y, 4, { speed: 0.8, life: 12, colors: ['#c5cbe0', '#86995c'] });
        dead = true;
      }
      if (!dead) {
        for (const e of enemies) {
          if (!e.alive) continue;
          if (overlaps({ x: b.x - 1, y: b.y - 1, w: 3, h: 3 }, enemyBox(e))) {
            e.hp -= 1;
            e.flashTicks = params.hitFlashTicks;
            particles.burst(b.x, b.y, 6, { speed: 1.4 });
            if (e.hp <= 0) {
              e.alive = false;
              particles.burst(b.x, b.y, 24, { speed: 2.2, life: 36, colors: ['#ff8a3d', '#ffe08a', '#5a5f70'] });
            }
            dead = true;
            break;
          }
        }
      }
      if (dead) bullets.splice(i, 1);
    }

    // 敌人状态与接触伤害
    for (const e of enemies) {
      if (e.flashTicks > 0) e.flashTicks -= 1;
      if (!e.alive || invuln > 0) continue;
      if (overlaps(player, enemyBox(e))) {
        shield -= 1;
        invuln = params.invulnTicks;
        particles.burst(player.x + player.w / 2, player.y + player.h / 2, 10, { speed: 1.6, colors: ['#ff6a6a', '#ffffff'] });
        if (shield <= 0) {
          status = 'fail';
          return;
        }
      }
    }
    invuln = Math.max(0, invuln - 1);

    // 胜利判定：全部敌人被击毁
    if (enemies.every((e) => !e.alive)) status = 'win';

    // 镜头跟随（屏宽 45% 处推进，只进不退）
    const viewW = content.view?.w ?? 320;
    const target = player.x - viewW * 0.45;
    camera.x = Math.max(camera.x, Math.min(target, level.pixelW - viewW));

    particles.update();
    tick += 1;
  }

  reset();

  return {
    step(n, input = {}) {
      for (let i = 0; i < n; i++) {
        // 暂停与重启为边沿触发（本 tick 新按下）；重启当 tick 不再推进
        if (input.restart && !prevInput.restart) {
          reset();
          prevInput = { ...input };
          continue;
        }
        if (input.pause && !prevInput.pause) paused = !paused;
        if (!paused) stepTick(input);
        prevInput = { ...input };
      }
    },
    state() {
      return {
        tick,
        status,
        paused,
        shield,
        facing,
        player: { x: round2(player.x), y: round2(player.y), vx: round2(player.vx), vy: round2(player.vy), onGround: player.onGround },
        camera: { x: round2(camera.x) },
        bullets: bullets.map((b) => ({ x: round2(b.x), y: round2(b.y), life: b.life })),
        enemies: enemies.map((e) => ({ id: e.id, hp: e.hp, alive: e.alive, flashTicks: e.flashTicks })),
        particles: { count: particles.count(), checksum: particles.checksum() },
        invuln,
        muzzleFlash,
        moving: player.vx !== 0,
        aim: aimUp ? 'up' : 'fwd',
      };
    },
    /** 渲染用视图（含活动引用：子弹/粒子列表；勿在逻辑外修改） */
    view() {
      return {
        tick,
        status,
        cameraX: camera.x,
        shield,
        shieldMax: params.shield,
        invuln,
        muzzleFlash,
        lastMuzzle,
        aimUp,
        facing,
        player,
        bullets,
        particles: particles.list(),
        enemies,
      };
    },
    setPaused(b) {
      paused = Boolean(b);
    },
    get paused() {
      return paused;
    },
    reset,
  };
}

function round2(v) {
  return Math.round(v * 100) / 100;
}
