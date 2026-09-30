/**
 * src/adapters/asset-file.js — 烘焙资产 ↔ JSON 文件格式（无 Node 依赖的纯函数）
 *
 * P2 的中间格式：帧携带 base64 RGBA，供画廊与 CLI 使用。
 * P3 将在此基础上增加 PNG 图集与版本化 manifest（ADR-0003）。
 */

/** 资产 → 可序列化对象（无时间戳、无绝对路径，内容确定）。 */
export function assetToJSON(asset, meta = {}) {
  return {
    meta: {
      id: asset.id,
      kind: asset.kind,
      seed: asset.seed,
      generator: meta.generator ?? 'unknown',
      frameCount: asset.frames.length,
    },
    clips: asset.clips,
    frames: asset.frames.map((f) => ({
      id: f.id,
      width: f.width,
      height: f.height,
      anchor: f.anchor,
      attachments: f.attachments,
      bounds: f.bounds,
      diagnostics: f.diagnostics,
      rgbaB64: Buffer.from(f.rgba.buffer, f.rgba.byteOffset, f.rgba.byteLength).toString('base64'),
    })),
  };
}

/** JSON 对象 → 资产（RGBA 还原为 Uint8ClampedArray）。 */
export function assetFromJSON(doc) {
  return {
    id: doc.meta.id,
    kind: doc.meta.kind,
    seed: doc.meta.seed,
    clips: doc.clips ?? {},
    frames: doc.frames.map((f) => ({
      id: f.id,
      width: f.width,
      height: f.height,
      anchor: f.anchor,
      attachments: f.attachments ?? {},
      bounds: f.bounds ?? null,
      diagnostics: f.diagnostics ?? null,
      rgba: new Uint8ClampedArray(Buffer.from(f.rgbaB64, 'base64')),
    })),
  };
}
