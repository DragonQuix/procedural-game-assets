import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { benchmark, repo, compiledState } from './prepare-materials.mjs';
import { materials, directSource } from './materials.mjs';
import { sha256, canonical, renderHash } from '../shared/accounting.mjs';

const roots = ['tests/PGA_AB_BENCHMARK_v1_2', 'tests/PGA_CONSTRAINT_BENCHMARK_v0_1', 'tests/PGA_RELATION_BENCHMARK_v0_2', 'examples/studio'];
export function layoutFingerprint(doc) {
  if (!Array.isArray(doc?.nodes) || !doc.canvas) return null;
  const norm = (v, dim) => Math.round(v / dim * 100000) / 100000;
  const nodes = doc.nodes.map(n => ({ kind: n.kind,
    ...(n.kind === 'poly' ? { vertices: n.vertices.map(([x, y]) => [norm(x, doc.canvas.w), norm(y, doc.canvas.h)]) } :
      n.kind === 'disc' ? { cx: norm(n.cx, doc.canvas.w), cy: norm(n.cy, doc.canvas.h), rx: norm(n.rx, doc.canvas.w), ry: norm(n.ry, doc.canvas.h) } :
        { x: norm(n.x, doc.canvas.w), y: norm(n.y, doc.canvas.h), w: norm(n.w, doc.canvas.w), h: norm(n.h, doc.canvas.h) }) }));
  return sha256(canonical(nodes.map(canonical).sort()));
}
const drawLayout = source => [...source.matchAll(/\bp\.(rect|poly|ellipse)\(([^;\n]+)\)/g)].map(m => `${m[1]}(${m[2].replace(/'#[a-f0-9]{6}'|"#[a-f0-9]{6}"/gi, 'COLOR').replace(/\s/g, '')})`).join(';');
const phrases = text => {
  const normalized = text.replace(/[\s\p{P}\p{S}]/gu, '');
  return new Set(Array.from({ length: Math.max(0, normalized.length - 31) }, (_, i) => normalized.slice(i, i + 32)));
};

export async function leakageScan(materialRoot) {
  const api = await import(pathToFileURL(join(materialRoot, 'frozen/D14/src/studio/compiler.js')));
  const { decodePNG } = await import(pathToFileURL(join(materialRoot, 'frozen/D14/src/export/png.js')));
  const specs = materials(api), oldDocs = [], oldImages = new Map(), oldSources = new Map(), oldWording = [];
  const files = execFileSync('git', ['ls-files', '--', ...roots], { cwd: repo, maxBuffer: 8 * 1024 * 1024 }).toString().trim().split(/\r?\n/)
    .filter(p => p && !/\/(frozen|runs|reviews|results|shared|node_modules)\//.test(p));
  function documents(value, path) {
    if (!value || typeof value !== 'object') return;
    const fp = layoutFingerprint(value); if (fp) oldDocs.push({ path, fp });
    for (const child of Object.values(value)) if (typeof child === 'object') documents(child, path);
  }
  for (const file of files) {
    const bytes = await readFile(join(repo, file));
    if (file.endsWith('.json')) { try { documents(JSON.parse(bytes), file); } catch { /* 非任务 JSON 不作几何证据。 */ } }
    if (file.endsWith('.png')) { const f = decodePNG(bytes); oldImages.set(renderHash(f), file); }
    if (/\.[cm]?js$/.test(file)) { const layout = drawLayout(bytes.toString()); if (layout) oldSources.set(layout, file); }
    if (/(?:TASK|tasks\/[^/]+)\.md$/i.test(file)) oldWording.push({ file, phrases: phrases(bytes.toString()) });
  }
  const checks = [];
  for (const [task, spec] of Object.entries(specs)) {
    const layout = layoutFingerprint(spec.baseline), sourceLayout = drawLayout(directSource(spec.baseline));
    const wording = phrases(await readFile(join(benchmark, `tasks/${task}.md`), 'utf8'));
    checks.push({ task, sourceLayoutDuplicate: oldSources.get(sourceLayout) ?? null, geometryDuplicates: oldDocs.filter(d => d.fp === layout).map(d => d.path),
      baselinePixelDuplicate: oldImages.get(renderHash(compiledState(api, spec.D14).frame)) ?? null,
      wording32CharacterMatches: oldWording.flatMap(old => [...wording].filter(p => old.phrases.has(p)).slice(0, 3).map(phrase => ({ file: old.file, phrase }))),
      targetImage: 'NONE', manualInterpretationRequired: true });
  }
  return { schema: 'pga-e2e-leakage/0.3', corpusRoots: roots, trackedFilesScanned: files.length, geometryDocuments: oldDocs.length,
    imageFingerprints: oldImages.size, sourceLayouts: oldSources.size, wordingDocuments: oldWording.length,
    status: checks.every(c => !c.sourceLayoutDuplicate && !c.geometryDuplicates.length && !c.baselinePixelDuplicate && !c.wording32CharacterMatches.length) ? 'PASS' : 'REVIEW_REQUIRED', checks,
    limitation: '静态扫描只能排除列出的逐字/布局/像素重复，不能证明模型训练数据中从未出现相似题材；功能与开放视觉目标另附人工说明。' };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await leakageScan(resolve(process.argv[2] ?? join(benchmark, 'candidate-materials'))), null, 2));
}
