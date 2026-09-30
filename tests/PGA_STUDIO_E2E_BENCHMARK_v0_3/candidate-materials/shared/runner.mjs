import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, cp, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJSON, json, tree } from './files.mjs';
import { canonical, sha256, renderHash, stateHash, accountCandidate, metrics } from './accounting.mjs';
import { evaluateFinal, bounds } from './state.mjs';
import { observe } from './observe.mjs';
import { encodePNG } from './src/export/png.js';

export function render(root, arm, docFile) {
  return JSON.parse(execFileSync(process.execPath, [join(root, 'shared/render-worker.mjs'), root, arm, ...(docFile ? [docFile] : [])], { cwd: root, timeout: 30000, maxBuffer: 16 * 1024 * 1024 }).toString());
}
async function sourceFingerprint(root, arm, docFile) {
  return arm === 'A' ? sha256(canonical({ asset: sha256(await readFile(join(root, 'asset.mjs'))), kit: await tree(join(root, 'kit/src')) })) : sha256(await readFile(docFile));
}
async function headDoc(root) {
  const { head } = await readJSON(join(root, 'ws/head.json'));
  const { doc } = await readJSON(join(root, `ws/revisions/${head}.json`));
  const file = join(root, 'scratch/head.json'); await json(file, doc); return file;
}
async function recordState(root, arm, ledger, baseline, state, docFile) {
  if (`${renderHash(state.frame)}:${stateHash(state)}` === `${renderHash(baseline.frame)}:${stateHash(baseline)}`) return { id: 'baseline' };
  const sourceHash = await sourceFingerprint(root, arm, docFile);
  const { entry, added } = accountCandidate(ledger, state, sourceHash);
  if (added) {
    const dir = join(root, 'candidates', entry.id); await mkdir(dir, { recursive: true });
    await json(join(dir, 'state.json'), state);
    if (arm === 'A') {
      await cp(join(root, 'asset.mjs'), join(dir, 'asset.mjs'));
      await cp(join(root, 'kit/src'), join(dir, 'kit/src'), { recursive: true });
    } else await cp(docFile, join(dir, 'document.json'));
  }
  return entry;
}

async function collectStudioCandidates(root, ledger, baseline) {
  const seen = new Set(ledger.studioRecords ?? []), requests = new Set(ledger.studioRequests ?? []);
  for (const name of (await readdir(join(root, 'ws/candidates'))).filter(f => f.endsWith('.json')).sort()) {
    if (seen.has(name)) continue;
    const c = await readJSON(join(root, 'ws/candidates', name));
    const materialized = Array.isArray(c.previews) ? c.previews.length > 0 : c.previews && Object.keys(c.previews).length > 0;
    if (materialized) {
      const file = join(root, 'scratch', name); await json(file, c.doc);
      await recordState(root, 'D14', ledger, baseline, render(root, 'D14', file), file);
    }
    const op = c.operation ?? {}, preserve = op.preserveRelations;
    ledger.events.push({ event: 'studio-candidate', candidateId: c.candidateId,
      semanticTransformCount: ['widen_about_center', 'squash_keep_base', 'resize_about_anchor'].includes(op.id) ? 1 : 0,
      relationAwareTransformCount: preserve === true || (Array.isArray(preserve) && preserve.length > 0) ? 1 : 0,
      validationProbeCount: c.validationProbeCount ?? 0 });
    seen.add(name);
  }
  for (const name of (await readdir(join(root, 'ws/requests'))).filter(f => f.endsWith('.json')).sort()) {
    if (requests.has(name)) continue;
    const r = await readJSON(join(root, 'ws/requests', name)), result = r.result ?? {};
    const rejected = !result.revision && !['OK', 'UNCHANGED'].includes(result.status);
    ledger.events.push({ event: 'studio-request', requestId: r.requestId, rejectedOperationCount: rejected ? 1 : 0,
      validationProbeCount: rejected ? result.validationProbeCount ?? result.validation?.tested ?? result.safeDomain?.validation?.tested ?? result.safeDomain?.search?.tested ?? 0 : 0 });
    requests.add(name);
  }
  ledger.studioRecords = [...seen]; ledger.studioRequests = [...requests];
}

export async function run(root = process.cwd(), args = process.argv.slice(2)) {
  root = resolve(root);
  const config = await readJSON(join(root, 'run-config.json')), arm = config.arm;
  const baseline = await readJSON(join(root, 'task/baseline.state.json')), contract = await readJSON(join(root, 'task/task-contract.json'));
  const ledgerFile = join(root, 'ledger.json'), ledger = await readJSON(ledgerFile);
  const lock = join(root, '.runner-lock'); await mkdir(lock);
  try {
    if (ledger.submitted) throw new Error('FINAL_ALREADY_FROZEN');
    const command = args[0];
    if (command === 'studio') {
      if (arm !== 'D14') throw new Error('STUDIO_NOT_AVAILABLE_IN_A');
      const cliArgs = args.slice(1);
      if (!['state', 'inspect', 'edit', 'explore', 'commit', 'export'].includes(cliArgs[0]) || cliArgs.includes('--ws') || cliArgs.includes('--doc')) throw new Error('INVALID_STUDIO_COMMAND');
      const result = spawnSync(process.execPath, [join(root, 'kit/bin/pga-studio.mjs'), ...cliArgs, '--ws', join(root, 'ws')], { cwd: root, timeout: 30000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' });
      let response; try { response = JSON.parse(result.stdout); } catch { response = { error: result.error?.message ?? result.stderr }; }
      ledger.events.push({ event: 'studio-call', command: cliArgs[0], response, errors: result.status === 0 ? 0 : 1,
        retries: response.idempotentReplay || response.result?.idempotentReplay ? 1 : 0,
        observableRelationDiagnosticCount: response.result?.relations || response.result?.relationInspection ? 1 : 0 });
      await collectStudioCandidates(root, ledger, baseline);
      await json(ledgerFile, ledger);
      return { ...response, candidateCount: ledger.candidates.length, budget: ledger.candidates.length <= 8 ? 'PASS' : 'FAIL' };
    }
    if (!['observe', 'submit'].includes(command)) throw new Error('USE_observe_OR_submit_OR_studio');
    if (arm === 'D14') await collectStudioCandidates(root, ledger, baseline);
    let docFile = arm === 'D14' ? await headDoc(root) : undefined;
    const at = args.indexOf('--candidate');
    if (at >= 0) {
      if (arm !== 'D14' || command !== 'observe' || !/^c-[a-f0-9]+$/.test(args[at + 1])) throw new Error('INVALID_CANDIDATE');
      const c = await readJSON(join(root, 'ws/candidates', `${args[at + 1]}.json`));
      docFile = join(root, 'scratch/observe.json'); await json(docFile, c.doc);
    }
    const state = render(root, arm, docFile);
    const entry = await recordState(root, arm, ledger, baseline, state, docFile);
    // 先入账再导出视觉材料；超过预算也不删除已经物化的候选。
    await json(ledgerFile, ledger);
    let crop = contract.crop;
    const nodeAt = args.indexOf('--node');
    if (nodeAt >= 0) { const layer = state.layers.find(l => l.id === args[nodeAt + 1]); if (!layer || !(crop = bounds(layer))) throw new Error('UNKNOWN_NODE'); }
    const views = await observe(join(root, 'observations', entry.id), baseline.frame, state.frame, crop);
    if (command === 'observe') return { status: 'OBSERVED', candidateId: entry.id, views, candidateCount: ledger.candidates.length, budget: ledger.candidates.length <= 8 ? 'PASS' : 'FAIL' };
    const second = render(root, arm, docFile), technical = evaluateFinal(state, second, baseline, contract);
    const finalDir = join(root, 'final'); await mkdir(finalDir);
    await json(join(finalDir, 'state.json'), state);
    await writeFile(join(finalDir, 'candidate.png'), encodePNG(state.frame.width, state.frame.height, Uint8ClampedArray.from(state.frame.rgba)));
    if (arm === 'A') {
      await cp(join(root, 'asset.mjs'), join(finalDir, 'asset.mjs'));
      await cp(join(root, 'kit'), join(finalDir, 'kit'), { recursive: true });
    } else await cp(docFile, join(finalDir, 'document.json'));
    ledger.submitted = true;
    const result = { status: 'FINALIZED', submitSuccess: true, candidateId: entry.id, technical,
      budget: ledger.candidates.length <= 8 ? 'PASS' : 'FAIL', protocol: 'UNVERIFIED', sourceHash: await sourceFingerprint(root, arm, docFile), metrics: metrics(ledger) };
    await json(join(finalDir, 'submission.json'), result, true); await json(ledgerFile, ledger); return result;
  } catch (e) {
    ledger.events.push({ event: 'runner-error', errors: 1, message: e.message }); await json(ledgerFile, ledger); throw e;
  } finally { await rmdir(lock); }
}
