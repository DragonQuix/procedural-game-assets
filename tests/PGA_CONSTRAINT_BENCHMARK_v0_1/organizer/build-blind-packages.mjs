#!/usr/bin/env node
// 组装 6 pairs × 2 reviewers 的盲评包（MIRRORED_BALANCE 由 blind.mjs 按 seed|task|repeat 决定）。
//   node build-blind-packages.mjs --runs-dir <runsDir> --reviews-dir <reviewsDir> --trial-map <trial-map.json>
// 每个 pair：left=T 奇数位 repeat 内两臂的提交渲染；runId 使用中性 trial id（T01..T12）。
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = dirname(fileURLToPath(import.meta.url));
const kit = resolve(self, '..');
const argOf = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const req = (n) => { const v = argOf(n); if (!v) { console.error(`缺少 --${n}`); process.exit(2); } return resolve(v); };

const runsDir = req('runs-dir');
const reviewsDir = req('reviews-dir');
const map = JSON.parse(await readFile(req('trial-map'), 'utf8'));
const protocol = JSON.parse(await readFile(join(kit, 'protocol-frozen.json'), 'utf8'));
const sharedKit = resolve(map.sharedKit);

const { buildBlindPackage } = await import(pathToFileURL(resolve(kit, '../../tools/benchmark/blind.mjs')));

const taskTexts = {
  G: [
    '任务 G：矿区压力单元（ore-pressure-unit）。',
    '要求：主体 pump.body 明显更矮、更宽、更重——最终宽度 ≥24px、高度 ≤19px、中心 X = 25、底边 Y = 31。',
    '同时底座 pump.base、仪表 pump.gauge、读数 pump.readout 的像素、锚点 anchor、附件 attachments 必须与基线完全一致（保护区不得出现任何改动）。',
    '评判只基于你看到的最终渲染与上述要求的符合度：主体是否达到尺寸/位置要求、保护区是否干净、整体是否仍是一个合理完整的资产。',
  ].join('\n'),
  P: [
    '任务 P：继电塔（relay-stack）。',
    '要求：主体 relay.body 做明显结构改变——最终宽度 ≥20px、高度 ≤16px（中心与底边不做强制）。',
    '同时信号灯 relay.signal、插座 relay.socket 的像素、锚点 anchor、附件 attachments、边界 bounds 必须与基线完全一致（保护区不得出现任何改动）。',
    '评判只基于你看到的最终渲染与上述要求的符合度：主体是否完成明显的结构改变、保护区是否干净、整体是否仍是一个合理完整的资产。',
  ].join('\n'),
};

async function compiledEntry(trialId) {
  const trialDir = join(runsDir, trialId);
  const submitDir = join(trialDir, 'submit');
  if (!existsSync(submitDir)) throw new Error(`${trialId} 没有提交目录`);
  const files = await readdir(submitDir);
  const studio = files.find((f) => f.endsWith('.studio.json'));
  if (!studio) throw new Error(`${trialId} 提交目录没有 studio.json`);
  const arm = map.trials[trialId].arm;
  const api = await import(pathToFileURL(join(resolve(map.trials[trialId].kitDir), 'src/studio/dispatch.js')));
  const doc = JSON.parse(await readFile(join(submitDir, studio), 'utf8'));
  const compiled = api.compileAny(doc);
  return { runId: trialId, asset: compiled.asset };
}

// pair 定义：task + repeat → 两臂 trial id（来自冻结 runOrder 的映射，trial-map 持有 arm）
const pairDefs = [];
for (const trialId of Object.keys(map.trials)) {
  const info = map.trials[trialId];
  const repeat = Math.floor((Number(trialId.slice(1)) - 1) / 4) + 1; // T01-T04=r1, T05-T08=r2, T09-T12=r3
  pairDefs.push({ trialId, task: info.task, repeat, arm: info.arm });
}
const pairs = [];
for (const task of ['G', 'P']) {
  for (const repeat of [1, 2, 3]) {
    const runs = pairDefs.filter((p) => p.task === task && p.repeat === repeat);
    if (runs.length !== 2) throw new Error(`${task}-r${repeat} 的 run 不足两个：${runs.map((r) => r.trialId)}`);
    pairs.push({ task, repeat, ids: runs.map((r) => r.trialId).sort() });
  }
}

const summary = [];
for (const pair of pairs) {
  const outDir = join(reviewsDir, `${pair.task}-r${pair.repeat}`);
  if (existsSync(outDir)) throw new Error(`盲评目录已存在，拒绝覆盖：${outDir}`);
  const left = await compiledEntry(pair.ids[0]);
  const right = await compiledEntry(pair.ids[1]);
  const key = await buildBlindPackage(outDir, {
    task: pair.task,
    repeat: pair.repeat,
    seed: protocol.draftReference.mappingSeed,
    left, right,
    taskText: taskTexts[pair.task],
    requiredClips: [],
  });
  summary.push({ pair: `${pair.task}-r${pair.repeat}`, outDir, reviewers: key.reviewers.map((r) => r.reviewerId) });
}
console.log(JSON.stringify({ built: summary.length, pairs: summary.map((s) => s.pair) }, null, 1));
