import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { symbolicContactSheet } from '../../src/observe/symbolic-sheet.js';
import { targetCrop, diffOverlay } from '../../src/observe/frame-views.js';

const kit = resolve('tests/PGA_RELATION_BENCHMARK_v0_2');
test('v0.2 host-only controls: true toolkit arms, feasible contracts and observation parity', { skip: !existsSync(join(kit, 'preparation-manifest.json')) }, async () => {
  const { materials } = await import(pathToFileURL(join(kit, 'organizer/materials.mjs')));
  const { evaluateFinal, taskSuccess, countEvents } = await import(pathToFileURL(join(kit, 'organizer/evaluate.mjs')));
  const manifest = JSON.parse(await readFile(join(kit, 'preparation-manifest.json'))), apis = {};
  assert.notEqual(manifest.toolkits.D13.sha256, manifest.toolkits.D14.sha256);
  for (const arm of ['D13', 'D14']) apis[arm] = await import(pathToFileURL(join(kit, manifest.toolkits[arm].path, 'src/studio/dispatch.js')));
  for (const spec of Object.values(materials())) {
    const finals = [], starts = [], observations = [];
    for (const arm of ['D13', 'D14']) {
      const api = apis[arm], base = api.compileAny(spec[arm]); let current = base;
      const operations = arm === 'D13' ? spec.control : [spec.semanticControl];
      for (const operation of operations) {
        const applied = api.applyAnyOperation(current.document, operation), next = api.compileAny(applied.doc);
        assert.ok(['OK', 'UNCHANGED'].includes(api.checkAnyCandidate({ baseCompiled: current, candidateCompiled: next, plan: applied.plan, preserve: api.preserveFromAnyDocument(current.document) }).status));
        current = next;
      }
      const result = evaluateFinal(current, api.compileAny(current.document), spec.taskContract, api.compileAny(spec.taskContract.protection.baseline));
      assert.equal(taskSuccess({ submitted: true, final: result, budget: 'PASS', protocol: 'PASS', visual: 'PASS' }), 'PASS');
      assert.equal(result.finalRequiredRelationViolationCount, 0); assert.equal(result.finalProtectionViolationCount, 0);
      starts.push(base.asset.frames[0].rgba); finals.push(current.asset.frames[0].rgba);
      const a = base.asset.frames[0], b = current.asset.frames[0];
      observations.push({ crop: targetCrop(b, { rect: base.sceneMap.nodes[0].frameRect }), diff: diffOverlay(a, b), sheet: symbolicContactSheet([{ label: 'A', frame: a }, { label: 'B', frame: b }]) });
    }
    assert.deepEqual(starts[0], starts[1]); assert.deepEqual(finals[0], finals[1]); assert.deepEqual(observations[0], observations[1]);
  }
  assert.deepEqual(countEvents([{ validationProbeCount: 5, relationEvaluationProbeCount: 2 }]).candidateCount, 0);
});
