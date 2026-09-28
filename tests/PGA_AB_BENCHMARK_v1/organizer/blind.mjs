#!/usr/bin/env node
// Output only <out>/reviewer to the reviewer. Keep key.json and source trials private.
import {mkdir,copyFile,writeFile,cp} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomInt} from 'node:crypto';
import {args,readJson,writeJson,readAsset,viewerHtml} from '../runner/common.mjs';
const o=args(),kit=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!o.repo||!o.left||!o.right||!o.out)throw Error('Usage: --repo PATH --left TRIAL_A --right TRIAL_D --out NEW_DIR');
const a=await readJson(join(resolve(o.left),'run.json')),b=await readJson(join(resolve(o.right),'run.json'));
if(a.task!==b.task||a.repeat!==b.repeat||a.repositoryFingerprint!==b.repositoryFingerprint)throw Error('Paired runs must have matching task/repeat/repository.');
const pair=randomInt(2)?[resolve(o.left),resolve(o.right)]:[resolve(o.right),resolve(o.left)],out=resolve(o.out),rev=join(out,'reviewer');
await mkdir(rev,{recursive:true});
const task=await readJson(join(kit,'public/tasks',a.task,'task.json')),baseline=await readAsset(join(kit,'public/tasks',a.task,'baseline'));
const entries=[{label:'Start',asset:baseline}];
for(let i=0;i<2;i++){
 const source=join(pair[i],'final'),asset=await readAsset(source),label=i?'Y':'X';
 entries.push({label,asset});await mkdir(join(rev,label),{recursive:true});
 for(const f of asset.frames)for(const suffix of ['native','dark','light'])await copyFile(join(source,f.id+'.'+suffix+'.png'),join(rev,label,f.id+'.'+suffix+'.png'));
}
await writeFile(join(rev,'compare.html'),await viewerHtml(resolve(o.repo),entries));
await copyFile(join(kit,'public/tasks',a.task,'TASK.md'),join(rev,'TASK.md'));
await cp(join(kit,'public/tasks',a.task,'baseline'),join(rev,'baseline'),{recursive:true});
await cp(join(kit,'public/common'),join(rev,'common'),{recursive:true});
await copyFile(join(kit,'prompts/reviewer.md'),join(rev,'PROMPT.md'));
await writeJson(join(rev,'review.template.json'),{task:a.task,reviewerId:null,actualViews:[],playbackViewed:false,
  X:{requirements:'UNVERIFIED',overall:'UNVERIFIED',evidence:[],majorIssues:[]},
  Y:{requirements:'UNVERIFIED',overall:'UNVERIFIED',evidence:[],majorIssues:[]},
  preference:'UNVERIFIED',allowedPreference:['X','Y','TIE','NEITHER','UNVERIFIED'],reason:null,confidence:'low'});
await writeJson(join(out,'key.json'),{task:a.task,repeat:a.repeat,X:pair[0],Y:pair[1],warning:'ORGANIZER ONLY'});
console.log(JSON.stringify({reviewerPackage:rev,privateKey:join(out,'key.json')},null,2));
