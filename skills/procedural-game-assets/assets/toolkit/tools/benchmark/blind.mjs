/** 新实验用独立评审包；仅主持人调用，样本 ID 不进入评审目录。 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { encodePNG } from '../../src/export/png.js';
import { candidateContactSheet } from '../../src/observe/frame-views.js';
import { createReviewTemplate } from './review.mjs';

export async function buildBlindPackage(outDir, { task, repeat, seed, left, right, taskText, requiredClips = [] }) {
  if (!seed || !task || !Number.isInteger(repeat) || left.runId === right.runId) throw new Error('无效 blind 输入');
  if (requiredClips.length) throw new Error('此打包器只支持静态任务；动画必须另提供经验证的播放材料');
  await mkdir(outDir); // 不覆盖已有 pair/review。
  const flip = createHash('sha256').update(`${seed}|${task}|${repeat}`).digest()[0] & 1;
  const A = flip ? right : left, B = flip ? left : right;
  const slots = [{ reviewerId: 'reviewer-1', X: A.runId, Y: B.runId }, { reviewerId: 'reviewer-2', X: B.runId, Y: A.runId }];
  for (const [i, slot] of slots.entries()) {
    const dir = join(outDir, slot.reviewerId); await mkdir(dir);
    const frames = ['X', 'Y'].map((label) => {
      const frame = (slot[label] === left.runId ? left : right).asset.frames[0];
      return { frame: { ...frame, id: label }, identity: { candidateId: label } };
    });
    for (const entry of frames) await writeFile(join(dir, `${entry.frame.id}.native.png`), encodePNG(entry.frame.width, entry.frame.height, entry.frame.rgba));
    const sheet = candidateContactSheet(frames, { scale: 4 });
    await writeFile(join(dir, 'compare.png'), encodePNG(sheet.display.width, sheet.display.height, sheet.display.rgba));
    await writeFile(join(dir, 'TASK.md'), taskText);
    await writeFile(join(dir, 'PROMPT.md'), '仅判断本目录 X/Y，不查找来源、另一位 reviewer 或 key。填写 review.template.json 的全部字段，输出 review.json。必须实际查看图片；无法查看记 UNVERIFIED。不把图片描述当宿主输入证据。\n');
    await writeFile(join(dir, 'task-contract.json'), JSON.stringify({ task, requiredClips, requiredViews: ['X.native.png', 'Y.native.png'] }, null, 2));
    await writeFile(join(dir, 'review.template.json'), JSON.stringify(createReviewTemplate(task, i + 1), null, 2));
  }
  const key = { schema: 'pga-blind-key/2', task, repeat, mappingSeed: seed, candidateA: A.runId, candidateB: B.runId, reviewers: slots };
  await writeFile(join(outDir, 'key.json'), JSON.stringify(key, null, 2));
  return key;
}
