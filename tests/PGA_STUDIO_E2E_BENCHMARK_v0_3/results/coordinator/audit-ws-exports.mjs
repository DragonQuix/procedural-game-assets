// 宿主审计：D14 trial 中 ws/ 根下未入账 PNG 的内容级对账。
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const repo = resolve(process.argv[2] ?? '.');
const bench = join(repo, 'tests/PGA_STUDIO_E2E_BENCHMARK_v0_3');
const runsRoot = join(bench, 'runs');
const sha256b = b => createHash('sha256').update(b).digest('hex');
const canonical = v => v && typeof v === 'object'
  ? Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const renderHashOf = frame => sha256b(canonical({ width: frame.width, height: frame.height, rgba: Array.from(frame.rgba) }));
const { decodePNG } = await import(pathToFileURL(join(bench, 'candidate-materials/shared/src/export/png.js')));

const matrix = JSON.parse(await readFile(join(bench, 'candidate-materials/planned-matrix.json'), 'utf8'));
const out = {};
for (const spec of matrix.runs.filter(r => r.arm === 'D14')) {
  const staged = join(runsRoot, spec.runId, 'staged');
  const wsFiles = (await readdir(join(staged, 'ws'))).filter(f => /\.png$/i.test(f));
  const ledger = JSON.parse(await readFile(join(staged, 'ledger.json'), 'utf8'));
  const knownRender = new Set(ledger.candidates.map(c => c.renderHash));
  const finalState = JSON.parse(await readFile(join(staged, 'final/state.json'), 'utf8'));
  const findings = [];
  for (const f of wsFiles) {
    const png = decodePNG(await readFile(join(staged, 'ws', f)));
    const rh = renderHashOf({ width: png.width, height: png.height, rgba: png.rgba });
    const inLedger = knownRender.has(rh), isFinal = rh === renderHashOf(finalState.frame);
    findings.push({ file: f, renderHash: rh, matchesLedger: inLedger, matchesFinal: isFinal });
  }
  out[spec.runId] = { wsPngs: wsFiles.length, findings,
    allMatchKnown: findings.every(x => x.matchesLedger || x.matchesFinal) };
}
console.log(JSON.stringify(out, null, 1));
