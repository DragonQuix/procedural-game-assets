/**
 * geometry/humanoid.js — 人形骨架姿态求解（纯几何，无绘制）
 *
 * 源自 others_003 的 entities/rigGeometry.js 与 gfx/sprites/rig.js 的几何半
 * （见 docs/provenance.md）。solvePose 只计算关节、脚底、武器与附件点；
 * recipes/humanoid.js 的 drawPose 与元数据生成消费同一结果，不各自重算枪口。
 *
 * 坐标：帧内像素边界坐标（ADR-0002），朝右。帧约束由 spec.frame 显式给出，
 * 不再有全局 38×46 硬编码。
 */

const DEG = Math.PI / 180;

/** 默认腿部姿态表：[[后腿大腿角, 膝弯], [前腿大腿角, 膝弯]]（0 = 竖直向下，正 = 向前）。 */
export const LEG_POSES = Object.freeze({
  stand: Object.freeze([[-9, 3], [11, 5]]),
  lock: Object.freeze([[-15, 4], [17, 7]]),
  fall: Object.freeze([[-12, 32], [30, 56]]),
  crouch: Object.freeze([[-20, 95], [70, 110]]),
  kneel: Object.freeze([[-40, 100], [60, 70]]),
});

const RUN_CYCLE = [[32, 10], [18, 38], [-4, 22], [-28, 12], [-14, 78], [20, 72]];

/** 跑步 6 帧：单腿循环，另一条腿相位差 3 帧。 */
export function runLegs(frame) {
  const a = RUN_CYCLE[frame % 6];
  const b = RUN_CYCLE[(frame + 3) % 6];
  return [b, a];
}

/** 一条腿的关节位置。bottom 为鞋底下边界（用于贴地平移）。 */
export function legGeometry(hx, hy, thighDeg, bendDeg, lens) {
  const t = thighDeg * DEG;
  const kx = hx + Math.sin(t) * lens.thigh;
  const ky = hy + Math.cos(t) * lens.thigh;
  const s = (thighDeg - bendDeg) * DEG;
  const ax = kx + Math.sin(s) * lens.shin;
  const ay = ky + Math.cos(s) * lens.shin;
  return { hx, hy, kx, ky, ax, ay, bottom: Math.round(ay) + 1 };
}

/**
 * 求解开帧姿态。
 * @param {object} spec 角色配方（只需 frame、rig、parts 三段）
 *   spec.frame = { w, h, feetY, bodyX } 帧约束；feetY 为脚底边界行，bodyX 为身体中线。
 *   spec.rig = { hipY, hipSpread?, shoulderBack, shoulderFront, thigh, shin,
 *                guns: {aim: {grip:[x,y], dir:[dx,dy], back, len}},
 *                torsoDrop?, headDx?, headDrop? }
 *   spec.parts = { head: PixelPainter, torso: PixelPainter }
 * @param {object} pose { legs: [[thigh,bend],[thigh,bend]], aim?: string, gunLen?: number }
 * @returns 求解结果：腿（已贴地平移）、髋、肩、枪（grip/fore/muzzle）、头与躯干放置。
 */
export function solvePose(spec, pose) {
  const { frame, rig, parts } = spec;
  if (!frame || !Number.isFinite(frame.feetY) || !Number.isFinite(frame.bodyX)) {
    throw new TypeError('spec.frame 需要显式 { w, h, feetY, bodyX }');
  }
  if (!Array.isArray(pose.legs) || pose.legs.length !== 2) {
    throw new TypeError('pose.legs 需要 [[后腿大腿角,膝弯],[前腿大腿角,膝弯]]');
  }
  const lens = { thigh: rig.thigh, shin: rig.shin };
  const spread = rig.hipSpread ?? 1;
  const hip0 = frame.feetY + rig.hipY;

  // 腿几何 → 整体平移，让最低鞋底贴地（默认脚底锁定；腾空帧由配方给出 legs）
  const back0 = legGeometry(frame.bodyX - spread, hip0, pose.legs[0][0], pose.legs[0][1], lens);
  const front0 = legGeometry(frame.bodyX + spread, hip0, pose.legs[1][0], pose.legs[1][1], lens);
  const drop = frame.feetY - Math.max(back0.bottom, front0.bottom);
  const shift = (g) => ({ ...g, hy: g.hy + drop, ky: g.ky + drop, ay: g.ay + drop });
  const hipY = hip0 + drop;
  const rel = (v) => [frame.bodyX + v[0], frame.feetY + v[1] + drop];

  let gun = null;
  if (pose.aim != null) {
    const g = rig.guns[pose.aim];
    if (!g) throw new Error(`未知瞄准方向 '${pose.aim}'（可用：${Object.keys(rig.guns).join(', ')}）`);
    const grip = rel(g.grip);
    const len = pose.gunLen ?? g.len;
    gun = {
      grip,
      fore: [grip[0] + g.dir[0] * 5, grip[1] + g.dir[1] * 5],
      dir: g.dir,
      back: g.back,
      len,
      muzzle: [grip[0] + g.dir[0] * len, grip[1] + g.dir[1] * len],
    };
  }

  const torso = parts.torso;
  const head = parts.head;
  const tx = frame.bodyX - Math.floor(torso.w / 2);
  const ty = hipY - torso.h + (rig.torsoDrop || 0);
  const hx = frame.bodyX - Math.floor(head.w / 2) + (rig.headDx || 0);
  const hy = ty - head.h + (rig.headDrop || 0);

  return {
    drop,
    legs: { back: shift(back0), front: shift(front0) },
    hip: { x: frame.bodyX, y: hipY },
    shoulders: { back: rel(rig.shoulderBack), front: rel(rig.shoulderFront) },
    gun,
    torso: { x: tx, y: ty },
    head: { x: hx, y: hy },
  };
}

/** 瞄准时枪口的帧内坐标（供逻辑层与元数据共用，取整到像素）。 */
export function muzzleOf(solved) {
  if (!solved.gun) return null;
  return { x: Math.round(solved.gun.muzzle[0]), y: Math.round(solved.gun.muzzle[1]) };
}
