/** v0.2 stable X/Y identities: mirrored presentation order does not remap IDs. */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { encodePNG } from '../../src/export/png.js';
import { symbolicContactSheet } from '../../src/observe/symbolic-sheet.js';
import { createReviewTemplate } from './review.mjs';
import { assertIdentityMaterials } from './identity-lint.mjs';

export async function buildSymbolicBlindPackage(outDir, { task, repeat, seed, candidateA, candidateB, taskText }) {
  if (!seed || !task || !Number.isInteger(repeat) || !candidateA?.runId || !candidateB?.runId || candidateA.runId === candidateB.runId) throw new Error('Invalid blind input');
  assertIdentityMaterials([{ file: 'TASK.md', kind: 'task', text: taskText }]);
  const flip = createHash('sha256').update(`${seed}|${task}|${repeat}`).digest()[0] & 1;
  const mapping = flip ? { X: candidateB, Y: candidateA } : { X: candidateA, Y: candidateB };
  await mkdir(outDir);
  const slots = [];
  for (const [index, order] of [['X', 'Y'], ['Y', 'X']].entries()) {
    const dir = join(outDir, `reviewer-${index + 1}`); await mkdir(dir);
    for (const label of ['X', 'Y']) {
      const f = mapping[label].asset.frames[0];
      await writeFile(join(dir, `${label}.png`), encodePNG(f.width, f.height, f.rgba));
    }
    const sheet = symbolicContactSheet(order.map(label => ({ label, frame: mapping[label].asset.frames[0] })));
    await writeFile(join(dir, 'contact-sheet.png'), encodePNG(sheet.display.width, sheet.display.height, sheet.display.rgba));
    const prompt = '分别查看 X.png 与 Y.png，以 X/Y 引用候选。contact-sheet.png 的标签位于资产区域外。只评任务和视觉要求，不推测工具来源；无法看图记 UNVERIFIED。填写 review.template.json。';
    assertIdentityMaterials([{ file: 'PROMPT.md', kind: 'reviewer', text: prompt }]);
    await writeFile(join(dir, 'PROMPT.md'), prompt);
    await writeFile(join(dir, 'TASK.md'), taskText);
    await writeFile(join(dir, 'review.template.json'), JSON.stringify(createReviewTemplate(task, index + 1), null, 2));
    slots.push({ reviewerSlot: index + 1, presentationOrder: order, X: mapping.X.runId, Y: mapping.Y.runId });
  }
  // Caller keeps this returned key in coordinator-only storage, never the participant/reviewer root.
  return { schema: 'pga-symbolic-blind-key/1', task, repeat, identities: { X: mapping.X.runId, Y: mapping.Y.runId }, reviewers: slots, balance: 'MIRRORED_BALANCE' };
}

export function unblindSymbolicPreference(key, reviewerSlot, preference) {
  if (key.schema !== 'pga-symbolic-blind-key/1' || ![1, 2].includes(reviewerSlot) || !['X_PREFERRED', 'Y_PREFERRED', 'NO_MEANINGFUL_DIFFERENCE', 'BOTH_NOT_YET', 'UNVERIFIED'].includes(preference)) throw new Error('Invalid symbolic review');
  if (key.reviewers.some(s => s.X !== key.identities.X || s.Y !== key.identities.Y)) throw new Error('Identity changed across mirrored presentation');
  return preference === 'X_PREFERRED' ? key.identities.X : preference === 'Y_PREFERRED' ? key.identities.Y : null;
}
