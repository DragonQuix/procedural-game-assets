import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdtemp, rm, readdir, mkdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const base = resolve('tests/PGA_STUDIO_E2E_BENCHMARK_v0_3');
const materialRoot = resolve(process.env.PGA_E2E_MATERIALS ?? join(base, 'candidate-materials'));
// 发行载荷不包含私有实验包；SKIP 不冒充覆盖。
test('v0.3 benchmark infrastructure (synthetic only)', { skip: !existsSync(join(materialRoot, 'manifest.json')) }, async t => {
  const load = p => import(pathToFileURL(join(base, p)));
  const { prepareTrial, verifyTrial, launchParticipant } = await load('organizer/trials.mjs');
  const { plannedMatrix, compiledState } = await load('organizer/prepare-materials.mjs');
  const { materials } = await load('organizer/materials.mjs');
  const { controlDocument, controlOperations, directControlSource } = await load('organizer/controls.mjs');
  const { readJSON, json, tree } = await load('shared/files.mjs');
  const { canonical, sha256, accountCandidate, metrics } = await load('shared/accounting.mjs');
  const { evaluateFinal, compose } = await load('shared/state.mjs');
  const { evaluateTrial } = await load('organizer/evaluate.mjs');
  const { freezeModelIdentity, modelIdentityGate, imageEvidenceGate } = await load('organizer/gates.mjs');
  const { reviewTemplate, schemaErrors } = await load('organizer/review-schema.mjs');
  const { submitReviewDraft, collectReview } = await load('organizer/review-gate.mjs');
  const { buildBlind, deriveReview, launchReviewer } = await load('organizer/blind.mjs');
  const { candidateVisualStatus, taskSuccess, technicalFailureIncidence, pairedPreference, exactBinomialTwoSided, taskBreakdown } = await load('organizer/outcomes.mjs');
  const { assertIdentityMaterials } = await import('../../tools/benchmark/identity-lint.mjs');
  const { run, render } = await import(pathToFileURL(join(materialRoot, 'shared/runner.mjs')));
  const api = { ...await import(pathToFileURL(join(materialRoot, 'frozen/D14/src/studio/compiler.js'))), ...await import(pathToFileURL(join(materialRoot, 'frozen/D14/src/studio/dispatch.js'))) };
  const manifest = await readJSON(join(materialRoot, 'manifest.json')), specs = materials(api);
  const temp = await mkdtemp(join(tmpdir(), 'pga-e2e-v03-'));
  const starts = {}, finals = {}, trials = {};
  try {
    await t.test('24 participants / 12 pairs / 24 independent reviewers planned; no formal data', async () => {
      const m = plannedMatrix(); assert.equal(m.runs.length, 24); assert.equal(m.pairs.length, 12); assert.equal(m.reviewers.length, 24);
      assert.equal(new Set(m.runs.map(r => r.runId)).size, 24);
      for (const p of m.pairs) assert.deepEqual(p.runs.map(id => m.runs.find(r => r.runId === id).arm).sort(), ['A', 'D14']);
      assert.ok(m.runs.every(r => r.status === 'PLANNED_NOT_CREATED' && r.context === null));
      assert.equal(manifest.modelIdentity, null); assert.equal(manifest.host, null);
      for (const root of [base, materialRoot]) for (const dir of ['runs', 'reviews', 'results', 'execution-freeze.json']) assert.equal(existsSync(join(root, dir)), false);
      assert.equal(manifest.participantRuns + manifest.reviews + manifest.scoredModelCalls, 0);
      assert.equal(await readJSON(join(materialRoot, 'frozen/D14/package.json')).then(x => x.version), '0.8.0');
      assert.equal(existsSync(join(materialRoot, 'frozen/A/src/studio')), false);
      assert.match(await readFile(resolve('tools/release.mjs'), 'utf8'), /PGA_STUDIO_E2E_BENCHMARK_/);
      for (const p of ['src/core/raster.js', 'src/recipes/machine.js', 'src/recipes/prop.js']) assert.equal(existsSync(join(materialRoot, 'frozen/A', p)), true);
    });
    for (const task of ['H', 'K', 'M', 'S']) {
      await t.test(`${task}: equal actual starts, observation byte parity, one evaluator, two distinct feasible solutions`, async () => {
        starts[task] = {}; finals[task] = {}; trials[task] = {};
        for (const arm of ['A', 'D14']) {
          const out = join(temp, `${task}-${arm}`), runId = `${task}-${arm}-r1`;
          const gate = await prepareTrial({ out, materialRoot, manifest, runId }); assert.equal(gate.status, 'PASS');
          const trial = join(out, 'staged'); trials[task][arm] = trial;
          starts[task][arm] = render(trial, arm);
          assert.deepEqual(starts[task][arm], await readJSON(join(trial, 'task/baseline.state.json')));
          const result = await run(trial, ['observe']); assert.equal(result.candidateCount, 0);
          const files = await tree(trial);
          assert.ok(!Object.keys(files.files).some(p => /reviewer|control|results|mapping|key\.json/i.test(p)));
        }
        assert.deepEqual(starts[task].A, starts[task].D14);
        assert.deepEqual(await tree(join(trials[task].A, 'observations')), await tree(join(trials[task].D14, 'observations')));
        const solutionHashes = new Set();
        for (const variant of [0, 1]) {
          const doc = controlDocument(api, specs[task].D14, task, variant), d = compiledState(api, doc);
          await writeFile(join(trials[task].A, 'asset.mjs'), directControlSource(doc));
          const a = render(trials[task].A, 'A'); assert.deepEqual(a, d);
          const first = evaluateFinal(a, a, starts[task].A, specs[task].contract), second = evaluateFinal(d, d, starts[task].D14, specs[task].contract);
          assert.deepEqual(first, second); assert.equal(first.status, 'PASS', JSON.stringify(first));
          solutionHashes.add(first.finalHash); if (variant === 0) finals[task] = { A: a, D14: d };
        }
        assert.equal(solutionHashes.size, 2);
        assert.equal(evaluateFinal(starts[task].A, starts[task].A, starts[task].A, specs[task].contract).status, 'FAIL');
      });
    }
    await t.test('actual D14 CLI edits/commits and A direct source both finalize; independent re-render detects tampering', async () => {
      const beforeReject = await readJSON(join(trials.H.D14, 'ledger.json'));
      const rejected = await run(trials.H.D14, ['studio', 'edit', '--base', 'r1', '--op', 'geometry.set', '--target', 'node.body', '--params', '{"w":1000}', '--request-id', 'rejected-before-render']);
      assert.equal(rejected.result.status, 'REJECTED_UNSAFE');
      assert.equal(rejected.result.renderedCandidates, 0);
      assert.equal((await readJSON(join(trials.H.D14, 'ledger.json'))).candidates.length, beforeReject.candidates.length);
      for (const task of ['H', 'K', 'M', 'S']) {
        const doc = controlDocument(api, specs[task].D14, task);
        await writeFile(join(trials[task].A, 'asset.mjs'), directControlSource(doc));
        let head = 'r1';
        for (const [i, op] of controlOperations(task).entries()) {
          const args = ['studio', 'edit', '--base', head, '--op', op.id, '--target', op.target, '--request-id', `selftest-${i}`];
          if (op.id === 'material.set') args.push('--material', op.material);
          else if (op.id === 'ramp.set') args.push('--ramp', typeof op.ramp === 'string' ? op.ramp : JSON.stringify(op.ramp));
          else args.push('--params', JSON.stringify(op.params));
          if (op.preserveRelations) args.push('--preserve-relations', 'true');
          const result = await run(trials[task].D14, args);
          assert.equal(result.ok, true, JSON.stringify(result)); assert.ok(['OK', 'UNCHANGED'].includes(result.result.status), JSON.stringify(result));
          const commit = await run(trials[task].D14, ['studio', 'commit', '--accept', result.result.candidateId, '--expected-head', head, '--request-id', `commit-${i}`]);
          assert.equal(commit.ok, true, JSON.stringify(commit)); head = commit.result.revision;
        }
        for (const arm of ['A', 'D14']) {
          const submitted = await run(trials[task][arm], ['submit']); assert.equal(submitted.submitSuccess, true); assert.equal(submitted.technical.status, 'PASS'); assert.equal(submitted.budget, 'PASS');
          const independent = await evaluateTrial({ trial: trials[task][arm], materialRoot, manifest, task, arm });
          assert.equal(independent.technical.status, 'PASS', JSON.stringify(independent));
          await assert.rejects(() => run(trials[task][arm], ['submit']), /FINAL_ALREADY_FROZEN/);
        }
      }
      const trial = trials.H.A, state = await readJSON(join(trial, 'final/state.json')); state.frame.rgba[0] = 42;
      await json(join(trial, 'final/state.json'), state);
      assert.equal((await evaluateTrial({ trial, materialRoot, manifest, task: 'H', arm: 'A' })).technical.status, 'FAIL');
    });
    await t.test('candidate counting is render + semantic state; probes/saves not candidates; materialized ninth fails budget', () => {
      const a = { candidates: [], events: [{ validationProbeCount: 100 }] }, d = structuredClone(a);
      for (const l of [a, d]) {
        assert.equal(metrics(l).candidateCount, 0);
        assert.equal(accountCandidate(l, finals.H.A, 'source-1').added, true);
        assert.equal(accountCandidate(l, finals.H.A, 'source-comments-only').added, false);
        const hidden = structuredClone(finals.H.A); hidden.layers[0].rgba[0] = 1;
        assert.equal(accountCandidate(l, hidden, 'hidden-state').added, true);
        for (let i = 0; i < 7; i++) { const s = structuredClone(finals.H.A); s.frame.rgba[0] = i + 10; accountCandidate(l, s, `v${i}`); }
        assert.equal(metrics(l).candidateCount, 9);
        assert.equal(metrics(l).probeInterpretation, 'DIAGNOSTIC_ONLY');
        assert.equal(metrics(l).manualCoordinateRepairCount.comparability, 'NOT_COMPARABLE');
        assert.ok(!Object.keys(metrics(l)).some(k => k === 'relationEvaluation' + 'ProbeCount'));
      }
      assert.deepEqual(a, d);
    });
    await t.test('actual A source saves do not count; nine observable images persist and final budget fails', async () => {
      const out = join(temp, 'budget-nine'); await prepareTrial({ out, materialRoot, manifest, runId: 'H-A-r3' });
      const trial = join(out, 'staged'), source = directControlSource(controlDocument(api, specs.H.D14, 'H'));
      for (let i = 0; i < 9; i++) {
        await writeFile(join(trial, 'asset.mjs'), source.replace('#ba7951', `#${(187 + i).toString(16)}7951`));
        assert.equal((await readJSON(join(trial, 'ledger.json'))).candidates.length, i);
        const observed = await run(trial, ['observe']); assert.equal(observed.candidateCount, i + 1);
      }
      const final = await run(trial, ['submit']); assert.equal(final.budget, 'FAIL'); assert.equal(final.metrics.candidateCount, 9);
      assert.equal((await readdir(join(trial, 'candidates'))).length, 9);
    });
    await t.test('hard protection / relation / ownership / determinism negative controls', () => {
      const recompose = s => compose({ ...s.frame, layers: s.layers });
      const broken = structuredClone(finals.K.A); broken.layers.find(l => l.id === 'node.foot').rgba[(55 * 80 + 10) * 4] = 1;
      const protectedMutation = recompose(broken);
      assert.equal(evaluateFinal(protectedMutation, protectedMutation, starts.K.A, specs.K.contract).checks.protection, false);
      const gap = structuredClone(finals.K.A), p = gap.layers.find(l => l.id === 'node.outlet');
      const old = [...p.rgba]; p.rgba.fill(0);
      for (let y = 0; y < p.height; y++) for (let x = 1; x < p.width; x++) for (let k = 0; k < 4; k++) p.rgba[(y * p.width + x) * 4 + k] = old[(y * p.width + x - 1) * 4 + k];
      const gapState = recompose(gap);
      assert.equal(evaluateFinal(gapState, gapState, starts.K.A, specs.K.contract).checks.requiredRelation, false);
      const ownership = structuredClone(finals.M.A), handle = ownership.layers.find(l => l.id === 'node.handle');
      handle.rgba.splice(4 * (26 * 68 + 26), 4, 56, 72, 82, 255);
      const outside = recompose(ownership);
      assert.equal(evaluateFinal(outside, outside, starts.M.A, specs.M.contract).checks.ownership, false);
      assert.equal(evaluateFinal(finals.M.A, starts.M.A, starts.M.A, specs.M.contract).checks.deterministic, false);
      assert.equal(evaluateFinal(null, null, starts.M.A, specs.M.contract).status, 'FAIL');
    });
    const actual = { model: 'synthetic-model', host: 'synthetic-host', version: null, reasoning: null, source: 'host-api', attestationId: 'synthetic-attestation' };
    const context = { sessionId: 'synthetic-session', modelContextId: 'synthetic-context' };
    const evidence = (images, ctx = context) => Object.entries(images).map(([view, hash]) => ({ source: 'host-transcript', kind: 'image-input', success: true, modelInput: true, view, sha256: hash, callId: `synthetic-${view}`, ...ctx }));
    await t.test('EXACT_REQUIRED mismatch rejects; FREEZE_ACTUAL freezes actual and rejects subsequent drift', () => {
      assert.throws(() => freezeModelIdentity({ policy: 'EXACT_REQUIRED', requestedModel: 'nominal-other', actual }), /MISMATCH/);
      const f = freezeModelIdentity({ policy: 'FREEZE_ACTUAL', requestedModel: 'nominal-other', actual });
      assert.equal(f.actual.model, actual.model); assert.equal(modelIdentityGate(f, actual).status, 'PASS');
      assert.equal(modelIdentityGate(f, { ...actual, model: 'changed' }).status, 'FAIL');
      assert.throws(() => freezeModelIdentity({ policy: 'FREEZE_ACTUAL', requestedModel: 'x', actual, executionStarted: true }));
      assert.equal(modelIdentityGate(null, actual).status, 'FAIL');
    });
    await t.test('payload-before-agent negative control, model gate, fresh context and task exposure ordering', async () => {
      const out = join(temp, 'launch-negative'); await prepareTrial({ out, materialRoot, manifest, runId: 'H-A-r2' });
      const hashes = Object.fromEntries(['vision_A.png', 'vision_B.png'].map(v => [v, manifest.vision.files[v]]));
      const execution = { status: 'FROZEN', approvedToExecute: true, manifestHash: sha256(canonical(manifest)), protocolSha256: manifest.protocolSha256,
        modelIdentity: freezeModelIdentity({ policy: 'EXACT_REQUIRED', requestedModel: actual.model, actual }), visionEvidence: { expectedImages: hashes, hostEvents: evidence(hashes), context, objectRecognitionVerified: true } };
      const calls = [], host = { getModelIdentity: async () => actual, createEmptyParticipant: async () => { calls.push('create'); return { ...context, actual }; }, exposeTask: async () => calls.push('expose') };
      const input = { out, manifest, execution, runId: 'H-A-r2', host, contextRegistry: new Set() };
      assert.equal((await launchParticipant({ ...input, execution: null })).status, 'LAUNCH_BLOCKED');
      const file = join(out, 'staged/kit/src/core/raster.js'), bytes = await readFile(file); await writeFile(file, Buffer.concat([bytes, Buffer.from('\n// corruption\n')]));
      const blocked = await launchParticipant(input); assert.equal(blocked.status, 'LAUNCH_BLOCKED'); assert.equal(blocked.taskExposed, false); assert.deepEqual(calls, []);
      await writeFile(file, bytes);
      for (const name of ['shared/observe.mjs', 'task/TASK.md', 'asset.mjs']) {
        const target = join(out, 'staged', name), original = await readFile(target);
        await writeFile(target, Buffer.concat([original, Buffer.from('\ncorruption\n')]));
        assert.equal((await launchParticipant(input)).status, 'LAUNCH_BLOCKED'); assert.deepEqual(calls, []);
        await writeFile(target, original);
      }
      const wrongHost = { ...host, getModelIdentity: async () => ({ ...actual, model: 'wrong' }) };
      assert.equal((await launchParticipant({ ...input, host: wrongHost })).status, 'LAUNCH_BLOCKED'); assert.deepEqual(calls, []);
      const result = await launchParticipant(input); assert.equal(result.status, 'PASS'); assert.deepEqual(calls, ['create', 'expose']);
      assert.equal((await launchParticipant(input)).status, 'LAUNCH_BLOCKED');
      assert.equal(imageEvidenceGate({ expectedImages: hashes, hostEvents: evidence(hashes).map(e => ({ ...e, modelInput: false })), context }).status, 'UNVERIFIED');
    });
    await t.test('reviewer pre-submit rejects invalid enums/shapes, same-context format feedback only, one immutable final', async () => {
      const directory = join(temp, 'schema-gate'), binding = { task: 'H', reviewerSlot: 1, reviewer: context };
      const draft = reviewTemplate('H', 1); draft.actualViews = [{ view: 'X.png' }]; draft.confidence = 'MODERATE'; draft.candidates.X.taskFit = 'NOT_APPLICABLE';
      assert.ok(schemaErrors(draft).length >= 3);
      const first = await submitReviewDraft({ directory, binding, author: context, draft }); assert.equal(first.status, 'SCHEMA_RETRY'); assert.equal(existsSync(join(directory, 'review.json')), false);
      assert.deepEqual(Object.keys(first.feedback), ['schemaErrors']); assert.ok(first.feedback.schemaErrors.every(e => Object.keys(e).sort().join(',') === 'expected,field'));
      await assert.rejects(() => submitReviewDraft({ directory, binding, author: { ...context, modelContextId: 'coordinator' }, draft: reviewTemplate('H', 1) }), /IDENTITY/);
      const valid = reviewTemplate('H', 1); valid.candidates.X.taskFit = 'NOT_YET';
      const final = await submitReviewDraft({ directory, binding, author: context, draft: valid }); assert.equal(final.reviewValidationAttempts, 2); assert.deepEqual(await readJSON(join(directory, 'review.json')), valid);
      await assert.rejects(() => submitReviewDraft({ directory, binding, author: context, draft: valid }), /ALREADY_FROZEN/);
      let calls = 0;
      const collected = await collectReview({ directory: join(temp, 'review-loop'), binding, requestDraft: async input => { assert.deepEqual(input.reviewer, context); calls++; if (calls === 2) assert.deepEqual(Object.keys(input.feedback), ['schemaErrors']); return calls === 1 ? draft : valid; } });
      assert.equal(collected.status, 'SUBMITTED'); assert.equal(calls, 2);
    });
    await t.test('stable X/Y mirrored packages; no mapping/key/toolkit/log/count leak; verified image evidence', async () => {
      const out = join(temp, 'blind'), taskText = await readFile(join(base, 'tasks/H.md'), 'utf8');
      const { key, packages } = await buildBlind({ out, task: 'H', repeat: 1, seed: 'synthetic', candidateA: { runId: 'H-A-r1', state: finals.H.A }, candidateB: { runId: 'H-D14-r1', state: starts.H.D14 }, baselinePNG: await readFile(join(materialRoot, 'materials/H/common/baseline.png')), taskText });
      assert.deepEqual(key.reviewers.map(r => r.presentationOrder), [['X', 'Y'], ['Y', 'X']]);
      for (const id of ['X', 'Y']) assert.deepEqual(await readFile(join(out, `reviewer-1/${id}.png`)), await readFile(join(out, `reviewer-2/${id}.png`)));
      assert.notDeepEqual(await readFile(join(out, 'reviewer-1/contact-sheet.png')), await readFile(join(out, 'reviewer-2/contact-sheet.png')));
      for (const slot of [1, 2]) {
        const files = await tree(join(out, `reviewer-${slot}`));
        assert.deepEqual(Object.keys(files.files).sort(), ['PROMPT.md', 'TASK.md', 'X.png', 'Y.png', 'baseline.png', 'contact-sheet.png', 'review.schema.json', 'review.template.json', 'shared/hashes.mjs', 'submit-review.mjs', 'validator/review-gate.mjs', 'validator/review-schema.mjs'].sort());
        assert.ok(!Object.keys(files.files).some(p => /key\.json|kit\/|technical|ledger|candidate-count|reviewer-\d/.test(p)));
        for (const file of ['PROMPT.md', 'TASK.md', 'review.template.json']) {
          const text = await readFile(join(out, `reviewer-${slot}`, file), 'utf8');
          assert.ok(!text.includes('H-A-r1') && !text.includes('H-D14-r1'));
          assertIdentityMaterials([{ text, file, kind: 'reviewer' }]);
        }
      }
      const review = reviewTemplate('H', 1), expectedImages = packages[0].expectedImages, hostEvents = evidence(expectedImages);
      review.actualViews = Object.keys(expectedImages); review.imageEvidence = hostEvents.map(({ view, sha256, callId, sessionId, modelContextId, modelInput }) => ({ view, sha256, callId, sessionId, modelContextId, modelInput }));
      const inputs = { review, key, expectedImages, hostEvents, context };
      assert.equal(deriveReview(inputs).evidence, 'CONFIRMED');
      assert.equal(deriveReview({ ...inputs, hostEvents: [] }).evidence, 'UNVERIFIED');
      review.imageEvidence[0].sha256 = '0'.repeat(64); assert.equal(deriveReview(inputs).evidence, 'UNVERIFIED');
      const visionImages = Object.fromEntries(['vision_A.png', 'vision_B.png'].map(v => [v, manifest.vision.files[v]]));
      const execution = { status: 'FROZEN', approvedToExecute: true,
        modelIdentity: freezeModelIdentity({ policy: 'FREEZE_ACTUAL', requestedModel: 'nominal-other', actual }),
        visionEvidence: { expectedImages: visionImages, hostEvents: evidence(visionImages), context, objectRecognitionVerified: true } };
      const calls = [], host = { getModelIdentity: async () => actual,
        createEmptyReviewer: async () => { calls.push('create'); return { ...context, modelContextId: 'synthetic-reviewer-new', actual }; }, exposeReview: async () => calls.push('expose') };
      const launch = { directory: join(out, 'reviewer-1'), descriptor: packages[0], execution, host, contextRegistry: new Set() };
      assert.equal((await launchReviewer({ ...launch, host: { ...host, getModelIdentity: async () => ({ ...actual, model: 'mismatch' }) } })).status, 'LAUNCH_BLOCKED');
      assert.deepEqual(calls, []); assert.equal((await launchReviewer(launch)).status, 'PASS'); assert.deepEqual(calls, ['create', 'expose']);
    });
    await t.test('symbolic lint covers v0.3 task/prompt/schema and rejects spatial identity in both languages', async () => {
      const inputs = [];
      for (const task of ['H', 'K', 'M', 'S']) inputs.push({ text: await readFile(join(base, `tasks/${task}.md`), 'utf8'), kind: 'task', file: task });
      for (const name of ['participant', 'reviewer', 'vision']) inputs.push({ text: await readFile(join(base, `prompts/${name}.md`), 'utf8'), kind: name, file: name });
      assertIdentityMaterials(inputs);
      for (const text of ['left candidate', 'right image', '左图', '右边那个', 'leftCandidate']) assert.throws(() => assertIdentityMaterials([{ text, kind: 'reviewer' }]));
    });
    await t.test('strict both-MEETS, raw disagreement, technical failures, exact predeclared statistics', () => {
      for (const [fits, status] of [[['MEETS', 'MEETS'], 'PASS'], [['MEETS', 'NOT_YET'], 'DISAGREEMENT'], [['NOT_YET', 'MEETS'], 'DISAGREEMENT'], [['NOT_YET', 'NOT_YET'], 'NOT_YET'], [['MEETS', 'UNVERIFIED'], 'UNVERIFIED']]) assert.equal(candidateVisualStatus(fits), status);
      const reviews = [1, 2].map(i => ({ reviewerSlot: i, context: { sessionId: `s${i}`, modelContextId: `m${i}` }, evidence: 'CONFIRMED', taskFitByRun: { a: 'MEETS', d: 'MEETS' }, preferredRun: 'd', pairwiseResult: 'Y_PREFERRED' }));
      const technical = evaluateFinal(finals.H.A, finals.H.A, starts.H.A, specs.H.contract);
      technical.checks.submittedArtifact = true; technical.checks.sourceFrozen = true;
      const input = { runId: 'd', submitSuccess: true, technical, budget: 'PASS', protocol: 'PASS', reviews };
      assert.equal(taskSuccess(input), 'PASS'); assert.equal(pairedPreference(reviews, { A: 'a', D14: 'd' }), 'CONSENSUS_D14');
      reviews[1].taskFitByRun.d = 'NOT_YET'; assert.equal(taskSuccess(input), 'VISUAL_DISAGREEMENT');
      reviews[1].preferredRun = 'a'; assert.equal(pairedPreference(reviews, { A: 'a', D14: 'd' }), 'MIXED');
      assert.equal(technicalFailureIncidence({ submitSuccess: false }), true); assert.equal(technicalFailureIncidence({ toolBlocked: true }), true);
      assert.equal(exactBinomialTwoSided(4, 1), .375); assert.equal(exactBinomialTwoSided(0, 0), null);
      const pairs = plannedMatrix().pairs.map(p => ({ ...p, A: 'PASS', D14: 'PASS', preference: 'NO_MEANINGFUL_DIFFERENCE' }));
      const stats = taskBreakdown(pairs); assert.equal(stats.overall.matrix.bothPass, 12); assert.equal(stats.overall.exactMcNemar.p, null); assert.equal(stats.overall.consensusOnlySign.n, 0);
      assert.throws(() => taskBreakdown(pairs.slice(1)), /INCOMPLETE/);
    });
  } finally {
    assert.ok(resolve(temp).startsWith(resolve(tmpdir()) + sep) && temp.includes('pga-e2e-v03-'));
    await rm(temp, { recursive: true, force: true });
  }
});
