/**
 * template/logic/collision.js — 图块关卡与 AABB 分轴碰撞（无 DOM）
 *
 * 关卡用字符行声明：'#' 实心，'.' 空。物理体 {x, y, w, h}（左上角，像素），
 * 先 X 后 Y 分轴解算（与原项目 world/collision.js 同一思路的简化版）。
 * 注意：只按前缘解算——出生点必须放在实心之外（嵌入实心会直接坠落），
 * 模板不做嵌入挤出。
 */

/**
 * @param {string[]} rows 字符行
 * @param {number} [tileSize] 默认 16
 * @returns {{cols:number, rows:number, tileSize:number, tiles:Uint8Array, pixelW:number, pixelH:number}}
 */
export function makeLevel(rows, tileSize = 16) {
  if (!Array.isArray(rows) || rows.length === 0) throw new RangeError('关卡为空');
  const cols = Math.max(...rows.map((r) => r.length));
  const tiles = new Uint8Array(cols * rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') tiles[y * cols + x] = 1;
  });
  return { cols, rows: rows.length, tileSize, tiles, pixelW: cols * tileSize, pixelH: rows.length * tileSize };
}

export function solidAt(level, tx, ty) {
  if (tx < 0 || tx >= level.cols) return true; // 关卡左右边界视为墙
  if (ty < 0 || ty >= level.rows) return false; // 顶部与底部出界不算实心（掉落由游戏判定）
  return level.tiles[ty * level.cols + tx] === 1;
}

function rangeTiles(v0, span, size) {
  return [Math.floor(v0 / size), Math.floor((v0 + span - 0.001) / size)];
}

/**
 * 分轴移动并解算。body: { x, y, w, h, vx, vy, onGround }，就地修改。
 * onGround 在 Y 轴解算后更新（站立时下一 tick 仍被承接需重新落地判定由 vy 决定）。
 */
export function moveAndCollide(body, level) {
  const s = level.tileSize;
  // X 轴
  body.x += body.vx;
  {
    const [ty0, ty1] = rangeTiles(body.y, body.h, s);
    if (body.vx > 0) {
      const tx = Math.floor((body.x + body.w) / s);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (solidAt(level, tx, ty)) {
          body.x = tx * s - body.w;
          body.vx = 0;
          break;
        }
      }
    } else if (body.vx < 0) {
      const tx = Math.floor(body.x / s);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (solidAt(level, tx, ty)) {
          body.x = (tx + 1) * s;
          body.vx = 0;
          break;
        }
      }
    }
  }
  // Y 轴
  body.y += body.vy;
  body.onGround = false;
  {
    const [tx0, tx1] = rangeTiles(body.x, body.w, s);
    if (body.vy > 0) {
      const ty = Math.floor((body.y + body.h) / s);
      for (let tx = tx0; tx <= tx1; tx++) {
        if (solidAt(level, tx, ty)) {
          body.y = ty * s - body.h;
          body.vy = 0;
          body.onGround = true;
          break;
        }
      }
    } else if (body.vy < 0) {
      const ty = Math.floor(body.y / s);
      for (let tx = tx0; tx <= tx1; tx++) {
        if (solidAt(level, tx, ty)) {
          body.y = (ty + 1) * s;
          body.vy = 0;
          break;
        }
      }
    }
  }
  return body;
}

/** 两个 AABB 是否相交（{x,y,w,h}）。 */
export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
