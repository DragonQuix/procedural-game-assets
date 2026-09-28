#!/usr/bin/env node
// Mechanical plumbing tests. Does NOT run an agent or establish art quality.
import {mkdir,copyFile,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {args,readJson,writeJson,compileDoc,buildA,assetHash,writeAsset} from '../runner/common.mjs';
import {evaluate} from './evaluate.mjs';
const o=args(),kit=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!o.repo||!o.out)throw Error('Usage: --repo PATH --out NEW_EMPTY_DIR');
const repo=resolve(o.repo),out=resolve(o.out);await mkdir(out,{recursive:true});
const results=[];
function cli(file,argv,cwd){
 const r=spawnSync(process.execPath,[file,...argv],{cwd,encoding:'utf8',maxBuffer:16*1024*1024});
 if(r.status!==0)throw Error(file+': '+r.stderr+'\n'+r.stdout);
 return JSON.parse(r.stdout);
}
for(let i=1;i<=6;i++){
 const task='T0'+i,pair={};
 for(const arm of ['A','D']){
  const run=join(out,task+'-'+arm);
  cli(join(kit,'organizer/prepare.mjs'),['--repo',repo,'--task',task,'--arm',arm,'--out',run,'--mode','smoke']);
  if(arm==='A')await copyFile(join(kit,'organizer/controls',task,'source.mjs'),join(run,'candidate.mjs'));
  else {
   const ops=await readJson(join(kit,'organizer/controls',task,'operations.json'));
   let head='r1';
   for(const op of ops){
    const params=['studio','edit','--base',head,'--op',op.id,'--target',op.target];
    if(op.params)params.push('--params',JSON.stringify(op.params));
    if(op.material)params.push('--material',op.material);
    if(op.ramp)params.push('--ramp',typeof op.ramp==='string'?op.ramp:JSON.stringify(op.ramp));
    if(op.value)params.push('--value',JSON.stringify(op.value));
    const c=cli(join(run,'run.mjs'),params,run).result;
    if(c.status!=='OK')throw Error(task+' rejected sanity control '+JSON.stringify(c));
    const done=cli(join(run,'run.mjs'),['studio','commit','--accept',c.candidateId,'--expected-head',head],run).result;
    head=done.revision;
   }
  }
  const submitted=cli(join(run,'run.mjs'),['submit'],run);
  const result=await evaluate({repo,kit,run,out:join(out,'eval-'+task+'-'+arm)});
  results.push({test:'positive-control',task,arm,pass:result.technicalStatus==='PASS',failed:result.checks.filter(c=>!c.pass)});
  pair[arm]=submitted.assetHash;
 }
 results.push({test:'positive-pair-equality',task,pass:pair.A===pair.D});
}
// Negative controls through rebuilt source, not simply altering a displayed PNG.
for(const kind of ['unchanged','outside-mask','metadata-only','submitted-tamper']){
 const run=join(out,'negative-'+kind);
 cli(join(kit,'organizer/prepare.mjs'),['--repo',repo,'--task','T01','--arm','A','--out',run,'--mode','smoke']);
 let s=await readFile(join(kit,'organizer/controls/T01/source.mjs'),'utf8');
 if(kind==='unchanged')s=await readFile(join(kit,'fixtures/A/T01/candidate.mjs'),'utf8');
 if(kind==='outside-mask')s=s.replace('const frame = assembleFrame','main.set(0,0,packColor("#ff00ff"));\n  const frame = assembleFrame');
 if(kind==='metadata-only')s=s.replace('"screenCenter": {"x": 15, "y": 14}', '"screenCenter": {"x": 15, "y": 13}');
 await writeFile(join(run,'candidate.mjs'),s);cli(join(run,'run.mjs'),['submit'],run);
 if(kind==='submitted-tamper'){const p=join(run,'final/relay.rgba'),b=await readFile(p);b[0]^=255;await writeFile(p,b);}
 const e=await evaluate({repo,kit,run,out:join(out,'eval-negative-'+kind)});
 const expected={unchanged:'nontrivial_edit','outside-mask':'protected_pixels:relay','metadata-only':'attachments:relay','submitted-tamper':'submitted_equals_rebuild'}[kind];
 results.push({test:'negative-'+kind,pass:e.checks.some(c=>c.name===expected&&!c.pass),expected,failed:e.checks.filter(c=>!c.pass)});
}
const blindOut=join(out,'blind-demo');
cli(join(kit,'organizer/blind.mjs'),['--repo',repo,'--left',join(out,'T01-A'),'--right',join(out,'T01-D'),'--out',blindOut]);
results.push({test:'blind-export',pass:(await readdir(join(blindOut,'reviewer'))).includes('compare.html')});
await writeJson(join(out,'self-test.json'),{status:results.every(r=>r.pass)?'PASS':'FAIL',tests:results.length,results,scope:'No model calls, no blind aesthetic review.'});
console.log(JSON.stringify({status:results.every(r=>r.pass)?'PASS':'FAIL',tests:results.length,failures:results.filter(r=>!r.pass)},null,2));process.exitCode=results.every(r=>r.pass)?0:2;
