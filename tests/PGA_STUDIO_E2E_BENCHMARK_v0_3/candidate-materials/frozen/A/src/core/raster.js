/**
 * core/raster.js — 无抗锯齿像素绘制器（无 DOM、无 IO）
 *
 * 源自 others_003 的 gfx/pixelPainter.js（见 docs/provenance.md）。差异：
 * - 不 import 任何平台模块；对外输出 toRGBA()，Canvas 由适配层负责。
 * - 越界写入按 clip 策略处理（默认 error），不再静默裁剪。
 * - 坐标取整统一用 Math.floor（负数不再被 |0 截向 0）。
 * - 非法尺寸、非有限坐标、退化形状抛出可定位异常。
 *
 * 坐标约定（ADR-0002）：帧左上角 (0,0)，x 向右、y 向下；
 * 绘制参数为像素边界坐标，几何点允许小数，各原语按注释规则取整。
 */
import { packColor, unpackColor } from './color.js';
import { Diagnostics, RasterClipError } from './diagnostics.js';

/** 画布像素数上限（16777216 px = 64 MiB Uint32Array）。 */
export const MAX_PIXELS = 1 << 24;

export class PixelPainter {
  /**
   * @param {number} w 宽（正整数）
   * @param {number} h 高（正整数）
   * @param {object} [opts]
   * @param {'error'|'warn'|'allow'} [opts.clip] 越界写入策略，默认 'error'
   * @param {Diagnostics} [opts.diagnostics] 外部诊断收集器（不传给子副本）
   */
  constructor(w, h, opts = {}) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w * h > MAX_PIXELS) {
      throw new RangeError(`非法画布尺寸 ${w}×${h}：需为正整数且 w*h ≤ ${MAX_PIXELS}`);
    }
    const clip = opts.clip ?? 'error';
    if (clip !== 'error' && clip !== 'warn' && clip !== 'allow') {
      throw new TypeError(`非法 clip 策略：${JSON.stringify(opts.clip)}`);
    }
    this.w = w;
    this.h = h;
    this.clip = clip;
    this.data = new Uint32Array(w * h);
    this.diagnostics = opts.diagnostics ?? new Diagnostics();
    this._op = 'set';
  }

  /** 点是否在画布内（像素索引语义）。 */
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** 读像素（越界返回 0 = 透明）。x/y 按 Math.floor 取整。 */
  get(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    return this.inside(x, y) ? this.data[y * this.w + x] : 0;
  }

  /**
   * 写像素。x/y 按 Math.floor 取整（负数向 -∞，不用 |0）。
   * 越界写入按 clip 策略处理：error 抛 RasterClipError，warn 记录，allow 计数。
   */
  set(x, y, color) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError(`非有限坐标：(${x}, ${y})，操作 ${this._op}`);
    }
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inside(x, y)) {
      if (this.clip === 'error') throw new RasterClipError(this._op, x, y, this.w, this.h);
      if (this.clip === 'warn') this.diagnostics.recordClip(this._op, x, y);
      else this.diagnostics.clips += 1;
      return this;
    }
    this.data[y * this.w + x] = typeof color === 'number' ? color >>> 0 : packColor(color);
    return this;
  }

  /** 该像素是否不透明（alpha > 0）。 */
  opaque(x, y) {
    return this.get(x, y) >>> 24 > 0;
  }

  /** 以操作名执行 fn，让越界诊断能定位到原语。 */
  _as(op, fn) {
    const prev = this._op;
    this._op = op;
    try {
      return fn();
    } finally {
      this._op = prev;
    }
  }

  /** 实心矩形 [x, x+w) × [y, y+h)，边界坐标取 floor。 */
  rect(x, y, w, h, color) {
    if (![x, y, w, h].every(Number.isFinite)) throw new TypeError(`rect 非有限参数：${[x, y, w, h]}`);
    if (w < 0 || h < 0) throw new RangeError(`rect 非法宽高：${w}×${h}`);
    const c = packColor(color);
    return this._as('rect', () => {
      for (let j = Math.floor(y); j < Math.floor(y + h); j++) {
        for (let i = Math.floor(x); i < Math.floor(x + w); i++) this.set(i, j, c);
      }
      return this;
    });
  }

  /** 实心椭圆（像素精确，无抗锯齿）。rx/ry 必须为正有限数。 */
  ellipse(cx, cy, rx, ry, color) {
    if (![cx, cy, rx, ry].every(Number.isFinite)) throw new TypeError(`ellipse 非有限参数：${[cx, cy, rx, ry]}`);
    if (rx <= 0 || ry <= 0) throw new RangeError(`ellipse 非法半径：${rx}, ${ry}`);
    const c = packColor(color);
    return this._as('ellipse', () => {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / (rx + 0.01);
          const dy = (y + 0.5 - cy) / (ry + 0.01);
          if (dx * dx + dy * dy <= 1) this.set(x, y, c);
        }
      }
      return this;
    });
  }

  /** Bresenham 直线，thick 为粗细（方形笔刷，正整数）。端点四舍五入。 */
  line(x0, y0, x1, y1, color, thick = 1) {
    if (![x0, y0, x1, y1].every(Number.isFinite)) throw new TypeError(`line 非有限参数：${[x0, y0, x1, y1]}`);
    if (!Number.isInteger(thick) || thick < 1 || thick > 64) throw new RangeError(`line 非法粗细：${thick}`);
    const c = packColor(color);
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const off = Math.floor((thick - 1) / 2);
    return this._as('line', () => {
      for (let guard = 0; guard < 4096; guard++) {
        for (let j = 0; j < thick; j++) for (let i = 0; i < thick; i++) this.set(x0 + i - off, y0 + j - off, c);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
      return this;
    });
  }

  /** 多边形扫描线填充（偶奇规则）。points: [[x,y], ...]，至少 3 个有限点。 */
  poly(points, color) {
    if (!Array.isArray(points) || points.length < 3) throw new RangeError(`poly 至少需要 3 个点，收到 ${points?.length}`);
    for (const pt of points) {
      if (!Array.isArray(pt) || pt.length !== 2 || !pt.every(Number.isFinite)) {
        throw new TypeError(`poly 非法顶点：${JSON.stringify(pt)}`);
      }
    }
    const c = packColor(color);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return this._as('poly', () => {
      for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
        const sy = y + 0.5;
        const xs = [];
        for (let i = 0; i < points.length; i++) {
          const [ax, ay] = points[i];
          const [bx, by] = points[(i + 1) % points.length];
          if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c);
        }
      }
      return this;
    });
  }

  /** 在不透明像素外围加 1px 描边（4 邻域；diag=true 时 8 邻域）。就地修改。 */
  outline(color, diag = false) {
    const c = packColor(color);
    const src = this.data.slice();
    const w = this.w;
    const h = this.h;
    const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[y * w + x] >>> 24 > 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (op(x, y)) continue;
        let near = op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1);
        if (!near && diag) near = op(x - 1, y - 1) || op(x + 1, y - 1) || op(x - 1, y + 1) || op(x + 1, y + 1);
        if (near) this.data[y * w + x] = c;
      }
    }
    return this;
  }

  /**
   * 把 src 叠到自己上：src 的不透明像素直接覆盖（不做 alpha 混合），
   * 透明像素跳过。flip 为真时水平镜像 src（像素索引 w-1-i）。
   */
  blit(src, dx, dy, flip = false) {
    dx = Math.floor(dx);
    dy = Math.floor(dy);
    return this._as('blit', () => {
      for (let y = 0; y < src.h; y++) {
        for (let x = 0; x < src.w; x++) {
          const v = src.data[y * src.w + (flip ? src.w - 1 - x : x)];
          if (v >>> 24) this.set(dx + x, dy + y, v);
        }
      }
      return this;
    });
  }

  /** 按回调逐像素改色（只处理不透明像素）：fn(x, y, color) → 新颜色或 undefined（不变）。 */
  map(fn) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        const v = this.data[i];
        if (!(v >>> 24)) continue;
        const n = fn(x, y, v);
        if (n !== undefined) this.data[i] = typeof n === 'number' ? n >>> 0 : packColor(n);
      }
    }
    return this;
  }

  /** 按种子随机点缀（纹理噪点）。只改已有不透明像素；rand 须为确定性随机源。 */
  speckle(x, y, w, h, color, density, rand) {
    if (typeof rand !== 'function') throw new TypeError('speckle 需要确定性 rand()');
    const c = packColor(color);
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (this.opaque(i, j) && rand() < density) this.set(i, j, c);
      }
    }
    return this;
  }

  /** 导出 RGBA 字节（显式逐像素解包，与 CPU 字节序无关）。 */
  toRGBA() {
    const out = new Uint8ClampedArray(this.w * this.h * 4);
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i];
      out[i * 4] = v & 255;
      out[i * 4 + 1] = (v >>> 8) & 255;
      out[i * 4 + 2] = (v >>> 16) & 255;
      out[i * 4 + 3] = v >>> 24;
    }
    return out;
  }

  /** 从 RGBA 字节构造。长度必须恰为 w*h*4。 */
  static fromRGBA(w, h, bytes, opts = {}) {
    const p = new PixelPainter(w, h, opts);
    if (!(bytes instanceof Uint8ClampedArray) && !(bytes instanceof Uint8Array)) {
      throw new TypeError('fromRGBA 需要 Uint8Array/Uint8ClampedArray');
    }
    if (bytes.length !== w * h * 4) throw new RangeError(`RGBA 长度 ${bytes.length} ≠ ${w * h * 4}`);
    for (let i = 0; i < p.data.length; i++) {
      p.data[i] = ((bytes[i * 4 + 3] << 24) | (bytes[i * 4 + 2] << 16) | (bytes[i * 4 + 1] << 8) | bytes[i * 4]) >>> 0;
    }
    return p;
  }

  /** 深拷贝（不含外部诊断引用）。 */
  clone() {
    const p = new PixelPainter(this.w, this.h, { clip: this.clip });
    p.data.set(this.data);
    return p;
  }
}

export { packColor, unpackColor };
