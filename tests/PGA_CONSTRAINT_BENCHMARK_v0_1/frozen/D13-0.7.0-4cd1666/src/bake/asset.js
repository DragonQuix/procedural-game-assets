/**
 * bake/asset.js — 资产级组装与校验
 *
 * BakedAsset = { id, kind, seed, frames: BakedFrame[], clips, diagnostics }
 * clips = { name: { frames: [frameId...], ms: number | number[] } }，时间单位毫秒。
 * 校验：帧 ID 唯一、clip 引用的帧存在、时长为正有限数、像素内存上限。
 */

/** 默认像素内存上限：64 MiB RGBA。 */
export const DEFAULT_MEMORY_CAP = 64 * 1024 * 1024;

export class BakeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BakeError';
  }
}

/**
 * @param {object} args
 * @param {string} args.id
 * @param {string} args.kind 配方种类（如 'humanoid'）
 * @param {number|string} args.seed
 * @param {BakedFrame[]} args.frames
 * @param {Record<string,{frames:string[], ms:number|number[]}>} [args.clips]
 * @param {object} [args.diagnostics]
 * @param {number} [args.memoryCap]
 */
export function assembleAsset(args) {
  const { id, kind, seed } = args;
  if (!id) throw new BakeError('资产需要 id');
  const frames = args.frames ?? [];
  const clips = args.clips ?? {};
  const seen = new Set();
  let bytes = 0;
  for (const f of frames) {
    if (seen.has(f.id)) throw new BakeError(`帧 ID 冲突：'${f.id}'`);
    seen.add(f.id);
    bytes += f.rgba.length;
  }
  const cap = args.memoryCap ?? DEFAULT_MEMORY_CAP;
  if (bytes > cap) throw new BakeError(`资产 '${id}' 像素内存 ${bytes} 超过上限 ${cap}`);
  for (const [name, clip] of Object.entries(clips)) {
    if (!Array.isArray(clip.frames) || clip.frames.length === 0) throw new BakeError(`clip '${name}' 缺少帧序列`);
    for (const fid of clip.frames) {
      if (!seen.has(fid)) throw new BakeError(`clip '${name}' 引用不存在的帧 '${fid}'`);
    }
    const durations = Array.isArray(clip.ms) ? clip.ms : [clip.ms];
    if (durations.length === 0 || durations.some((d) => !Number.isFinite(d) || d <= 0)) {
      throw new BakeError(`clip '${name}' 时长必须为正有限毫秒数`);
    }
    if (Array.isArray(clip.ms) && clip.ms.length !== clip.frames.length) {
      throw new BakeError(`clip '${name}' 时长数组长度 ${clip.ms.length} ≠ 帧数 ${clip.frames.length}`);
    }
  }
  return {
    id,
    kind,
    seed,
    frames,
    clips,
    diagnostics: args.diagnostics ?? null,
  };
}
