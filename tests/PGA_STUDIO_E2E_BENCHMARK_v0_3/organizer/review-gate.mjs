import { mkdir, readFile, writeFile, readdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { schemaErrors } from './review-schema.mjs';
import { sha256, canonical } from '../shared/hashes.mjs';

export async function submitReviewDraft({ directory, binding, author, draft }) {
  if (canonical(author) !== canonical(binding.reviewer) || !author?.modelContextId || !author?.sessionId) throw new Error('REVIEWER_IDENTITY_MISMATCH');
  await mkdir(directory, { recursive: true });
  const lock = join(directory, '.lock'); await mkdir(lock);
  try {
    const files = await readdir(directory);
    if (files.includes('review.json')) throw new Error('REVIEW_ALREADY_FROZEN');
    const bindingFile = join(directory, 'binding.json');
    if (files.includes('binding.json')) {
      if (canonical(JSON.parse(await readFile(bindingFile, 'utf8'))) !== canonical(binding)) throw new Error('REVIEW_BINDING_MISMATCH');
    } else await writeFile(bindingFile, JSON.stringify(binding), { flag: 'wx' });
    const reviewValidationAttempts = files.filter(f => /^attempt-\d+\.json$/.test(f)).length + 1;
    let parsed, errors;
    try { parsed = typeof draft === 'string' ? JSON.parse(draft) : draft; errors = schemaErrors(parsed); }
    catch { errors = [{ field: '$', expected: 'JSON object matching pga-e2e-review/0.3' }]; }
    if (!errors.length && (parsed.task !== binding.task || parsed.reviewerSlot !== binding.reviewerSlot)) errors.push({ field: '$.task/reviewerSlot', expected: { task: binding.task, reviewerSlot: binding.reviewerSlot } });
    const draftBytes = typeof draft === 'string' ? draft : JSON.stringify(draft);
    await writeFile(join(directory, `attempt-${reviewValidationAttempts}.json`), JSON.stringify({ reviewValidationAttempts, draftSha256: sha256(draftBytes), errors, author }, null, 2), { flag: 'wx' });
    if (errors.length) return { status: 'SCHEMA_RETRY', feedback: { schemaErrors: errors }, reviewValidationAttempts };
    const bytes = JSON.stringify(parsed, null, 2) + '\n';
    await writeFile(join(directory, 'review.json'), bytes, { flag: 'wx' });
    await writeFile(join(directory, 'receipt.json'), JSON.stringify({ status: 'SUBMITTED', reviewValidationAttempts, reviewSha256: sha256(bytes), binding }), { flag: 'wx' });
    return { status: 'SUBMITTED', reviewValidationAttempts, reviewSha256: sha256(bytes) };
  } finally { await rmdir(lock); }
}

// 宿主必须把纯 schema feedback 发回同一 reviewer context；无 coordinator 修正回调。
export async function collectReview({ requestDraft, maxAttempts = 4, ...input }) {
  let feedback = null;
  for (let i = 0; i < maxAttempts; i++) {
    const draft = await requestDraft({ reviewer: input.binding.reviewer, feedback });
    const result = await submitReviewDraft({ ...input, author: input.binding.reviewer, draft });
    if (result.status === 'SUBMITTED') return result;
    feedback = result.feedback;
  }
  return { status: 'NOT_SUBMITTED', reason: 'SCHEMA_ATTEMPTS_EXHAUSTED' };
}
