#!/usr/bin/env node
/** 12 个正式 run 的机械评估：两臂同一 evaluator；各臂 kit 编译自身提交文档。 */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { hashTree, treeHash, sha256 } from '../../../tools/benchmark/payload-gate.mjs';
import { evaluateFinal } from './evaluate.mjs';
import { classifyTrialEvents, countTrialEvents } from './classify-events.mjs';

const bench = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const protocol = JSON.parse(await readFile(join(bench, 'protocol-frozen.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(bench, 'preparation-manifest.json'), 'utf8'));
await mkdir(join(bench, 'results', 'evaluate'), { recursive: true });

const summary = [];
for (const runId of protocol.runOrder) {
  const [task, arm, rep] = runId.split('-');
  const staged = join(bench, 'runs', runId, 'trial', 'staged');
  const kitPath = join(staged, 'kit', 'src', 'studio', 'compiler.js');
  const kit = await import(pathToFileURL(kitPath).href);
  const contract = JSON.parse(await readFile(join(staged, 'task', 'task-contract.json'), 'utf8'));

  // 提交文档：submit/ 下唯一 .studio.json
  const submitFiles = (await readdir(join(staged, 'submit'))).filter((f) => f.endsWith('.studio.json'));
  const submitDoc = JSON.parse(await readFile(join(staged, 'submit', submitFiles[0]), 'utf8'));

  // 各臂真实编译 + 确定性重编译
  const compiled = kit.compileStudioDocument(submitDoc);
  const repeated = kit.compileStudioDocument(JSON.parse(JSON.stringify(submitDoc)));
  const protectionBaseline = kit.compileStudioDocument(JSON.parse(JSON.stringify(contract.protection.baseline)));
  const final = evaluateFinal(compiled, repeated, contract, protectionBaseline);

  // 提交可重放：submit 文档与 head 修订文档一致
  const head = JSON.parse(await readFile(join(staged, 'ws', 'head.json'), 'utf8'));
  const headRev = JSON.parse(await readFile(join(staged, 'ws', 'revisions', `${head.head}.json`), 'utf8'));
  const submitMatchesHead = JSON.stringify(submitDoc) === JSON.stringify(headRev.doc);

  // 台账分类 + 预算
  const { events } = await classifyTrialEvents(staged);
  const counts = countTrialEvents(events);
  const budgetPass = counts.candidateCount <= 6;

  // 协议合规：kit/task/start 与冻结清单一致
  const kitHash = treeHash(await hashTree(join(staged, 'kit')));
  const taskHash = treeHash(await hashTree(join(staged, 'task')));
  const startHash = sha256(await readFile(join(staged, 'start.studio.json')));
  const kitOk = kitHash === manifest.toolkits[arm].sha256;
  const taskOk = taskHash === manifest.tasks[task].common.sha256;
  const startOk = startHash === manifest.tasks[task].documents[arm].sha256;
  const protocolPass = kitOk && taskOk && startOk;

  const record = { schema: 'pga-run-evaluation/1', runId, task, arm, repeat: Number(rep.slice(1)),
    submitted: submitFiles.length === 1, submitFile: submitFiles[0] ?? null, submitMatchesHead,
    mechanical: final.mechanical, deterministic: final.deterministic,
    protectionStatus: final.protection.status, relationsStatus: final.relations.status,
    finalRequiredRelationViolationCount: final.finalRequiredRelationViolationCount,
    finalProtectionViolationCount: final.finalProtectionViolationCount,
    counts, budgetPass, protocol: { kitOk, taskOk, startOk, pass: protocolPass },
    kitCompileVersion: compiled.document.schemaVersion,
    visual: 'PENDING_BLIND_REVIEW' };
  record.submitSuccess = record.submitted && record.submitMatchesHead && record.mechanical === 'PASS' && record.deterministic === 'PASS';
  await writeFile(join(bench, 'results', 'evaluate', `${runId}.json`), JSON.stringify(record, null, 2) + '\n');
  summary.push({ runId, submitSuccess: record.submitSuccess, mechanical: record.mechanical, det: record.deterministic,
    prot: record.protectionStatus, rel: record.relationsStatus, relViol: record.finalRequiredRelationViolationCount,
    protViol: record.finalProtectionViolationCount, candidates: counts.candidateCount, manualRepairs: counts.manualCoordinateRepairCount,
    budget: budgetPass, protocol: protocolPass });
}
console.log(JSON.stringify(summary, null, 2));
