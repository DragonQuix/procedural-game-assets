import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { check, fileHashes, makePair, reveal, seal, snapshot, validateCharter } from '../../tools/asset-loop.mjs';
import { check as checkLegacy } from '../../tools/legacy/asset-loop-v1.mjs';

const json = (path, data) => writeFile(path, JSON.stringify(data, null, 2) + '\n');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const charter = () => ({
  protocol: 'pga-loop/2', approval: '合成测试授权，不代表真实用户确认', intent: '合成测试资产',
  captureProfile: { nativeSize: [2, 2], displaySize: [2, 2], background: 'transparent', seed: 7,
    sampling: 'static', command: 'fixture' },
  visualPolicy: {
    goal: 'quality_parity', referenceProfile: { summary: '合成标杆依据', evidence: ['ref.png'], limitations: ['静态测试不证明动作'] },
    creativeFreedom: ['造型和配色允许原创'],
    designConstraints: [{ id: 'readable', criterion: '测试约束', scopeIds: ['hero'] }],
    scopes: [{ id: 'hero', kind: 'asset', criterion: '测试资产与显示范围', views: [
      { id: 'native', kind: 'native', path: 'native.png' }, { id: 'display', kind: 'display', path: 'render.png' },
    ] }],
  },
  comparisons: [{ id: 'hero', scopeId: 'hero', reference: 'ref.png', candidate: 'render.png' }],
  requiredCritics: ['visual', 'delivery'], requiredGates: ['determinism'],
  pillars: [
    ...['design', 'hierarchy', 'finish'].map((dimension) => ({ id: dimension, critic: 'visual', scopeId: 'hero',
      dimension, basis: 'reference', comparisonIds: ['hero'], criterion: '测试视觉支柱' })),
    { id: 'usability', critic: 'visual', scopeId: 'hero', dimension: 'usability', basis: 'requirement', criterion: '测试独立使用要求' },
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

const phase1 = (packetId, contextId) => ({ packetId, contextId, preference: 'A', reason: '合成偏好，不决定质量',
  differences: ['测试差异'], impressions: { A: '合成整体印象 A', B: '合成整体印象 B' },
  comparativeQuality: 'SAME_TIER', qualityRationale: '仅测试结构，不声称两张合成图实际同级' });

async function fixture(t, config = charter()) {
  const root = await temp(t);
  const artifacts = join(root, 'artifacts');
  const evidence = join(root, 'evidence');
  await mkdir(artifacts); await mkdir(evidence);
  await writeFile(join(artifacts, 'recipe.js'), 'export const seed = 7;\n');
  for (const path of new Set([...config.visualPolicy.referenceProfile.evidence,
    ...config.visualPolicy.scopes.flatMap((s) => s.views.map((v) => v.path))])) {
    await mkdir(dirname(join(evidence, path)), { recursive: true });
    await writeFile(join(evidence, path), path.endsWith('.png') ? png(path === 'ref.png' ? 255 : 160) : '合成媒体占位，仅测记录，不证明播放或审美');
  }
  await json(join(evidence, 'gates.json'), { checks: [{ id: 'determinism', status: 'pass', evidence: ['candidate:render.png'] }] });
  await json(join(root, 'charter.json'), config);
  const recordFile = join(root, 'record.json');
  const record = await snapshot(artifacts, evidence, join(root, 'charter.json'), recordFile);
  record.participants = { orchestrator: 'test-controller', builders: ['test-builder'] };
  for (let i = 0; i < 2; i++) {
    const reviewId = `test-review-${i}`;
    const contextId = `test-visual-${i}`;
    const blind = [];
    for (const [index, comparison] of config.comparisons.entries()) {
      const directory = index === 0 ? `pair-${i}` : `pair-${i}-${index}`;
      const pairRoot = join(root, directory);
      const packet = await makePair(join(evidence, comparison.reference), join(evidence, comparison.candidate), pairRoot);
      const reportFile = join(root, index === 0 ? `phase1-${i}.json` : `phase1-${i}-${index}.json`);
      await json(reportFile, phase1(packet.packetId, contextId));
      const sealed = await seal(pairRoot, reportFile);
      await reveal(pairRoot);
      blind.push({ id: comparison.id, directory, reference: comparison.reference, candidate: comparison.candidate, phase1Hash: sealed.reportHash });
    }
    const reviewRoot = join(root, `review-${i}`);
    await mkdir(reviewRoot);
    await json(join(reviewRoot, 'dispatch.json'), { synthetic: true, note: '只测试记录结构，不证明实际派发' });
    record.batches.push({ reviewId, candidateId: record.candidateId, kind: 'formal',
      evidenceRoot: `review-${i}`, evidenceFiles: await fileHashes(reviewRoot),
      isolation: { mode: 'instruction', status: 'recorded', evidence: ['review:dispatch.json'] },
      blind,
      reports: ['visual', 'delivery'].map((criticId) => ({
        reviewId, candidateId: record.candidateId, criticId, contextId: `test-${criticId}-${i}`,
        verdict: 'WOW', pillars: config.pillars.filter((p) => p.critic === criticId).map((p) => ({
          id: p.id, ...(criticId === 'delivery' ? { score: 9.5 } : p.basis === 'reference' ? { qualityRelation: 'ON_PAR' } : { status: 'PASS' }),
          rationale: '合成支柱判断', evidence: [...new Set(['candidate:ref.png', ...config.visualPolicy.scopes
            .flatMap((s) => s.views.map((v) => `candidate:${v.path}`)), ...config.comparisons.map((c) => `candidate:${c.reference}`)])],
        })), defects: [],
        ...(criticId === 'visual' ? {
          holistic: { aestheticVerdict: 'WOW', qualityRelation: 'ON_PAR', rationale: '合成整体裁决',
            evidence: [...new Set([...config.visualPolicy.referenceProfile.evidence.map((path) => `candidate:${path}`),
              ...config.comparisons.flatMap((c) => [`candidate:${c.reference}`, `candidate:${c.candidate}`]),
              ...config.visualPolicy.scopes.flatMap((s) => s.views.map((v) => `candidate:${v.path}`))])] },
          blindReconciliation: '合成盲比和正式结论一致，不代表实际判断',
          coverage: config.visualPolicy.scopes.map((s) => ({ id: s.id, status: 'REVIEWED', rationale: '合成覆盖声明', evidence: s.views.map((v) => `candidate:${v.path}`) })),
          constraints: config.visualPolicy.designConstraints.map((c) => ({ id: c.id, status: 'PASS', rationale: '合成约束核查',
            evidence: config.visualPolicy.scopes.filter((s) => c.scopeIds.includes(s.id)).flatMap((s) => s.views.map((v) => `candidate:${v.path}`)) })),
        } : {}),
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
  assert.equal(result.protocol, 'pga-loop/2');
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
    ['交付低分', (r) => r.batches[0].reports[1].pillars[0].score = 8],
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
    ['缺整体裁决', (r) => delete r.batches[0].reports[0].holistic],
    ['整体审美未过', (r) => r.batches[0].reports[0].holistic.aestheticVerdict = 'NOT_YET'],
    ['整体低一档', (r) => r.batches[0].reports[0].holistic.qualityRelation = 'BELOW'],
    ['整体不可比', (r) => r.batches[0].reports[0].holistic.qualityRelation = 'NOT_COMPARABLE'],
    ['整体缺依据', (r) => r.batches[0].reports[0].holistic.rationale = ''],
    ['整体漏参考', (r) => r.batches[0].reports[0].holistic.evidence = ['candidate:render.png']],
    ['缺盲比核对', (r) => delete r.batches[0].reports[0].blindReconciliation],
    ['缺覆盖', (r) => r.batches[0].reports[0].coverage = []],
    ['重复覆盖', (r) => r.batches[0].reports[0].coverage.push(r.batches[0].reports[0].coverage[0])],
    ['未知范围', (r) => r.batches[0].reports[0].coverage[0].id = 'other'],
    ['范围未看', (r) => r.batches[0].reports[0].coverage[0].status = 'UNVERIFIED'],
    ['漏原生图', (r) => r.batches[0].reports[0].coverage[0].evidence = ['candidate:render.png']],
    ['缺约束', (r) => r.batches[0].reports[0].constraints = []],
    ['约束未通过', (r) => r.batches[0].reports[0].constraints[0].status = 'NOT_YET'],
    ['空约束依据', (r) => r.batches[0].reports[0].constraints[0].rationale = ''],
    ['约束只引参考', (r) => r.batches[0].reports[0].constraints[0].evidence = ['candidate:ref.png']],
    ['支柱高分但低档', (r) => Object.assign(r.batches[0].reports[0].pillars[0], { score: 10, qualityRelation: 'BELOW' })],
    ['支柱缺等级', (r) => delete r.batches[0].reports[0].pillars[0].qualityRelation],
    ['支柱缺依据', (r) => r.batches[0].reports[0].pillars[0].rationale = ''],
    ['支柱漏参考', (r) => r.batches[0].reports[0].pillars[0].evidence = ['candidate:render.png']],
    ['参考支柱混用独立结论', (r) => r.batches[0].reports[0].pillars[0].status = 'PASS'],
    ['独立要求未通过', (r) => r.batches[0].reports[0].pillars.find((p) => p.id === 'usability').status = 'NOT_YET'],
    ['独立要求冒充同级', (r) => r.batches[0].reports[0].pillars.find((p) => p.id === 'usability').qualityRelation = 'ON_PAR'],
    ['轻微缺陷无非阻塞依据', (r) => r.batches[0].reports[0].defects = [{ id: 'minor', severity: 'MINOR', criterion: 'design', expected: 'x', actual: 'y', recheck: 'z', evidence: ['candidate:render.png'] }]],
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

test('宪章：同级目标、基础维度、明确约束和类型证据不可省略', async (t) => {
  const cases = [
    ['旧协议', (c) => c.protocol = 'pga-loop/1'],
    ['没有视觉策略', (c) => delete c.visualPolicy],
    ['复制目标', (c) => c.visualPolicy.goal = 'replicate'],
    ['无质量依据', (c) => c.visualPolicy.referenceProfile.summary = ''],
    ['漏参考边界', (c) => delete c.visualPolicy.referenceProfile.limitations],
    ['无原创空间', (c) => c.visualPolicy.creativeFreedom = []],
    ['约束未知范围', (c) => c.visualPolicy.designConstraints[0].scopeIds = ['unknown']],
    ['参考未登记', (c) => c.visualPolicy.referenceProfile.evidence = ['other.png']],
    ['视图越界', (c) => c.visualPolicy.scopes[0].views[0].path = '../outside.png'],
    ['漏原生尺寸', (c) => c.visualPolicy.scopes[0].views.shift()],
    ['未知对照范围', (c) => c.comparisons[0].scopeId = 'other'],
    ['重复视图', (c) => c.visualPolicy.scopes[0].views.push(c.visualPolicy.scopes[0].views[0])],
    ['缺设计维度', (c) => c.pillars.splice(0, 1)],
    ['重复维度', (c) => c.pillars.push({ ...c.pillars[0], id: 'another-design' })],
    ['视觉分数门槛', (c) => c.pillars[0].minimum = 9],
    ['独立要求混入对照', (c) => c.pillars[3].comparisonIds = ['hero']],
    ['参考未引用对照', (c) => c.pillars[0].comparisonIds = []],
    ['动画缺播放', (c) => c.visualPolicy.scopes[0].kind = 'animation'],
    ['系列缺总览', (c) => c.visualPolicy.scopes[0].kind = 'series'],
    ['地块缺拼接', (c) => c.visualPolicy.scopes[0].kind = 'tilemap'],
    ['特效缺播放', (c) => c.visualPolicy.scopes[0].kind = 'effect'],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => {
    const c = charter(); mutate(c); assert.throws(() => validateCharter(c));
  });
});

test('盲比：偏好与等级独立，来源猜测可省略，不能用旧报告直接封存', async (t) => {
  const root = await temp(t);
  await writeFile(join(root, 'ref.png'), png(255)); await writeFile(join(root, 'candidate.png'), png(80));
  const pair = join(root, 'blind-pair');
  const packet = await makePair(join(root, 'ref.png'), join(root, 'candidate.png'), pair);
  const path = join(root, 'phase.json');
  for (const mutate of [
    (r) => delete r.impressions,
    (r) => r.impressions.B = '',
    (r) => delete r.comparativeQuality,
    (r) => r.comparativeQuality = 'A',
    (r) => r.qualityRationale = '',
    (r) => r.sourceGuess = 'A',
    (r) => Object.assign(r, { sourceGuess: 'unknown', confidence: 2 }),
  ]) {
    const report = phase1(packet.packetId, 'blind-context'); mutate(report); await json(path, report);
    await assert.rejects(seal(pair, path));
  }
  const valid = phase1(packet.packetId, 'blind-context');
  valid.comparativeQuality = 'B_HIGHER_TIER';
  await json(path, valid); await seal(pair, path);
  assert.ok(await reveal(pair));
});

test('视觉分数不放行也不否决；无身份约束仍可通过结构检查', async (t) => {
  const c = charter(); c.visualPolicy.designConstraints = [];
  const { record, recordFile } = await fixture(t, c);
  for (const batch of record.batches) {
    const report = batch.reports[0];
    report.pillars.forEach((p) => p.score = 3);
    report.holistic.qualityRelation = 'ABOVE';
    report.defects = [{ id: 'minor', severity: 'MINOR', criterion: 'finish', expected: '合成预期',
      actual: '合成轻微差异', recheck: '合成复查', nonBlockingReason: '仅测试不影响准出的理由字段', evidence: ['candidate:native.png'] }];
  }
  await json(recordFile, record);
  assert.equal((await check(recordFile)).status, 'RECORDS_VALID');
});

test('多范围和静态参考下的动态要求：播放及各组盲比均不能漏', async (t) => {
  const c = charter();
  c.visualPolicy.scopes[0].kind = 'animation';
  c.visualPolicy.scopes[0].views.push({ id: 'playback', kind: 'playback', path: 'motion.webm' });
  c.pillars.push({ id: 'motion', critic: 'visual', scopeId: 'hero', dimension: 'motion', basis: 'requirement', criterion: '独立动态要求' });
  const second = structuredClone(c.visualPolicy.scopes[0]);
  second.id = 'other'; second.kind = 'asset';
  second.views = [{ id: 'native', kind: 'native', path: 'other-native.png' }, { id: 'display', kind: 'display', path: 'other-render.png' }];
  c.visualPolicy.scopes.push(second);
  c.comparisons.push({ id: 'other-pair', scopeId: 'other', reference: 'ref.png', candidate: 'other-render.png' });
  c.pillars.push(...c.pillars.filter((p) => p.critic === 'visual' && p.dimension !== 'motion').map((p) => ({ ...p,
    id: `other-${p.id}`, scopeId: 'other', ...(p.basis === 'reference' ? { comparisonIds: ['other-pair'] } : {}) })));
  const { record, recordFile } = await fixture(t, c);
  assert.equal((await check(recordFile)).status, 'RECORDS_VALID');
  for (const mutate of [
    (r) => r.batches[0].blind.pop(),
    (r) => r.batches[0].reports[0].coverage.pop(),
    (r) => r.batches[0].reports[0].coverage[0].evidence.pop(),
    (r) => r.batches[0].reports[0].pillars.find((p) => p.id === 'motion').evidence = ['candidate:render.png'],
    (r) => r.batches[0].reports[0].pillars.find((p) => p.id === 'motion').qualityRelation = 'ON_PAR',
  ]) {
    const copy = structuredClone(record); mutate(copy); await json(recordFile, copy);
    await assert.rejects(check(recordFile));
  }
});

test('snapshot 在冻结前拒绝宪章声明但不存在的视图', async (t) => {
  const { root } = await fixture(t);
  await rm(join(root, 'evidence/native.png'));
  await assert.rejects(snapshot(join(root, 'artifacts'), join(root, 'evidence'), join(root, 'charter.json'), join(root, 'new.json')), /所需证据不存在/);
});

test('整体评价须覆盖完整质量依据，不能只看派生参考而遗漏原图', async (t) => {
  const c = charter(); c.visualPolicy.referenceProfile.evidence.push('original.png');
  const { record, recordFile } = await fixture(t, c);
  assert.equal((await check(recordFile)).status, 'RECORDS_VALID');
  record.batches[0].reports[0].holistic.evidence = record.batches[0].reports[0].holistic.evidence.filter((ref) => ref !== 'candidate:original.png');
  await json(recordFile, record);
  await assert.rejects(check(recordFile), /整体评价遗漏/);
});

test('旧合同只读验证：保留历史字节，新版拒绝继承旧 WOW', async (t) => {
  const root = await temp(t);
  const archived = JSON.parse(await readFile(new URL('../fixtures/asset-loop-v1.json', import.meta.url), 'utf8'));
  for (const [path, bytes] of Object.entries(archived.files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), Buffer.from(bytes, 'base64'));
  }
  const before = await fileHashes(root);
  const recordFile = join(root, 'record.json');
  const legacy = await checkLegacy(recordFile);
  assert.equal(legacy.status, 'RECORDS_VALID');
  assert.equal(legacy.protocol, 'pga-loop/1');
  assert.match(legacy.limitation, /不代表满足 pga-loop\/2/);
  await assert.rejects(check(recordFile), /旧记录.*只读验证/);
  const renamed = await readJson(recordFile);
  renamed.protocol = 'pga-loop/2';
  await json(join(root, 'renamed.json'), renamed);
  await assert.rejects(check(join(root, 'renamed.json')), /旧记录/);
  await rm(join(root, 'renamed.json'));
  assert.throws(() => validateCharter({ protocol: 'pga-loop/1' }), /旧记录/);
  const cli = new URL('../../tools/legacy/asset-loop-v1.mjs', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const result = spawnSync(process.execPath, [fileURLToPath(cli), 'snapshot', 'a', 'b', 'c', 'd'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /只读/);
  assert.deepEqual(await fileHashes(root), before);
  const record = await readJson(recordFile); record.batches[0].reports[0].pillars[0].score = 8;
  await json(recordFile, record);
  await assert.rejects(checkLegacy(recordFile), /支柱未达标/);
});
