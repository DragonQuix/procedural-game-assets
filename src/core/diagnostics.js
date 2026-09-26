/**
 * core/diagnostics.js — 裁剪诊断与错误类型
 *
 * 绘制器在写出边界时按 clip 策略处理：
 *   'error' 抛出 RasterClipError（默认，配方烘焙不允许静默裁剪）
 *   'warn'  记录到 diagnostics，继续绘制
 *   'allow' 只计数，不记录明细（显式声明的有意裁剪）
 */

/** 写出边界的绘制尝试。message 含操作、坐标与画布尺寸，可定位到帧。 */
export class RasterClipError extends Error {
  /**
   * @param {string} op 产生越界的操作名
   * @param {number} x
   * @param {number} y
   * @param {number} w 画布宽
   * @param {number} h 画布高
   */
  constructor(op, x, y, w, h) {
    super(`绘制越界：${op} 写 (${x}, ${y})，画布 ${w}×${h}。有意裁剪请显式设置 clip: 'warn' | 'allow'`);
    this.name = 'RasterClipError';
    this.op = op;
    this.x = x;
    this.y = y;
    this.canvasW = w;
    this.canvasH = h;
  }
}

/** 诊断收集器。samples 只保留前 limit 条，count 始终精确。 */
export class Diagnostics {
  constructor(limit = 32) {
    this.limit = limit;
    /** 越界写入总次数 */
    this.clips = 0;
    /** 越界样本 [{op, x, y}] */
    this.clipSamples = [];
    /** 警告文本 */
    this.warnings = [];
  }

  /** @returns {boolean} 是否有任何诊断记录 */
  get empty() {
    return this.clips === 0 && this.warnings.length === 0;
  }

  recordClip(op, x, y) {
    this.clips += 1;
    if (this.clipSamples.length < this.limit) this.clipSamples.push({ op, x, y });
  }

  warn(message) {
    if (this.warnings.length < this.limit) this.warnings.push(message);
  }

  /** 汇总为可序列化对象。 */
  toJSON() {
    return { clips: this.clips, clipSamples: this.clipSamples, warnings: this.warnings };
  }
}
