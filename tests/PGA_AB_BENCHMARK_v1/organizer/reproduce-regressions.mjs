// Read-only source audit: creates isolated test workspaces under the output directory.
// Usage: node reproduce-regressions.mjs /path/to/repository /path/to/output
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(process.argv[2] ?? process.cwd());
const output = resolve(process.argv[3] ?? join(root, 'work/review-regressions'));
await mkdir(output, { recursive: true });
const { StudioStore } = await import(pathToFileURL(join(root, 'src/adapters/studio-store.js')));
const original = JSON.parse(await readFile(join(root, 'examples/studio/terminal.studio.json'), 'utf8'));
const opts = { generator: 'independent-audit', toolVersion: '0.6.0-audit' };
const results = [];
async function workspace(name) {
  const dir = await mkdtemp(join(output, `${name}-`));
  const { store } = await StudioStore.create(dir, structuredClone(original), opts);
  return { dir, store };
}
async function attempt(fn) {
  try { return { ok: true, value: await fn() }; }
  catch (e) { return { ok: false, code: e.code ?? e.name, message: e.message }; }
}
async function run(id, fn) {
  try { const result = await fn(); results.push({ id, ...result }); }
  catch (e) { results.push({ id, setupError: e.stack }); }
}
for (const [op, field, value] of [['material.set','material','flat'],['ramp.set','ramp','amber']]) {
  await run(`explore-commit-${op}`, async () => {
    const { dir, store } = await workspace('explore');
    const explored = await store.explore({ baseRevision: 'r1', spec: { id: op, target: 'terminal.shell', field, values: [value] } });
    const candidate = explored.candidates[0];
    const committed = await attempt(() => store.commit({ action: 'accept', candidateId: candidate.candidateId, expectedHead: 'r1' }));
    return { bugReproduced: candidate.status === 'OK' && !committed.ok, dir, candidateStatus: candidate.status, commit: committed };
  });
}
await run('stale-writer-overwrites-revision', async () => {
  const { dir, store: first } = await workspace('stale');
  const second = await StudioStore.open(dir, opts);
  const a = await first.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } } });
  const b = await second.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 24 } } });
  const c1 = await first.commit({ action: 'accept', candidateId: a.candidateId, expectedHead: 'r1' });
  const before = JSON.parse(await readFile(join(dir, 'revisions/r2.json'), 'utf8'));
  const c2 = await attempt(() => second.commit({ action: 'accept', candidateId: b.candidateId, expectedHead: 'r1' }));
  const after = JSON.parse(await readFile(join(dir, 'revisions/r2.json'), 'utf8'));
  return { bugReproduced: c2.ok && before.hashes.documentHash !== after.hashes.documentHash, dir, firstCommit: c1, staleCommit: c2,
    firstR2Width: before.doc.nodes.find(n=>n.id==='terminal.shell').w, currentR2Width: after.doc.nodes.find(n=>n.id==='terminal.shell').w };
});
await run('commit-crash-before-ledger', async () => {
  const { dir, store } = await workspace('crash');
  const c = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } } });
  const request = { action: 'accept', candidateId: c.candidateId, expectedHead: 'r1', requestId: 'commit-crash-1' };
  store._writeLedger = async () => { throw new Error('AUDIT_FAULT: persistence failed after head update'); };
  const firstAttempt = await attempt(() => store.commit(request));
  const reopened = await StudioStore.open(dir, opts);
  const replay = await attempt(() => reopened.commit(request));
  return { bugReproduced: !firstAttempt.ok && reopened.head === 'r2' && !replay.ok, dir, firstAttempt, diskHead: reopened.head, replay };
});
await run('candidate-removes-authoritative-protection', async () => {
  const { dir, store } = await workspace('protection');
  const c = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.screen', params: { w: 10 } } });
  const file = join(dir,'candidates',`${c.candidateId}.json`);
  const record = JSON.parse(await readFile(file, 'utf8'));
  record.preserve = [];
  record.checks.status = 'OK';
  record.checks.code = null;
  record.checks.conflicts = [];
  await writeFile(file, JSON.stringify(record));
  const committed = await attempt(() => store.commit({ action: 'accept', candidateId: c.candidateId, expectedHead: 'r1' }));
  return { bugReproduced: c.status === 'REJECTED' && committed.ok, dir, originalStatus: c.status, unchangedSourceConstraints: record.doc.constraints, commit: committed };
});
await run('misspelled-preserve-silently-ignored', async () => {
  const { dir, store } = await workspace('typo');
  const requestPreserve = [{ kind: 'pixel', target: 'terminal.shell' }];
  const candidate = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } }, preserve: requestPreserve });
  return { bugReproduced: candidate.status === 'OK' && candidate.diff.pixels > 0, dir, requestedProtection: requestPreserve, status: candidate.status, diff: candidate.diff, effectiveProtections: candidate.checks.protections };
});
await run('request-id-escapes-workspace', async () => {
  const { dir, store } = await workspace('path');
  const escapeFile = join(output, `escape-${dir.split('/').at(-1)}`);
  const requestId = `../../${escapeFile.split('/').at(-1)}`;
  const result = await attempt(() => store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } }, requestId }));
  const escaped = await attempt(() => readFile(`${escapeFile}.json`, 'utf8'));
  return { bugReproduced: result.ok && escaped.ok, dir, requestId, outsideFile: `${escapeFile}.json`, writtenOutsideWorkspace: escaped.ok };
});

await run('character-metadata-only-protection-bypass', async () => {
  const doc = JSON.parse(await readFile(join(root, 'examples/studio/rustclaw.studio.json'), 'utf8'));
  doc.poses = [doc.poses.find(p => p.id === 'stand_fwd')];
  doc.clips = {};
  doc.constraints = [{ kind: 'metadata', target: 'attachments.head' }];
  const dir = await mkdtemp(join(output, 'character-metadata-'));
  const { store, compiled: base } = await StudioStore.create(dir, doc, opts);
  const c = await store.edit({ baseRevision: 'r1', operation: { id: 'art.set', target: 'head', value: ['.'.repeat(doc.art.head[0].length), ...doc.art.head] } });
  const record = JSON.parse(await readFile(join(dir,'candidates',`${c.candidateId}.json`),'utf8'));
  const { compileCharacterDocument } = await import(pathToFileURL(join(root,'src/studio/character-compiler.js')));
  const next = compileCharacterDocument(record.doc);
  const unchangedPixels = Buffer.from(base.asset.frames[0].rgba).equals(Buffer.from(next.asset.frames[0].rgba));
  const oldHeadPoint = base.asset.frames[0].attachments.head;
  const newHeadPoint = next.asset.frames[0].attachments.head;
  const committed = await attempt(() => store.commit({ action: 'accept', candidateId: c.candidateId, expectedHead: 'r1' }));
  return { bugReproduced: unchangedPixels && oldHeadPoint.y !== newHeadPoint.y && committed.ok, dir, candidateStatus: c.status, unchangedPixels, oldHeadPoint, newHeadPoint, reportedAffectedFrames: c.checks.affectedFrames, commit: committed };
});
await run('character-diff-counts-channels-not-pixels', async () => {
  const doc = JSON.parse(await readFile(join(root, 'examples/studio/rustclaw.studio.json'), 'utf8'));
  const { compileCharacterDocument, checkCharacterCandidate } = await import(pathToFileURL(join(root,'src/studio/character-compiler.js')));
  const { applyCharacterOperation } = await import(pathToFileURL(join(root,'src/studio/character-ops.js')));
  const base = compileCharacterDocument(doc);
  const applied = applyCharacterOperation(doc,{id:'palette.set',target:'V',value:'#ffd23d'});
  const candidate = compileCharacterDocument(applied.doc);
  const checks = checkCharacterCandidate({baseCompiled:base,candidateCompiled:candidate,plan:applied.plan,preserve:[]});
  let actualPixels = 0;
  for(let f=0;f<base.asset.frames.length;f++) {
    const a=base.asset.frames[f].rgba, b=candidate.asset.frames[f].rgba;
    for(let i=0;i<a.length;i+=4) if([0,1,2,3].some(c=>a[i+c]!==b[i+c]))actualPixels++;
  }
  return { bugReproduced: checks.totalDiffPixels !== actualPixels, reportedPixels:checks.totalDiffPixels, actualPixels };
});

await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2)+'\n');
for (const result of results) console.log(JSON.stringify(result));
console.log(`REPORT ${join(output,'results.json')}`);

// Nonzero exit means a reproduced defect or an unexpected setup error.
process.exitCode = results.some(r => r.bugReproduced || r.setupError) ? 1 : 0;
