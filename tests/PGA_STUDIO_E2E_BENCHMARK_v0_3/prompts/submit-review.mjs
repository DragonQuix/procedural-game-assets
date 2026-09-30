import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { submitReviewDraft } from './validator/review-gate.mjs';
// review-binding.json 由宿主在创建空 reviewer context 后写入，不由协调器代填裁决。
const root = process.cwd();
const binding = JSON.parse(await readFile(join(root, 'review-binding.json'), 'utf8'));
const draft = await readFile(resolve(process.argv[2]), 'utf8');
const result = await submitReviewDraft({ directory: join(root, 'submission'), binding, author: binding.reviewer, draft });
console.log(JSON.stringify(result));
if (result.status !== 'SUBMITTED') process.exitCode = 2;
