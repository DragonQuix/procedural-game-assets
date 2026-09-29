import test from 'node:test';
import assert from 'node:assert/strict';
import { PAIRWISE_RESULTS, createReviewTemplate, validateReview, deriveReview, classifyVisionEvidence, unblindReview, taskSuccess } from '../../tools/benchmark/review.mjs';

const key = { schema: 'pga-blind-key/2', task: 'T06', candidateA: 'A', candidateB: 'B', reviewers: [{ reviewerId: 'reviewer-1', X: 'A', Y: 'B' }, { reviewerId: 'reviewer-2', X: 'B', Y: 'A' }] };
const contract = { task: 'T06', requiredClips: ['idle', 'run'] };
function review(slot = 1) {
  const r = createReviewTemplate('T06', slot); r.actualViews = ['X.png', 'Y.png'];
  r.playbackViewed = true; r.pairwiseResult = 'X_PREFERRED'; r.confidence = 'HIGH';
  for (const c of Object.values(r.candidates)) { c.taskFit = 'MEETS'; c.motion = { taskFit: 'MEETS', playbackViewed: true, viewedClips: ['idle', 'run'] }; }
  return r;
}

test('review schema 严格拒绝缺字段、未知 verdict 和自带 allowed enum；固定五类均合法', () => {
  for (const value of PAIRWISE_RESULTS) { const r = review(); r.pairwiseResult = value; assert.doesNotThrow(() => validateReview(r)); }
  for (const mutate of [(r) => { delete r.confidence; }, (r) => { delete r.candidates.X.blockingIssue; }, (r) => { r.pairwiseResult = 'MAYBE'; }, (r) => { r.allowedPairwiseResult = ['MAYBE']; }]) {
    const r = review(); mutate(r); assert.throws(() => unblindReview(key, r, contract), { code: 'INVALID_REVIEW' });
  }
});
test('T06 未播放、漏必要 clip 或 motion UNVERIFIED 均传播到 taskFit 与 pairwise', () => {
  for (const mutate of [(r) => { r.playbackViewed = false; }, (r) => { r.candidates.X.motion.playbackViewed = false; }, (r) => { r.candidates.X.motion.viewedClips = ['idle']; }, (r) => { r.candidates.X.motion.taskFit = 'UNVERIFIED'; }]) {
    const r = review(); mutate(r);
    const d = deriveReview(r, contract);
    assert.equal(d.taskFit.X, 'UNVERIFIED'); assert.equal(d.pairwiseResult, 'UNVERIFIED');
    const u = unblindReview(key, r, contract); u.visionEvidence = 'CONFIRMED';
    const peer = unblindReview(key, review(2), contract); peer.visionEvidence = 'CONFIRMED';
    assert.equal(taskSuccess({ submitted: true, technical: 'PASS', protocol: 'PASS', budget: 'PASS', reviews: [u, peer], runId: 'A' }), 'UNVERIFIED');
  }
});
test('unblind 两份镜像映射一致；静态任务不要求 motion', () => {
  const a = review(), b = review(2); b.pairwiseResult = 'Y_PREFERRED';
  assert.equal(unblindReview(key, a, contract).preferredRun, 'A');
  assert.equal(unblindReview(key, b, contract).preferredRun, 'A');
  a.playbackViewed = false;
  assert.equal(deriveReview(a, { ...contract, requiredClips: [] }).taskFit.X, 'MEETS');
});
test('vision 仅按宿主证据分类，不因文字描述准确自动 CONFIRMED', () => {
  assert.equal(classifyVisionEvidence([]), 'UNVERIFIED');
  assert.equal(classifyVisionEvidence(['X.png']), 'SELF_REPORTED');
  assert.equal(classifyVisionEvidence(['X.png'], [{ source: 'host-transcript', view: 'X.png', success: false }]), 'FAILED');
  const event = { source: 'host-transcript', view: 'X.png', success: true, kind: 'image-input', modelInput: true, callId: 'call-1', modelContextId: 'ctx-1', sha256: 'a'.repeat(64) };
  assert.equal(classifyVisionEvidence(['X.png'], [event]), 'CONFIRMED');
  assert.equal(classifyVisionEvidence(['X.png'], [{ ...event, modelContextId: null }]), 'SELF_REPORTED');
  assert.equal(classifyVisionEvidence(['X.png', 'Y.png'], [event]), 'SELF_REPORTED');
});

test('播放自述不能凭静帧宿主证据获得完全 PASS；每个必要 clip 需真实时序输入关联', () => {
  const inputs = ['X.png', 'Y.png'].map((view) => ({ source: 'host-transcript', kind: 'image-input', view, success: true, modelInput: true, callId: 'call', modelContextId: 'ctx', sha256: 'a'.repeat(64) }));
  const score = (events) => taskSuccess({ submitted: true, technical: 'PASS', protocol: 'PASS', budget: 'PASS', runId: 'A', reviews: [1, 2].map((slot) => unblindReview(key, review(slot), { ...contract, hostEvents: events })) });
  assert.equal(score(inputs), 'UNVERIFIED');
  const playback = ['X', 'Y'].flatMap((candidate) => ['idle', 'run'].map((clip) => ({ source: 'host-transcript', kind: 'animation-playback', candidate, clip, success: true, modelInput: true, callId: 'play', modelContextId: 'ctx', frameInputs: [{ timeMs: 0, sha256: 'a'.repeat(64) }, { timeMs: 200, sha256: 'b'.repeat(64) }] })));
  assert.equal(score([...inputs, ...playback]), 'PASS');
  assert.equal(score([...inputs, ...playback.filter((e) => e.clip !== 'run')]), 'UNVERIFIED');
});
