/**
 * export/manifest.js — 版本化资产清单（ADR-0003）
 *
 * 清单字段：schemaVersion、generator、recipe、seed、pages、frames、clips、hints。
 * 不含构建时间戳与绝对路径；帧 ID 唯一且按 ID 排序（内容确定）。
 * schemaVersion 不兼容时导入必须失败并说明原因。
 */

export const SCHEMA_VERSION = 1;

/**
 * @param {BakedAsset} asset
 * @param {{pages: Array}} packed packAtlas 的结果
 * @param {object} meta
 * @param {string} meta.generator 生成器标识（含版本）
 * @param {string} [meta.recipeVersion]
 */
export function buildManifest(asset, packed, meta = {}) {
  const pages = packed.pages.map((p, i) => ({ file: `${asset.id}.page${i}.png`, width: p.width, height: p.height }));
  const frames = [];
  packed.pages.forEach((p, pageIndex) => {
    for (const pl of p.placements) {
      const f = asset.frames.find((fr) => fr.id === pl.id);
      if (!f) throw new Error(`清单缺少帧 '${pl.id}' 的烘焙数据`);
      frames.push({
        id: pl.id,
        page: pageIndex,
        rect: { x: pl.x, y: pl.y, w: pl.w, h: pl.h },
        source: { w: f.width, h: f.height }, // 未裁剪源尺寸（首版不裁边，与 rect 相同）
        anchor: f.anchor,
        attachments: f.attachments,
        bounds: f.bounds,
      });
    }
  });
  frames.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    schemaVersion: SCHEMA_VERSION,
    generator: meta.generator ?? 'unknown',
    recipe: { id: asset.id, kind: asset.kind, version: meta.recipeVersion ?? '0' },
    seed: asset.seed,
    pages,
    frames,
    clips: asset.clips,
    hints: { filter: 'nearest', mipmap: false, timeUnit: 'ms' },
  };
}

/**
 * 校验清单（导入侧）。返回错误数组，空数组表示合法。
 * schemaVersion 不等于当前版本时报错并说明原因，不静默猜测。
 */
export function validateManifest(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return ['清单不是对象'];
  if (doc.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion ${doc.schemaVersion} 与本导入器支持的 ${SCHEMA_VERSION} 不兼容`);
    return errors; // 版本不兼容时不继续猜测其余字段
  }
  if (!Array.isArray(doc.pages) || doc.pages.length === 0) errors.push('pages 缺失或为空');
  if (!Array.isArray(doc.frames)) errors.push('frames 缺失');
  const ids = new Set();
  for (const f of doc.frames ?? []) {
    if (!f.id) errors.push('存在无 id 的帧');
    if (ids.has(f.id)) errors.push(`帧 ID 冲突：'${f.id}'`);
    ids.add(f.id);
    if (!f.rect || ![f.rect.x, f.rect.y, f.rect.w, f.rect.h].every(Number.isFinite)) errors.push(`帧 '${f.id}' rect 非法`);
    if (!f.anchor || !Number.isFinite(f.anchor.x) || !Number.isFinite(f.anchor.y)) errors.push(`帧 '${f.id}' anchor 非法`);
    if (typeof f.page !== 'number' || f.page < 0 || f.page >= (doc.pages?.length ?? 0)) errors.push(`帧 '${f.id}' page 索引越界`);
    if (f.rect && doc.pages?.[f.page]) {
      const p = doc.pages[f.page];
      if (f.rect.x + f.rect.w > p.width || f.rect.y + f.rect.h > p.height) errors.push(`帧 '${f.id}' rect 超出页面 ${p.width}×${p.height}`);
    }
  }
  for (const [name, clip] of Object.entries(doc.clips ?? {})) {
    for (const fid of clip.frames ?? []) {
      if (!ids.has(fid)) errors.push(`clip '${name}' 引用不存在的帧 '${fid}'`);
    }
  }
  return errors;
}
