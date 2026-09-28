#!/usr/bin/env node
// v1.2: one physically separate package per reviewer + preregistered mirrored X/Y balance.
// Output only <out>/reviewer-1 and <out>/reviewer-2 to reviewers. Keep key.json and source trials private.
import {mkdir,copyFile,writeFile,cp} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {args,readJson,writeJson,readAsset,viewerHtml} from '../runner/common.mjs';
const o=args(),kit=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!o.repo||!o.left||!o.right||!o.out)throw Error('Usage: --repo PATH --left TRIAL --right TRIAL --out NEW_DIR [--mapping-seed STRING]');
const left=resolve(o.left),right=resolve(o.right),out=resolve(o.out);
const a=await readJson(join(left,'run.json')),b=await readJson(join(right,'run.json'));
if(a.task!==b.task||a.repeat!==b.repeat||a.repositoryFingerprint!==b.repositoryFingerprint)throw Error('Paired runs must have matching task/repeat/repository.');
// Position balance is fixed before any reviewer runs: the default seed is preregistered, never chosen by output quality.
const seed=typeof o['mapping-seed']==='string'?o['mapping-seed']:'pga-ab-benchmark/v1_2/blind-mapping/1';
const candidateA=createHash('sha256').update(`${seed}|${left}|${right}`).digest()[0]&1?left:right;
const candidateB=candidateA===left?right:left;
const slots=[
 {id:'reviewer-1',X:candidateA,Y:candidateB},
 {id:'reviewer-2',X:candidateB,Y:candidateA}
];
const baseline=await readAsset(join(kit,'public/tasks',a.task,'baseline'));
for(const slot of slots){
 const rev=join(out,slot.id);await mkdir(rev,{recursive:true});
 const entries=[{label:'Start',asset:baseline}];
 for(const label of ['X','Y']){
  const source=slot[label],asset=await readAsset(join(source,'final'));
  entries.push({label,asset});
  const dst=join(rev,label);await mkdir(dst,{recursive:true});
  for(const f of asset.frames)for(const suffix of ['native','dark','light'])
   await copyFile(join(source,'final',f.id+'.'+suffix+'.png'),join(dst,f.id+'.'+suffix+'.png'));
 }
 await writeFile(join(rev,'compare.html'),await viewerHtml(resolve(o.repo),entries));
 await copyFile(join(kit,'public/tasks',a.task,'TASK.md'),join(rev,'TASK.md'));
 await cp(join(kit,'public/tasks',a.task,'baseline'),join(rev,'baseline'),{recursive:true});
 await cp(join(kit,'public/common'),join(rev,'common'),{recursive:true});
 await copyFile(join(kit,'prompts/reviewer.md'),join(rev,'PROMPT.md'));
 await writeJson(join(rev,'review.template.json'),{
  schema:'pga-review/2',task:a.task,reviewerSlot:slot.id==='reviewer-1'?1:2,reviewerId:'anonymous-visual-reviewer',
  actualViews:[],playbackViewed:false,
  candidates:{
   X:{taskFit:'UNVERIFIED',topStrength:null,topConcern:null,blockingIssue:false},
   Y:{taskFit:'UNVERIFIED',topStrength:null,topConcern:null,blockingIssue:false}},
  pairwiseResult:'UNVERIFIED',
  allowedPairwiseResult:['X_PREFERRED','Y_PREFERRED','NO_MEANINGFUL_DIFFERENCE','BOTH_NOT_YET','UNVERIFIED'],
  allowedTaskFit:['MEETS','NOT_YET','UNVERIFIED'],
  keyEvidence:null,
  confidence:'UNVERIFIED',allowedConfidence:['LOW','MEDIUM','HIGH','UNVERIFIED'],
  notes:null});
}
await writeJson(join(out,'key.json'),{
 schema:'pga-blind-key/2',task:a.task,repeat:a.repeat,
 mappingSeed:seed,
 mappingRule:'candidateA = sha256(seed|leftPath|rightPath) first-byte parity over --left/--right inputs; reviewer-1 gets X=candidateA,Y=candidateB; reviewer-2 is mirrored (X=candidateB,Y=candidateA). Determined before any reviewer runs; never changed after seeing reviews.',
 left,right,candidateA,candidateB,
 reviewers:slots.map(s=>({reviewerId:s.id,X:s.X,Y:s.Y})),
 warning:'ORGANIZER ONLY'});
console.log(JSON.stringify({reviewerPackages:slots.map(s=>join(out,s.id)),privateKey:join(out,'key.json'),positionPolicy:'MIRRORED_BALANCE'},null,2));
