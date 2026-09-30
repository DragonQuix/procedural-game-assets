// v0.3 ZCode 协调器驱动（host adapter 的会话侧记录器）。
// launchParticipant 的 host 方法由 ZCode 会话执行：prep → spawn 空上下文 → register → recheck → expose。
// 本脚本只调用冻结 harness 的真实函数并记录证据，不改变 benchmark 语义。
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const repo = resolve(process.argv[2] ?? '.');
const bench = join(repo, 'tests/PGA_STUDIO_E2E_BENCHMARK_v0_3');
const runsRoot = join(bench, 'runs');
const coordDir = join(bench, 'results/coordinator');
const stateFile = join(coordDir, 'host-state.json');
const sha256 = b => createHash('sha256').update(b).digest('hex');
const { verifyTrial, prepareTrial } = await import(pathToFileURL(join(bench, 'organizer/trials.mjs')));

const readState = async () => JSON.parse(await readFile(stateFile, 'utf8').catch(() => JSON.stringify({ contextRegistry: [], runs: {} })));
const writeState = async s => writeFile(stateFile, JSON.stringify(s, null, 2) + '\n');
const logEvent = async event => appendFile(join(coordDir, 'host-events.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');

const [cmd, runId, arg3, arg4] = process.argv.slice(3);
const manifest = JSON.parse(await readFile(join(bench, 'candidate-materials/manifest.json'), 'utf8'));
const frozen = JSON.parse(await readFile(join(bench, 'results/protocol-frozen.json'), 'utf8'));

if (cmd === 'prep') {
  const out = join(runsRoot, runId);
  await prepareTrial({ out, materialRoot: join(bench, 'candidate-materials'), manifest, runId });
  const verify = await verifyTrial({ out, manifest, runId });
  await logEvent({ event: 'trial-prepared', runId, verify });
  console.log(JSON.stringify(verify));
} else if (cmd === 'recheck') {
  const verify = await verifyTrial({ out: join(runsRoot, runId), manifest, runId });
  await logEvent({ event: 'recheck-before-expose', runId, verify });
  console.log(JSON.stringify(verify));
} else if (cmd === 'register-context') {
  const state = await readState(), agentId = arg3, sessionId = arg4;
  if (!agentId || state.contextRegistry.includes(agentId)) { console.log(JSON.stringify({ status: 'CONTEXT_REJECTED', reason: 'MISSING_OR_DUPLICATE_CONTEXT' })); process.exit(1); }
  state.contextRegistry.push(agentId);
  state.runs[runId] = { ...(state.runs[runId] ?? {}), modelContextId: agentId, sessionId };
  await writeState(state);
  await logEvent({ event: 'empty-participant-created', runId, modelContextId: agentId, sessionId, attestation: frozen.modelIdentity.evidence.attestationId });
  console.log(JSON.stringify({ status: 'REGISTERED', runId, modelContextId: agentId }));
} else if (cmd === 'expose-record') {
  const state = await readState();
  state.runs[runId] = { ...(state.runs[runId] ?? {}), taskExposedAt: new Date().toISOString(), promptSha256: arg3, launchAgent: arg4 };
  await writeState(state);
  await logEvent({ event: 'task-exposed', runId, promptSha256: arg3, modelContextId: arg4 });
  console.log(JSON.stringify({ status: 'EXPOSED_RECORDED', runId }));
} else if (cmd === 'finish') {
  const trial = join(runsRoot, runId);
  const submission = JSON.parse(await readFile(join(trial, 'final/submission.json'), 'utf8').catch(() => 'null'));
  const ledger = JSON.parse(await readFile(join(trial, 'ledger.json'), 'utf8'));
  const summary = { runId, submitted: ledger.submitted === true, candidateCount: ledger.candidates.length,
    budget: ledger.candidates.length <= 8 ? 'PASS' : 'FAIL',
    submitSuccess: submission?.submitSuccess === true, technicalStatus: submission?.technical?.status ?? null,
    finishedAt: new Date().toISOString() };
  const state = await readState();
  state.runs[runId] = { ...(state.runs[runId] ?? {}), participantFinished: summary };
  await writeState(state);
  await logEvent({ event: 'participant-finished', ...summary });
  console.log(JSON.stringify(summary));
} else if (cmd === 'status') {
  const state = await readState();
  console.log(JSON.stringify({ contexts: state.contextRegistry.length, runs: Object.fromEntries(Object.entries(state.runs).map(([k, v]) => [k, { exposed: !!v.taskExposedAt, finished: v.participantFinished?.submitted ?? false }])) }, null, 1));
} else { console.error('usage: coordinator.mjs <repo> prep|recheck|register-context|expose-record|finish|status ...'); process.exit(2); }
