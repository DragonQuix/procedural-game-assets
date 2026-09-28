import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { check, fileHashes, makePair, reveal, seal, snapshot, validateCharter } from '../../tools/asset-loop.mjs';

const json = (path, data) => writeFile(path, JSON.stringify(data, null, 2) + '\n');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const charter = () => ({
  protocol: 'pga-loop/1', approval: '合成测试授权，不代表真实用户确认', intent: '合成测试资产',
  captureProfile: { nativeSize: [2, 2], displaySize: [2, 2], background: 'transparent', seed: 7,
    sampling: 'static', command: 'fixture' },
  comparisons: [{ id: 'hero', reference: 'ref.png', candidate: 'render.png' }],
  requiredCritics: ['visual', 'delivery'], requiredGates: ['determinism'],
  pillars: [
    { id: 'shape', critic: 'visual', minimum: 9, criterion: '测试视觉支柱' },
    { id: 'use', critic: 'delivery', minimum: 9, criterion: '测试交付支柱' },
  ],
});

async function temp(t) {
  const root = await mkdtemp(join(tmpdir(), 'pga-loop-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return root;
}

function png(value, width = 2) {
  const p = new PNG({ width, height: 2 });
  p.data.fill(value);
  return PNG.sync.write(p);
}

async function fixture(t) {
  const root = await temp(t);
  const artifacts = join(root, 'artifacts');
  const evidence = join(root, 'evidence');
  await mkdir(artifacts); await mkdir(evidence);
  await writeFile(join(artifacts, 'recipe.js'), 'export const seed = 7;\n');
  await writeFile(join(evidence, 'ref.png'), png(255));
  await writeFile(join(evidence, 'render.png'), png(160));
  await json(join(evidence, 'gates.json'), { checks: [{ id: 'determinism', status: 'pass', evidence: ['candidate:render.png'] }] });
  await json(join(root, 'charter.json'), charter());
  const recordFile = join(root, 'record.json');
  const record = await snapshot(artifacts, evidence, join(root, 'charter.json'), recordFile);
  record.participants = { orchestrator: 'test-controller', builders: ['test-builder'] };
  for (let i = 0; i < 2; i++) {
    const reviewId = `test-review-${i}`;
    const contextId = `test-visual-${i}`;
    const directory = `pair-${i}`;
    const pairRoot = join(root, directory);
    const packet = await makePair(join(evidence, 'ref.png'), join(evidence, 'render.png'), pairRoot);
    const reportFile = join(root, `phase1-${i}.json`);
    await json(reportFile, { packetId: packet.packetId, contextId, preference: 'A', reason: '合成测试',
      differences: ['测试差异'], sourceGuess: 'unknown', confidence: 0.5 });
    const sealed = await seal(pairRoot, reportFile);
    await reveal(pairRoot);
    const reviewRoot = join(root, `review-${i}`);
    await mkdir(reviewRoot);
    await json(join(reviewRoot, 'dispatch.json'), { synthetic: true, note: '只测试记录结构，不证明实际派发' });
    record.batches.push({ reviewId, candidateId: record.candidateId, kind: 'formal',
      evidenceRoot: `review-${i}`, evidenceFiles: await fileHashes(reviewRoot),
      isolation: { mode: 'instruction', status: 'recorded', evidence: ['review:dispatch.json'] },
      blind: [{ id: 'hero', directory, reference: 'ref.png', candidate: 'render.png', phase1Hash: sealed.reportHash }],
      reports: ['visual', 'delivery'].map((criticId) => ({
        reviewId, candidateId: record.candidateId, criticId, contextId: `test-${criticId}-${i}`,
        verdict: 'WOW', pillars: [{ id: criticId === 'visual' ? 'shape' : 'use', score: 9.5,
          evidence: ['candidate:render.png'] }], defects: [],
      })),
    });
  }
  await json(recordFile, record);
  return { root, record, recordFile };
}

test('盲比：同尺寸 PNG、匿名材料、逐像素保留且映射不进入 blind', async (t) => {
  const root = await temp(t);
  const ref = join(root, '参考 图.png'), candidate = join(root, '成品.png'), output = join(root, 'pair');
  await writeFile(ref, png(255)); await writeFile(candidate, png(120));
  const packet = await makePair(ref, candidate, output);
  const mapping = await readJson(join(output, 'private/mapping.json'));
  assert.deepEqual(Object.keys(packet).sort(), ['image', 'packetId', 'sha256']);
  const sheet = PNG.sync.read(await readFile(join(output, 'blind/comparison.png')));
  assert.equal(sheet.width, 4); assert.equal(sheet.height, 2);
  const sourceOffset = mapping.referenceSide === 'A' ? 0 : 8;
  const candidateOffset = mapping.referenceSide === 'A' ? 8 : 0;
  assert.equal(sheet.data[sourceOffset], 255); assert.equal(sheet.data[candidateOffset], 120);
  assert.equal(sheet.data[sourceOffset + 16], 255);
  assert.doesNotMatch(await readFile(join(output, 'blind/packet.json'), 'utf8'), /reference|candidate|参考|成品/);
  await assert.rejects(makePair(ref, candidate, output), /EEXIST/);
  await assert.rejects(reveal(output), /ENOENT/);
  await writeFile(candidate, png(120, 3));
  await assert.rejects(makePair(ref, candidate, join(root, 'bad')), /同尺寸/);
});

test('封存与揭盲：禁止先揭盲、覆盖封存和修改后的记录', async (t) => {
  const { root } = await fixture(t);
  const pair = join(root, 'pair-0');
  await assert.rejects(seal(pair, join(root, 'phase1-0.json')), /EEXIST/);
  await assert.rejects(reveal(pair), /EEXIST/);
  const report = await readJson(join(pair, 'private/phase1.json'));
  report.preference = 'B';
  await json(join(pair, 'private/phase1.json'), report);
  await assert.rejects(reveal(pair), /封存后被改动/);
});

test('合成双批次仅通过记录检查；无默认预算，不代表实际 WOW', async (t) => {
  const { record, recordFile } = await fixture(t);
  assert.deepEqual(record.budget, { maxRounds: null, maxMinutes: null, maxCost: null });
  const result = await check(recordFile);
  assert.equal(result.status, 'RECORDS_VALID');
  assert.equal(result.candidateId, record.candidateId);
  assert.equal(result.reviewIds.length, 2);
});

test('准出防误收：缺席位、旧候选、混批次、泄题、漏支柱、分数与重大缺陷均拒绝', async (t) => {
  const { record, recordFile } = await fixture(t);
  const cases = [
    ['只有一批', (r) => r.batches.pop()],
    ['重复批次', (r) => r.batches[1].reviewId = r.batches[0].reviewId],
    ['缺席位', (r) => r.batches[1].reports.pop()],
    ['旧候选', (r) => r.batches[1].candidateId = 'old'],
    ['错批次', (r) => r.batches[1].reports[0].reviewId = 'old'],
    ['复用上下文', (r) => r.batches[1].reports[1].contextId = r.batches[0].reports[1].contextId],
    ['builder 自审', (r) => r.batches[0].reports[1].contextId = 'test-builder'],
    ['缺材料约束记录', (r) => r.batches[0].isolation.status = 'missing'],
    ['材料污染', (r) => r.batches[0].isolation.status = 'contaminated'],
    ['仅诊断', (r) => r.batches[0].kind = 'diagnostic'],
    ['低分', (r) => r.batches[0].reports[0].pillars[0].score = 8],
    ['假高分', (r) => r.batches[0].reports[0].pillars[0].score = 11],
    ['漏支柱', (r) => r.batches[0].reports[0].pillars = []],
    ['不存在的证据', (r) => r.batches[0].reports[0].pillars[0].evidence = ['candidate:missing.png']],
    ['伪造通过', (r) => r.batches[0].reports[0].defects = [{ severity: 'MAJOR' }]],
    ['未达 WOW', (r) => r.batches[1].reports[0].verdict = 'NOT_YET'],
    ['没有盲比', (r) => r.batches[0].blind = []],
    ['对照非本候选', (r) => r.batches[0].blind[0].candidate = 'ref.png'],
    ['对照组错配', (r) => r.batches[0].blind[0].id = 'other'],
    ['盲比报告错配', (r) => r.batches[0].blind[0].phase1Hash = 'wrong'],
    ['用户暂停', (r) => r.status = 'paused_by_user'],
    ['用户取消', (r) => r.status = 'cancelled_by_user'],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const copy = structuredClone(record); mutate(copy); await json(recordFile, copy);
    await assert.rejects(check(recordFile));
  });
});

test('文件、宪章、采集与门禁不能靠重写成绩掩盖', async (t) => {
  const { root, recordFile } = await fixture(t);
  const recipe = join(root, 'artifacts/recipe.js');
  const original = await readFile(recipe);
  await writeFile(recipe, 'changed');
  await assert.rejects(check(recordFile), /artifact 冻结材料已改变/);
  await writeFile(recipe, original);
  const extras = join(root, 'artifacts/extra.txt');
  await writeFile(extras, 'extra');
  await assert.rejects(check(recordFile), /artifact 冻结材料已改变/);
  await rm(extras);
  await writeFile(join(root, 'review-0/dispatch.json'), 'changed');
  await assert.rejects(check(recordFile), /批次证据已改变/);
  await json(join(root, 'charter.json'), { ...charter(), approval: 'changed' });
  await assert.rejects(check(recordFile), /宪章已改变/);
  const c = charter(); c.captureProfile.nativeSize = null;
  assert.throws(() => validateCharter(c), /尺寸未确定/);
  const c2 = charter(); c2.comparisons[0].reference = '../secret.png';
  assert.throws(() => validateCharter(c2), /根内相对路径/);
});

test('snapshot 拒绝覆盖以及把记录写进冻结目录', async (t) => {
  const { root, recordFile } = await fixture(t);
  const args = [join(root, 'artifacts'), join(root, 'evidence'), join(root, 'charter.json')];
  await assert.rejects(snapshot(...args, recordFile), /EEXIST/);
  await assert.rejects(snapshot(...args, join(root, 'artifacts/record.json')), /目录之外/);
});

test('真实门禁失败：即使重建合法快照与两批 WOW 记录也不能准出', async (t) => {
  const { root, record } = await fixture(t);
  await json(join(root, 'evidence/gates.json'), {
    checks: [{ id: 'determinism', status: 'fail', evidence: ['candidate:render.png'] }],
  });
  const newFile = join(root, 'failed-record.json');
  const next = await snapshot(join(root, 'artifacts'), join(root, 'evidence'), join(root, 'charter.json'), newFile);
  assert.notEqual(next.candidateId, record.candidateId);
  next.participants = record.participants;
  next.batches = record.batches;
  for (const batch of next.batches) {
    batch.candidateId = next.candidateId;
    for (const report of batch.reports) report.candidateId = next.candidateId;
  }
  await json(newFile, next);
  await assert.rejects(check(newFile), /硬门禁未通过/);
});

test('复验失败后不能从较早历史挑两批通过；来源映射改动使封存无效', async (t) => {
  const { root, record, recordFile } = await fixture(t);
  const failed = structuredClone(record.batches[1]);
  failed.reviewId = 'test-failed';
  for (const report of failed.reports) {
    report.reviewId = failed.reviewId;
    report.contextId = `new-${report.contextId}`;
    report.verdict = 'NOT_YET';
  }
  record.batches.push(failed);
  await json(recordFile, record);
  await assert.rejects(check(recordFile));
  const path = join(root, 'pair-0/private/mapping.json');
  const mapping = await readJson(path);
  mapping.referenceSide = mapping.referenceSide === 'A' ? 'B' : 'A';
  await json(path, mapping);
  await assert.rejects(reveal(join(root, 'pair-0')), /封存后被改动/);
});
