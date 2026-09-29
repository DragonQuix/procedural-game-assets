/** 新实验的评审合同；不解析或重写 v1.2 原始裁决。 */
export const PAIRWISE_RESULTS = Object.freeze(['X_PREFERRED', 'Y_PREFERRED', 'NO_MEANINGFUL_DIFFERENCE', 'BOTH_NOT_YET', 'UNVERIFIED']);
export const TASK_FITS = Object.freeze(['MEETS', 'NOT_YET', 'UNVERIFIED']);
const CONFIDENCE = ['LOW', 'MEDIUM', 'HIGH', 'UNVERIFIED'];
const fail = (message) => { const e = new Error(message); e.code = 'INVALID_REVIEW'; throw e; };
function exactObject(v, fields, at) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${at} 需要对象`);
  if (fields.some((k) => !Object.hasOwn(v, k)) || Object.keys(v).some((k) => !fields.includes(k))) fail(`${at} 缺字段或有未知字段`);
}
const textOrNull = (v) => v === null || typeof v === 'string';
const strings = (v) => Array.isArray(v) && v.length <= 128 && v.every((s) => typeof s === 'string' && s.length > 0 && s.length < 2048) && new Set(v).size === v.length;

export function createReviewTemplate(task, reviewerSlot) {
  const candidate = () => ({ taskFit: 'UNVERIFIED', topStrength: null, topConcern: null, blockingIssue: false, motion: { taskFit: 'UNVERIFIED', playbackViewed: false, viewedClips: [] } });
  return { schema: 'pga-review/3', task, reviewerSlot, actualViews: [], playbackViewed: false,
    candidates: { X: candidate(), Y: candidate() }, pairwiseResult: 'UNVERIFIED', keyEvidence: null, confidence: 'UNVERIFIED', notes: null };
}

export function validateReview(review) {
  exactObject(review, ['schema', 'task', 'reviewerSlot', 'actualViews', 'playbackViewed', 'candidates', 'pairwiseResult', 'keyEvidence', 'confidence', 'notes'], 'review');
  if (review.schema !== 'pga-review/3' || typeof review.task !== 'string' || !review.task || ![1, 2].includes(review.reviewerSlot)) fail('schema/task/reviewerSlot 非法');
  if (!strings(review.actualViews) || typeof review.playbackViewed !== 'boolean') fail('观察字段非法');
  if (!PAIRWISE_RESULTS.includes(review.pairwiseResult) || !CONFIDENCE.includes(review.confidence)) fail('未知 pairwiseResult/confidence');
  if (![review.keyEvidence, review.notes].every(textOrNull)) fail('keyEvidence/notes 需要字符串或 null');
  exactObject(review.candidates, ['X', 'Y'], 'candidates');
  for (const label of ['X', 'Y']) {
    const c = review.candidates[label];
    exactObject(c, ['taskFit', 'topStrength', 'topConcern', 'blockingIssue', 'motion'], `candidates.${label}`);
    if (!TASK_FITS.includes(c.taskFit) || typeof c.blockingIssue !== 'boolean' || ![c.topStrength, c.topConcern].every(textOrNull)) fail(`${label} 的判断字段非法`);
    exactObject(c.motion, ['taskFit', 'playbackViewed', 'viewedClips'], `${label}.motion`);
    if (!TASK_FITS.includes(c.motion.taskFit) || typeof c.motion.playbackViewed !== 'boolean' || !strings(c.motion.viewedClips)) fail(`${label}.motion 非法`);
  }
  return review;
}

/** hostEvents 由主持人从宿主输入轨迹传入，不读取 review 自带的 CONFIRMED 声明。 */
export function classifyVisionEvidence(actualViews, hostEvents = [], requiredViews = actualViews) {
  const confirmed = (view) => hostEvents.some((e) => e.source === 'host-transcript' && e.view === view && e.kind === 'image-input' && e.success === true && e.modelInput === true && typeof e.callId === 'string' && e.callId && typeof e.modelContextId === 'string' && e.modelContextId && /^[0-9a-f]{64}$/.test(e.sha256));
  if (requiredViews.length && requiredViews.every(confirmed)) return 'CONFIRMED';
  if (requiredViews.some((view) => !confirmed(view) && hostEvents.some((e) => e.view === view && e.source === 'host-transcript' && e.success === false))) return 'FAILED';
  return actualViews.length ? 'SELF_REPORTED' : 'UNVERIFIED';
}

export function deriveReview(review, { task, requiredClips, requiredViews = [], hostEvents = [] }) {
  validateReview(review);
  if (review.task !== task || !strings(requiredClips) || !strings(requiredViews)) fail('评审与外部任务合同不匹配');
  const taskFit = {}, motion = {}, playbackEvidence = {};
  for (const label of ['X', 'Y']) {
    const c = review.candidates[label];
    const viewed = review.playbackViewed && c.motion.playbackViewed && requiredClips.every((clip) => c.motion.viewedClips.includes(clip));
    const confirmedPlayback = requiredClips.every((clip) => hostEvents.some((e) =>
      e.source === 'host-transcript' && e.kind === 'animation-playback' && e.candidate === label && e.clip === clip &&
      e.success === true && e.modelInput === true && typeof e.callId === 'string' && e.callId &&
      typeof e.modelContextId === 'string' && e.modelContextId && Array.isArray(e.frameInputs) && e.frameInputs.length >= 2 &&
      e.frameInputs.every((f) => /^[0-9a-f]{64}$/.test(f.sha256) && Number.isFinite(f.timeMs)) &&
      e.frameInputs.some((f) => f.timeMs > e.frameInputs[0].timeMs && f.sha256 !== e.frameInputs[0].sha256)));
    playbackEvidence[label] = !requiredClips.length ? 'NOT_REQUIRED' : !viewed ? 'UNVERIFIED' : confirmedPlayback ? 'CONFIRMED' : 'SELF_REPORTED';
    motion[label] = !requiredClips.length ? 'NOT_REQUIRED' : viewed ? c.motion.taskFit : 'UNVERIFIED';
    taskFit[label] = !review.actualViews.length || motion[label] === 'UNVERIFIED' ? 'UNVERIFIED' : c.blockingIssue || c.taskFit === 'NOT_YET' || motion[label] === 'NOT_YET' ? 'NOT_YET' : c.taskFit;
  }
  return { schema: 'pga-derived-review/1', task, reviewerSlot: review.reviewerSlot, rawPairwiseResult: review.pairwiseResult,
    pairwiseResult: Object.values(taskFit).includes('UNVERIFIED') ? 'UNVERIFIED' : review.pairwiseResult,
    taskFit, motion, playbackEvidence, visionEvidence: classifyVisionEvidence(review.actualViews, hostEvents, requiredViews.length ? requiredViews : review.actualViews) };
}

export function unblindReview(key, review, taskContract) {
  // schema validation 必须先于任何映射；缺字段没有 fallback。
  const derived = deriveReview(review, taskContract);
  if (key.schema !== 'pga-blind-key/2' || key.task !== review.task || key.candidateA === key.candidateB || !Array.isArray(key.reviewers) || key.reviewers.length !== 2) fail('blind key 非法');
  const r1 = key.reviewers.find((r) => r.reviewerId === 'reviewer-1'), r2 = key.reviewers.find((r) => r.reviewerId === 'reviewer-2');
  if (!r1 || !r2 || r1.X !== key.candidateA || r1.Y !== key.candidateB || r2.X !== key.candidateB || r2.Y !== key.candidateA) fail('blind key 不满足 MIRRORED_BALANCE');
  const mapping = review.reviewerSlot === 1 ? r1 : r2;
  const preferredRun = derived.pairwiseResult === 'X_PREFERRED' ? mapping.X : derived.pairwiseResult === 'Y_PREFERRED' ? mapping.Y : null;
  return { ...derived, preferredRun, taskFitByRun: { [mapping.X]: derived.taskFit.X, [mapping.Y]: derived.taskFit.Y }, playbackEvidenceByRun: { [mapping.X]: derived.playbackEvidence.X, [mapping.Y]: derived.playbackEvidence.Y } };
}

export function candidateVisualStatus(fits) {
  if (fits.length !== 2 || fits.includes('UNVERIFIED')) return 'UNVERIFIED';
  if (fits.every((v) => v === 'MEETS')) return 'PASS';
  if (fits.every((v) => v === 'NOT_YET')) return 'NOT_YET';
  return 'DISAGREEMENT';
}

export function taskSuccess({ submitted, technical, protocol, budget, reviews, runId }) {
  if (!submitted) return 'NOT_SUBMITTED';
  if (technical === 'FAIL') return 'TECHNICAL_FAIL';
  if (protocol === 'FAIL') return 'PROTOCOL_FAIL';
  if (budget === 'FAIL') return 'BUDGET_FAIL';
  if ([technical, protocol, budget].some((v) => v !== 'PASS') || reviews.length !== 2 || new Set(reviews.map((r) => r.reviewerSlot)).size !== 2 || reviews.some((r) => r.visionEvidence !== 'CONFIRMED' || !['CONFIRMED', 'NOT_REQUIRED'].includes(r.playbackEvidenceByRun?.[runId]))) return 'UNVERIFIED';
  const visual = candidateVisualStatus(reviews.map((r) => r.taskFitByRun[runId] ?? 'UNVERIFIED'));
  return visual === 'PASS' ? 'PASS' : visual === 'UNVERIFIED' ? 'UNVERIFIED' : `VISUAL_${visual}`;
}
