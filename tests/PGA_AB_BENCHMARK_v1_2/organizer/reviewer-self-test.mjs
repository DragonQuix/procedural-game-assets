#!/usr/bin/env node
// v1.2 reviewer-infrastructure self-test: isolated reviewer packages, mirrored X/Y balance,
// key secrecy, no cross-writes, review schema, unblinding, frozen-material equality vs v1.1.
// No model calls, no aesthetic judgment.
import {mkdir,writeFile,readdir,readFile,stat} from 'node:fs/promises';
import {join,resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {args,writeJson,readJson,writeAsset} from '../runner/common.mjs';
const o=args(),kit=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!o.repo||!o.out)throw Error('Usage: --repo PATH --out NEW_DIR');
const repo=resolve(o.repo),out=resolve(o.out),work=join(out,'work');
const results=[],add=(id,pass,details)=>{results.push({id,status:pass===true?'PASS':pass===false?'FAIL':'UNVERIFIED',pass:pass===true,details:details??null});console.error((pass===true?'PASS ':pass===false?'FAIL ':'UNVERIFIED ')+id);};
const shaFile=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
async function hashTree(dir){const m={};async function walk(d){for(const e of (await readdir(d,{withFileTypes:true})).sort((x,y)=>x.name.localeCompare(y.name))){const p=join(d,e.name);if(e.isDirectory())await walk(p);else m[relative(dir,p).replaceAll('\\','/')]=await shaFile(p);}}await walk(dir);return m;}
async function textFiles(dir){const out2=[];async function walk(d){for(const e of (await readdir(d,{withFileTypes:true})).sort((x,y)=>x.name.localeCompare(y.name))){const p=join(d,e.name);if(e.isDirectory())await walk(p);else if(/\.(md|json|html)$/.test(e.name))out2.push(p);}}await walk(dir);return out2;}

await mkdir(work,{recursive:true});
// Two minimal paired runs (neutral names; red vs blue 8x8 so a human could tell them apart if ever viewed).
const runL=join(work,'run-left'),runR=join(work,'run-right');
async function makeRun(dir,color,tag){
 const a={id:'probe-'+tag,kind:'machine',seed:1,clips:{},frames:[{id:'probe',width:8,height:8,
  rgba:new Uint8ClampedArray(8*8*4).map((_,i)=>i%4===3?255:color[i%4]),anchor:{x:0,y:0},attachments:{},bounds:null}]};
 await writeAsset(repo,a,join(dir,'final'));
 await writeJson(join(dir,'run.json'),{schema:'pga-benchmark-run/1',task:'T01',arm:tag,repeat:1,mode:'selftest',repositoryFingerprint:'selftest-fingerprint',maxRenderedStates:12});
}
await makeRun(runL,[220,60,50],'left');await makeRun(runR,[50,90,220],'right');

const blind=join(kit,'organizer/blind.mjs'),unblind=join(kit,'organizer/unblind.mjs');
const runTool=(p,args2)=>{const r=spawnSync(process.execPath,[p,...args2],{encoding:'utf8'});
 if(r.status!==0)throw Error(p+' failed ('+r.status+'): '+(r.stderr||r.stdout).slice(0,400));return JSON.parse(r.stdout);};

const pair=join(out,'pair');
runTool(blind,['--repo',repo,'--left',runL,'--right',runR,'--out',pair]);
const key=await readJson(join(pair,'key.json'));
const rev1=join(pair,'reviewer-1'),rev2=join(pair,'reviewer-2');

// 1) physically separate packages, complete and non-referencing
{
 const need=['X','Y','TASK.md','compare.html','PROMPT.md','review.template.json','baseline','common'];
 let complete=true;
 for(const rev of [rev1,rev2])for(const n of need){try{await stat(join(rev,n));}catch{complete=false;}}
 const t1=await textFiles(rev1),t2=await textFiles(rev2);
 const cross=async(files,needle)=>{for(const f of files){const c=await readFile(f,'utf8');if(c.includes(needle))return relative(files.root,f);}return null;};
 t1.root=rev1;t2.root=rev2;
 add('reviewer-directories-independent',rev1!==rev2&&complete&&!await cross(t1,'reviewer-2')&&!await cross(t2,'reviewer-1'),{reviewer1:rev1,reviewer2:rev2,sharedPath:rev1===rev2});
}

// 2) mirrored balance from preregistered seed, deterministic, mirrored for any seed
{
 const mirror=k=>k.reviewers[0].reviewerId==='reviewer-1'&&k.reviewers[0].X===k.candidateA&&k.reviewers[0].Y===k.candidateB
  &&k.reviewers[1].reviewerId==='reviewer-2'&&k.reviewers[1].X===k.candidateB&&k.reviewers[1].Y===k.candidateA;
 const pairB=join(out,'pair-repeat');runTool(blind,['--repo',repo,'--left',runL,'--right',runR,'--out',pairB]);
 const keyB=await readJson(join(pairB,'key.json'));
 const pairC=join(out,'pair-altseed');runTool(blind,['--repo',repo,'--left',runL,'--right',runR,'--out',pairC,'--mapping-seed','pga-ab-benchmark/v1_2/blind-mapping/selftest-alt']);
 const keyC=await readJson(join(pairC,'key.json'));
 add('mapping-deterministic-same-seed',keyB.candidateA===key.candidateA&&keyB.candidateB===key.candidateB,{candidateA:key.candidateA,candidateB:key.candidateB});
 add('mapping-mirrored-per-pair',mirror(key)&&mirror(keyC),{altSeedCandidateA:keyC.candidateA===key.candidateA?'same-as-default':'flipped-by-seed'});
}

// 3) key must not leak into either reviewer package
{
 const needles=[key.candidateA,key.candidateB,key.mappingSeed,'ORGANIZER ONLY','run-left','run-right'];
 let leak=null;
 for(const rev of [rev1,rev2])for(const f of await textFiles(rev)){
  const c=await readFile(f,'utf8');
  for(const n of needles)if(n&&c.includes(n))leak=relative(rev,f)+' contains '+(n.length>60?n.slice(0,60)+'…':n);
 }
 let hasKeyFile=false;
 for(const rev of [rev1,rev2])for(const e of await readdir(rev))if(e==='key.json')hasKeyFile=true;
 add('key-not-in-reviewer-packages',!leak&&!hasKeyFile,{leak});
}

// 4) reviewer-1 writing must not change reviewer-2 package
{
 const before=await hashTree(rev2);
 await writeFile(join(rev1,'review.output.json'),JSON.stringify({simulatedReviewer1Output:true},null,2)+'\n');
 await writeFile(join(rev1,'review.template.json'),JSON.stringify({touched:true},null,2)+'\n');
 const after=await hashTree(rev2);
 const same=JSON.stringify(before)===JSON.stringify(after);
 add('reviewer2-immutable-while-reviewer1-writes',same,{filesCompared:Object.keys(before).length});
}

// 5) review schema supports the five pairwise outcomes and per-candidate taskFit
{
 const t=await readJson(join(rev2,'review.template.json'));
 const five=['X_PREFERRED','Y_PREFERRED','NO_MEANINGFUL_DIFFERENCE','BOTH_NOT_YET','UNVERIFIED'];
 add('review-schema-v2',t.schema==='pga-review/2'&&five.every(x=>t.allowedPairwiseResult?.includes(x))
  &&['MEETS','NOT_YET','UNVERIFIED'].every(x=>t.allowedTaskFit?.includes(x))
  &&t.candidates?.X&&t.candidates?.Y&&typeof t.candidates.X.blockingIssue==='boolean',{schema:t.schema});
}

// 6) unblinding resolves mirrored reviews consistently
{
 const five=['X_PREFERRED','Y_PREFERRED','NO_MEANINGFUL_DIFFERENCE','BOTH_NOT_YET','UNVERIFIED'];
 const mk=(slot,verdict)=>({schema:'pga-review/2',reviewerSlot:slot,pairwiseResult:verdict,allowedPairwiseResult:five,
  candidates:{X:{taskFit:'MEETS'},Y:{taskFit:'NOT_YET'}},confidence:'MEDIUM'});
 const u=(file)=>runTool(unblind,['--key',join(pair,'key.json'),'--review',file]);
 const r1a=join(rev1,'review.dry-a.json'),r2a=join(rev2,'review.dry-a.json');
 await writeFile(r1a,JSON.stringify(mk(1,'X_PREFERRED')));await writeFile(r2a,JSON.stringify(mk(2,'Y_PREFERRED')));
 const u1=u(r1a),u2=u(r2a);
 const agreeA=u1.preferredRun===key.candidateA&&u2.preferredRun===key.candidateA&&u1.preferredRole==='candidateA'&&u2.preferredRole==='candidateA';
 const r1b=join(rev1,'review.dry-b.json'),r2b=join(rev2,'review.dry-b.json');
 await writeFile(r1b,JSON.stringify(mk(1,'Y_PREFERRED')));await writeFile(r2b,JSON.stringify(mk(2,'X_PREFERRED')));
 const v1=u(r1b),v2=u(r2b);
 const agreeB=v1.preferredRun===key.candidateB&&v2.preferredRun===key.candidateB;
 const r1c=join(rev1,'review.dry-c.json');
 await writeFile(r1c,JSON.stringify(mk(1,'BOTH_NOT_YET')));
 const u3=u(r1c);
 add('unblind-resolves-mirrored-reviews',agreeA&&agreeB&&u3.preferredRun===null,{caseA:'r1=X/r2=Y -> candidateA',caseB:'r1=Y/r2=X -> candidateB',noPreferenceVerdict:u3.verdict});
}

// 7+8) frozen infrastructure equality against the v1.1 package
const v11=resolve(kit,'..','PGA_AB_BENCHMARK_v1_1');
let v11ok=true;try{await readdir(v11);}catch{v11ok=false;}
if(!v11ok){
 add('evaluate-rules-unchanged-vs-v1.1',null,'v1.1 package not found next to v1.2');
 add('frozen-materials-identical-to-v1.1',null,'v1.1 package not found next to v1.2');
}else{
 add('evaluate-rules-unchanged-vs-v1.1',await shaFile(join(v11,'organizer/evaluate.mjs'))===await shaFile(join(kit,'organizer/evaluate.mjs')));
 const frozenDirs=['public','fixtures','runner','protocol','organizer/controls','evidence'];
 // organizer/self-test.mjs is reviewer-infrastructure in v1.2 (blind-export now checks reviewer-1/2).
 const frozenFiles=['organizer/preflight.mjs','organizer/prepare.mjs','organizer/reproduce-regressions.mjs','organizer/readiness-probes.mjs','organizer/build-materials.mjs','prompts/A.md','prompts/A-commands.md','prompts/D.md','prompts/D-commands.md','prompts/organizer.md','README_CN.md','PROMPTS_CN.md','FROZEN_MATERIALS_V1.json','UPSTREAM_V1_SHA256SUMS.json'];
 let diff=null,compared=0;
 for(const d of frozenDirs){
  const a=await hashTree(join(v11,d)),b=await hashTree(join(kit,d));compared+=Object.keys(a).length;
  const ra=Object.keys(a),rb=Object.keys(b);
  if(ra.length!==rb.length||ra.some(k=>a[k]!==b[k])){diff=d;break;}
 }
 for(const f of frozenFiles){compared++;
  try{if(await shaFile(join(v11,f))!==await shaFile(join(kit,f))){diff=diff||f;}}
  catch{diff=diff||f+' (missing)';}
 }
 add('frozen-materials-identical-to-v1.1',!diff,{filesCompared:compared,differsAt:diff});
}

const failed=results.filter(r=>r.status==='FAIL');
const summary={schema:'pga-reviewer-self-test/1',status:failed.length?'FAIL':'PASS',tests:results.length,failed:failed.map(f=>f.id),
 results,scope:'Reviewer isolation, mirrored balance, key secrecy, schema, unblinding, frozen equality vs v1.1. No model calls, no aesthetic judgment.'};
await writeJson(join(out,'reviewer-self-test.json'),summary);
console.log(JSON.stringify({status:summary.status,tests:summary.tests,failed:summary.failed,out:join(out,'reviewer-self-test.json')},null,2));
process.exit(failed.length?1:0);
