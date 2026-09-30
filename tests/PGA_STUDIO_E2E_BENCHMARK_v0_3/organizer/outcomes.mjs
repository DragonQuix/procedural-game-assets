import { candidateVisualStatus } from '../../../tools/benchmark/review.mjs';
export { candidateVisualStatus };

const independent = reviews => reviews.length === 2 && new Set(reviews.map(r => r.reviewerSlot)).size === 2 &&
  reviews.every(r => r.context?.modelContextId && r.context?.sessionId) && new Set(reviews.map(r => r.context.modelContextId)).size === 2 && new Set(reviews.map(r => r.context.sessionId)).size === 2;

export function taskSuccess({ runId, submitSuccess, technical, budget, protocol, reviews }) {
  if (!submitSuccess) return 'NOT_SUBMITTED';
  if (technical?.status === 'FAIL') return 'TECHNICAL_FAIL';
  if (budget === 'FAIL') return 'BUDGET_FAIL';
  if (protocol === 'FAIL') return 'PROTOCOL_FAIL';
  const required = ['validOutput', 'dimensions', 'deterministic', 'metadata', 'parts', 'protection', 'changed', 'palette', 'silhouette', 'area', 'requiredRelation', 'submittedArtifact', 'sourceFrozen'];
  if (technical?.status !== 'PASS' || !technical.checks || !required.every(k => technical.checks[k] === true) || !Object.values(technical.checks).every(v => v === true) || budget !== 'PASS' || protocol !== 'PASS' || !independent(reviews) || reviews.some(r => r.evidence !== 'CONFIRMED')) return 'UNVERIFIED';
  const visual = candidateVisualStatus(reviews.map(r => r.taskFitByRun[runId] ?? 'UNVERIFIED'));
  return visual === 'PASS' ? 'PASS' : visual === 'UNVERIFIED' ? 'UNVERIFIED' : `VISUAL_${visual}`;
}
export function technicalFailureIncidence({ submitSuccess, technical, toolBlocked }) {
  if (toolBlocked === true || submitSuccess === false || technical?.status === 'FAIL') return true;
  if (submitSuccess === true && technical?.status === 'PASS') return false;
  return 'UNVERIFIED';
}
export function pairedPreference(reviews, { A, D14 }) {
  if (!independent(reviews) || reviews.some(r => r.evidence !== 'CONFIRMED' || r.pairwiseResult === 'UNVERIFIED' || Object.values(r.taskFitByRun).includes('UNVERIFIED'))) return 'UNVERIFIED';
  if (reviews.every(r => r.preferredRun === A)) return 'CONSENSUS_A';
  if (reviews.every(r => r.preferredRun === D14)) return 'CONSENSUS_D14';
  if (reviews.every(r => r.pairwiseResult === 'NO_MEANINGFUL_DIFFERENCE')) return 'NO_MEANINGFUL_DIFFERENCE';
  if (reviews.every(r => r.pairwiseResult === 'BOTH_NOT_YET')) return 'BOTH_NOT_YET';
  return 'MIXED';
}
export function exactBinomialTwoSided(a, b) {
  const n = a + b;
  if (![a, b].every(x => Number.isInteger(x) && x >= 0) || n > 1024) throw new Error('INVALID_BINOMIAL_COUNTS');
  if (!n) return null;
  let probability = 2 ** -n, sum = probability;
  for (let k = 1; k <= Math.min(a, b); k++) { probability *= (n - k + 1) / k; sum += probability; }
  return Math.min(1, 2 * sum);
}
export function descriptiveStatistics(pairs) {
  const matrix = { bothPass: 0, AOnly: 0, D14Only: 0, neitherPass: 0 }, preferences = {};
  for (const pair of pairs) {
    if (!['CONSENSUS_A', 'CONSENSUS_D14', 'MIXED', 'NO_MEANINGFUL_DIFFERENCE', 'BOTH_NOT_YET', 'UNVERIFIED'].includes(pair.preference)) throw new Error('INVALID_PREFERENCE');
    if (!['PASS', 'NOT_SUBMITTED', 'TECHNICAL_FAIL', 'BUDGET_FAIL', 'PROTOCOL_FAIL', 'UNVERIFIED', 'VISUAL_NOT_YET', 'VISUAL_DISAGREEMENT'].includes(pair.A) || !['PASS', 'NOT_SUBMITTED', 'TECHNICAL_FAIL', 'BUDGET_FAIL', 'PROTOCOL_FAIL', 'UNVERIFIED', 'VISUAL_NOT_YET', 'VISUAL_DISAGREEMENT'].includes(pair.D14)) throw new Error('INVALID_SUCCESS_STATUS');
    matrix[pair.A === 'PASS' ? pair.D14 === 'PASS' ? 'bothPass' : 'AOnly' : pair.D14 === 'PASS' ? 'D14Only' : 'neitherPass']++;
    preferences[pair.preference] = (preferences[pair.preference] ?? 0) + 1;
  }
  const unresolved = pairs.filter(p => p.A === 'UNVERIFIED' || p.D14 === 'UNVERIFIED').length;
  const summary = { pairs: pairs.length, matrix, unresolvedPairs: unresolved,
    exactMcNemar: { p: unresolved ? null : exactBinomialTwoSided(matrix.AOnly, matrix.D14Only), status: unresolved ? 'NOT_APPLICABLE_UNVERIFIED' : matrix.AOnly + matrix.D14Only ? 'DESCRIPTIVE_ONLY' : 'NOT_APPLICABLE_NO_DISCORDANCE' },
    preferences, consensusOnlySign: { n: (preferences.CONSENSUS_A ?? 0) + (preferences.CONSENSUS_D14 ?? 0), p: exactBinomialTwoSided(preferences.CONSENSUS_A ?? 0, preferences.CONSENSUS_D14 ?? 0), excludes: ['MIXED', 'NO_MEANINGFUL_DIFFERENCE', 'BOTH_NOT_YET', 'UNVERIFIED'] } };
  return summary;
}
export function taskBreakdown(pairs) {
  if (pairs.length !== 12 || new Set(pairs.map(p => `${p.task}-${p.repeat}`)).size !== 12 || !['H', 'K', 'M', 'S'].every(t => [1, 2, 3].every(r => pairs.some(p => p.task === t && p.repeat === r)))) throw new Error('INCOMPLETE_12_PAIR_MATRIX');
  return { overall: descriptiveStatistics(pairs), tasks: Object.fromEntries(['H', 'K', 'M', 'S'].map(t => [t, descriptiveStatistics(pairs.filter(p => p.task === t))])) };
}
