import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJSON, tree } from '../shared/files.mjs';
import { evaluateFinal } from '../shared/state.mjs';
import { canonical, sha256, metrics } from '../shared/accounting.mjs';

// 使用 materialRoot 的可信 worker 和冻结 common 合同；不加载 trial 内的 evaluator。
export async function evaluateTrial({ trial, materialRoot, manifest, task, arm }) {
  try {
    const shared = join(materialRoot, manifest.shared.path);
    if (canonical(await tree(shared)) !== canonical({ files: manifest.shared.files, sha256: manifest.shared.sha256 })) throw new Error('TRUSTED_SHARED_CHANGED');
    const common = join(materialRoot, manifest.tasks[task].common.path), baseline = await readJSON(join(common, 'baseline.state.json'));
    if (canonical(await tree(common)) !== canonical({ files: manifest.tasks[task].common.files, sha256: manifest.tasks[task].common.sha256 })) throw new Error('TRUSTED_TASK_CHANGED');
    const contract = await readJSON(join(common, 'task-contract.json')), submitted = await readJSON(join(trial, 'final/submission.json'));
    const root = arm === 'A' ? join(trial, 'final') : trial, doc = arm === 'D14' ? join(trial, 'final/document.json') : null;
    if (arm === 'D14' && canonical(await tree(join(trial, 'kit'))) !== canonical({ files: manifest.toolkits.D14.files, sha256: manifest.toolkits.D14.sha256 })) throw new Error('FROZEN_KIT_CHANGED');
    const build = () => JSON.parse(execFileSync(process.execPath, [join(shared, 'render-worker.mjs'), root, arm, ...(doc ? [doc] : [])], { timeout: 30000, maxBuffer: 16 * 1024 * 1024 }).toString());
    const first = build(), second = build(), final = evaluateFinal(first, second, baseline, contract);
    const frozen = await readJSON(join(trial, 'final/state.json'));
    const { decodePNG } = await import(pathToFileURL(join(shared, 'src/export/png.js')));
    const png = decodePNG(await readFile(join(trial, 'final/candidate.png')));
    final.checks.submittedArtifact = canonical(frozen) === canonical(first) && png.width === first.frame.width && png.height === first.frame.height && canonical(Array.from(png.rgba)) === canonical(first.frame.rgba);
    if (!final.checks.submittedArtifact) final.status = 'FAIL';
    const sourceHash = arm === 'A' ? sha256(canonical({ asset: sha256(await readFile(join(root, 'asset.mjs'))), kit: await tree(join(root, 'kit/src')) })) : sha256(await readFile(doc));
    final.checks.sourceFrozen = sourceHash === submitted.sourceHash;
    if (!final.checks.sourceFrozen) final.status = 'FAIL';
    const ledger = await readJSON(join(trial, 'ledger.json'));
    return { submitSuccess: submitted.status === 'FINALIZED', technical: final, budget: ledger.candidates.length <= 8 ? 'PASS' : 'FAIL', protocol: 'UNVERIFIED', metrics: metrics(ledger) };
  } catch (e) { return { submitSuccess: false, technical: { status: 'FAIL', reason: e.message }, technicalFailureIncidence: true, protocol: 'UNVERIFIED' }; }
}
