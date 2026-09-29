/**
 * recipes/humanoid.js — 参数化人形角色配方与烘焙
 *
 * 绘制半源自 others_003 的 gfx/sprites/rig.js（见 docs/provenance.md）：
 * 头与躯干用 ASCII 像素图，四肢与枪用像素线条；几何全部由
 * geometry/humanoid.js 的 solvePose 求解，本文件只消费求解结果。
 *
 * CharacterSpec（kind: 'humanoid'）：
 *   id, seed, palette, art: { head: string[], torso: string[] },
 *   frame: { w, h, feetY, bodyX },
 *   rig: { hipY, hipSpread?, shoulderBack, shoulderFront, thigh, shin, thick?,
 *          guns, proneMuzzle?, ballCenterY?, torsoDrop?, headDx?, headDrop?, heavyGun? },
 *   poses: [{ id, kind: 'rig'|'prone'|'dead'|'dive'|'ball', legs?, aim?, gunLen?, arms?, turn? }],
 *   clips: { name: { frames: [poseId...], ms } },
 *   outline?: string|null
 *
 * 调色板约定（绘制键）：腿 P/p/q/B/b，手臂 T/t，手 C，枪 m/M/O/W；
 * 其余键由 ASCII 图自定义。后侧四肢用暗色（小写）是原项目的风格约定。
 */
import { PixelPainter } from '../core/raster.js';
import { parseArt } from '../core/ascii.js';
import { rotate90 } from '../core/transform.js';
import { solvePose, muzzleOf } from '../geometry/humanoid.js';
import { assembleFrame, DEFAULT_OUTLINE } from '../bake/frame.js';
import { assembleAsset } from '../bake/asset.js';

const BALL_SIZE = 20;

/* ---------- 部件绘制（逐字移植，坐标改由 solvePose 给出） ---------- */

function drawLeg(p, pal, g, back, thick) {
  const main = back ? pal.p : pal.P;
  p.line(g.hx, g.hy, g.kx, g.ky, main, thick);
  p.line(g.kx, g.ky, g.ax, g.ay, main, thick);
  if (!back && pal.q) p.line(g.kx + 1, g.ky - 1, g.ax + 1, g.ay - 2, pal.q, 1);
  const bx = Math.round(g.ax);
  const by = Math.round(g.ay);
  p.rect(bx - 1, by - 1, 4, 2, pal.B);
  p.rect(bx - 1, by - 2, 3, 1, back ? pal.B : pal.b);
  if (!back) p.set(bx + 2, by - 1, pal.b);
}

/** 画枪：枪托→枪口的粗线 + 高光 + 弹匣 + 强调色。 */
export function drawGun(p, pal, gx, gy, dir, back, len, heavy = false) {
  const sx = gx - dir[0] * back;
  const sy = gy - dir[1] * back;
  const mx = gx + dir[0] * len;
  const my = gy + dir[1] * len;
  const under = [-dir[1], dir[0]];
  p.line(sx, sy, mx, my, pal.m, heavy ? 4 : 2);
  p.line(sx + under[0] * -0.6, sy + under[1] * -0.6, mx + under[0] * -0.6, my + under[1] * -0.6, pal.M, 1);
  const mgx = gx + dir[0] * 2;
  const mgy = gy + dir[1] * 2;
  p.line(mgx + under[0], mgy + under[1], mgx + under[0] * 3, mgy + under[1] * 3, pal.m, 2);
  p.set(Math.round(gx + dir[0] * 4), Math.round(gy + dir[1] * 4), pal.O);
  p.set(Math.round(mx), Math.round(my), pal.W);
  p.set(Math.round(mx - dir[0]), Math.round(my - dir[1]), pal.W);
}

function hand(p, pal, x, y) {
  p.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, pal.C);
}

/* ---------- 姿态绘制（消费 solvePose 结果） ---------- */

function drawRigPose(spec, pose) {
  const solved = solvePose({ frame: spec.frame, rig: spec.rig, parts: spec.parts }, pose);
  const p = new PixelPainter(spec.frame.w, spec.frame.h, { clip: spec.clip ?? 'error' });
  const pal = spec.palette;
  const thick = spec.rig.thick || 3;
  const { gun } = solved;
  const [sbx, sby] = solved.shoulders.back;
  const [sfx, sfy] = solved.shoulders.front;

  drawLeg(p, pal, solved.legs.back, true, thick);
  if (gun) p.line(sbx, sby, gun.grip[0], gun.grip[1], pal.t, 2);
  else if (pose.arms === 'flail') p.line(sbx, sby, sbx - 5, sby - 6, pal.t, 2);
  else p.line(sbx, sby, sbx + 1, sby + 7, pal.t, 2);

  drawLeg(p, pal, solved.legs.front, false, thick);

  p.blit(spec.parts.head, solved.head.x, solved.head.y);
  p.blit(spec.parts.torso, solved.torso.x, solved.torso.y);

  if (gun) {
    drawGun(p, pal, gun.grip[0], gun.grip[1], gun.dir, gun.back, gun.len, spec.rig.heavyGun);
    hand(p, pal, gun.grip[0], gun.grip[1]);
    p.line(sfx, sfy, gun.fore[0], gun.fore[1], pal.T, 2);
    hand(p, pal, gun.fore[0], gun.fore[1]);
  } else if (pose.arms === 'flail') {
    p.line(sfx, sfy, sfx + 3, sfy - 8, pal.T, 2);
    hand(p, pal, sfx + 3, sfy - 8);
  } else {
    p.line(sfx, sfy, sfx + 2, sfy + 7, pal.T, 2);
    hand(p, pal, sfx + 2, sfy + 7);
  }

  const attachments = { head: { x: solved.head.x, y: solved.head.y } };
  const muzzle = muzzleOf(solved);
  if (muzzle) attachments.muzzle = muzzle;
  return { painter: p, attachments };
}

/** 翻滚跳球形：逐帧旋转 90°。 */
function drawBallPose(spec, pose) {
  const pal = spec.palette;
  const p = new PixelPainter(BALL_SIZE, BALL_SIZE, { clip: spec.clip ?? 'error' });
  p.ellipse(10, 10.5, 7.2, 7.2, pal.g);
  p.ellipse(9.5, 10, 6, 6, pal.G);
  p.line(5, 7, 8, 4, pal.L, 1);
  p.ellipse(13.5, 13.5, 3.6, 3, pal.P);
  p.rect(15, 11, 3, 3, pal.B);
  p.rect(16, 11, 2, 1, pal.b);
  p.blit(spec.parts.head, 8, 2);
  if (pal.R) {
    p.rect(8, 8, 5, 1, pal.R);
    p.set(12, 8, pal.r);
  }
  p.rect(12, 9, 2, 2, pal.C);
  return { painter: rotate90(p, pose.turn ?? 0), attachments: { head: { x: 8, y: 2 } } };
}

/** 趴下：身体水平、头抬起、枪平指。 */
function drawPronePose(spec) {
  const { frame, rig } = spec;
  const pal = spec.palette;
  const p = new PixelPainter(frame.w, frame.h, { clip: spec.clip ?? 'error' });
  const X = frame.bodyX;
  const y = frame.feetY;
  p.line(X - 15, y - 3, X - 3, y - 3, pal.p, 3);
  p.line(X - 14, y - 2, X - 3, y - 2, pal.P, 1);
  p.rect(X - 17, y - 5, 3, 4, pal.B);
  p.rect(X - 4, y - 7, 10, 6, pal.g);
  p.rect(X - 3, y - 7, 8, 5, pal.G);
  p.rect(X - 3, y - 7, 8, 1, pal.L);
  p.rect(X - 5, y - 4, 2, 3, pal.Y || pal.g);
  if (pal.R) p.rect(X + 4, y - 8, 3, 2, pal.R);
  p.blit(spec.parts.head, X + 4, y - 14);
  const [mx, my] = rig.proneMuzzle;
  const gy = y + my;
  drawGun(p, pal, X + 11, gy, [1, 0], 5, mx - 11);
  hand(p, pal, X + 11, gy);
  p.line(X + 5, y - 5, X + 15, gy, pal.T, 2);
  hand(p, pal, X + 15, gy);
  return { painter: p, attachments: { head: { x: X + 4, y: y - 14 }, muzzle: { x: X + mx, y: gy } } };
}

/** 倒地：仰面躺平，头朝后（左）。 */
function drawDeadPose(spec) {
  const { frame } = spec;
  const pal = spec.palette;
  const p = new PixelPainter(frame.w, frame.h, { clip: spec.clip ?? 'error' });
  const X = frame.bodyX;
  const y = frame.feetY;
  p.line(X + 2, y - 3, X + 14, y - 3, pal.P, 3);
  p.rect(X + 14, y - 6, 2, 4, pal.B);
  p.rect(X - 7, y - 6, 10, 5, pal.g);
  p.rect(X - 6, y - 6, 8, 4, pal.G);
  const head = rotate90(spec.parts.head, 3);
  p.blit(head, X - 14, y - 9);
  p.line(X - 4, y - 6, X - 8, y - 11, pal.T, 2);
  p.line(X + 0, y - 6, X + 3, y - 12, pal.t, 2);
  return { painter: p, attachments: { head: { x: X - 14, y: y - 9 } } };
}

/** 潜水：只露出头顶。 */
function drawDivePose(spec) {
  const { frame } = spec;
  const p = new PixelPainter(frame.w, frame.h, { clip: spec.clip ?? 'error' });
  const hx = frame.bodyX - Math.floor(spec.parts.head.w / 2);
  const hy = frame.feetY - 16 - 3;
  p.blit(spec.parts.head, hx, hy);
  return { painter: p, attachments: { head: { x: hx, y: hy } } };
}

/* ---------- 烘焙 ---------- */

function drawPoseKind(spec, pose) {
  switch (pose.kind ?? 'rig') {
    case 'rig':
      return drawRigPose(spec, pose);
    case 'ball':
      return drawBallPose(spec, pose);
    case 'prone':
      return drawPronePose(spec);
    case 'dead':
      return drawDeadPose(spec);
    case 'dive':
      return drawDivePose(spec);
    default:
      throw new Error(`未知姿态种类 '${pose.kind}'`);
  }
}

/**
 * 烘焙人形角色：ASCII 部件解析 → 逐姿态绘制 → 描边组装帧 → 校验资产。
 * @param {CharacterSpec} spec
 * @returns {BakedAsset}
 */
export function bakeHumanoid(spec) {
  if (spec.kind !== 'humanoid') throw new TypeError(`bakeHumanoid 收到 kind='${spec.kind}'`);
  if (!spec.frame || !Number.isInteger(spec.frame.w) || !Number.isInteger(spec.frame.h)) {
    throw new TypeError(`角色 '${spec.id}' 需要显式 frame: { w, h, feetY, bodyX }`);
  }
  const parts = {
    head: parseArt(spec.art.head, spec.palette).painter,
    torso: parseArt(spec.art.torso, spec.palette).painter,
  };
  const full = { ...spec, parts };
  const outline = spec.outline === undefined ? DEFAULT_OUTLINE : spec.outline;
  const frames = [];
  for (const pose of spec.poses) {
    const { painter, attachments } = drawPoseKind(full, pose);
    const anchor =
      (pose.kind ?? 'rig') === 'ball'
        ? { x: BALL_SIZE / 2, y: BALL_SIZE / 2 - (spec.rig.ballCenterY ?? 0) }
        : { x: spec.frame.bodyX, y: spec.frame.feetY };
    frames.push(
      assembleFrame(pose.id, painter, {
        anchor,
        attachments,
        outline,
        diagnostics: painter.diagnostics.empty ? null : painter.diagnostics.toJSON(),
      }),
    );
  }
  return assembleAsset({
    id: spec.id,
    kind: spec.kind,
    seed: spec.seed ?? 0,
    frames,
    clips: spec.clips ?? {},
    diagnostics: null,
  });
}
