import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readAsset, assetHash, compileDoc, buildA, viewerHtml } from '../../PGA_AB_BENCHMARK_v1_2/runner/common.mjs';
import { compileAny, applyAnyOperation, checkAnyCandidate, preserveFromAnyDocument } from '../../../src/studio/dispatch.js';
import { stableStringify, fnv1aHex } from '../../../src/studio/document.js';
import { encodePNG } from '../../../src/export/png.js';

const out=path.dirname(fileURLToPath(import.meta.url)), host=path.dirname(out), repo=path.resolve(host,'../..');
const kit=path.join(repo,'tests/PGA_AB_BENCHMARK_v1_2'), runsDir=path.join(host,'runs-v1_2'), reviewsDir=path.join(host,'reviews-v1_2-scored');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const seen=new Map();
function read(p){const b=fs.readFileSync(p),s=fs.statSync(p);seen.set(p,{path:p,sha256:sha(b),bytes:b.length,mtime:s.mtime.toISOString()});return b;}
const json=p=>JSON.parse(read(p).toString('utf8'));
const hash=p=>sha(read(p));
const write=(name,data)=>fs.writeFileSync(path.join(out,name),typeof data==='string'?data:JSON.stringify(data,null,2)+'\n');
const walk=d=>fs.existsSync(d)?fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]):[];
const rel=(p,d=repo)=>path.relative(d,p).replaceAll('\\','/');
const tally=a=>a.reduce((s,x)=>(s[x]=(s[x]||0)+1,s),{});
const same=(a,b)=>stableStringify(a)===stableStringify(b);
const csv=(name,rows,cols=Object.keys(rows[0]||{}))=>write(name,cols.join(',')+'\n'+rows.map(r=>cols.map(k=>'"'+String(r[k]===null||r[k]===undefined?'':typeof r[k]==='object'?JSON.stringify(r[k]):r[k]).replaceAll('"','""')+'"').join(',')).join('\n')+'\n');
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
const environment={branch:git('branch','--show-current'),commit:git('rev-parse','HEAD'),status:git('status','--short'),sourceHistory:git('log','4fd4330..HEAD','--format=%h %aI %s','--','src','bin','package.json','tests/PGA_AB_BENCHMARK_v1_2'),node:process.version};
const inventory=walk(host).filter(p=>!p.startsWith(out+path.sep)&&/^(runs-v1_2\/|reviews-v1_2-scored\/|eval-v1_2\/|preflight-v1_2\/|archives-v1_2\/|handoff\/|preregistration-v1_2|v1_2-freeze|scored-)/.test(rel(p,host)));
write('initial-experiment-inventory.json',inventory.map(p=>{hash(p);return seen.get(p);}));
const prereg=json(path.join(host,'preregistration-v1_2-frozen.json'));
const frozen=json(path.join(host,'v1_2-freeze-manifest.json'));
const executionPath=path.join(runsDir,'execution-freeze-manifest.json'), execution=json(executionPath);
const checks=[];
function verify(label,p,expected){const actual=fs.existsSync(p)?hash(p):'MISSING';checks.push({label,path:p,expected,actual,pass:actual===expected});}
for(const [p,h] of Object.entries(frozen.files))verify('freeze',p.startsWith('PGA_AB_')?path.join(repo,'tests',p):path.join(host,p),h);
for(const [p,h] of Object.entries(json(path.join(kit,'SHA256SUMS.json')).files))verify('kit',path.join(kit,p),h);
for(const file of fs.readdirSync(path.join(host,'archives-v1_2'))){const original=file==='execution-freeze-manifest.json'?executionPath:path.join(host,file);if(fs.existsSync(original))verify('archive',path.join(host,'archives-v1_2',file),hash(original));}
// Reimplement the frozen source fingerprint, including its localeCompare ordering.
const fp=crypto.createHash('sha256');
function fpwalk(dir,base=''){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const r=base?base+'/'+e.name:e.name;if(e.isDirectory())fpwalk(path.join(dir,e.name),r);else {fp.update(r);fp.update(read(path.join(dir,e.name)));}}}
fpwalk(path.join(repo,'src'));fp.update(read(path.join(repo,'package.json')));
checks.push({label:'sourceFingerprint',expected:prereg.repositoryFingerprint,actual:fp.digest('hex')});checks.at(-1).pass=checks.at(-1).expected===checks.at(-1).actual;
verify('execution-prereg',path.join(host,'preregistration-v1_2-frozen.json'),execution.preregistrationSha256);
const required=['preregistration-v1_2-frozen.json','v1_2-freeze-manifest.json','preflight-v1_2/readiness.json','runs-v1_2/execution-freeze-manifest.json','runs-v1_2','eval-v1_2','reviews-v1_2-scored','scored-analysis-v1_2.json','scored-summary-v1_2.csv','archives-v1_2/scored-report-v1_2.md','handoff/gen-analysis.mjs'].map(p=>({path:path.join(host,p),status:fs.existsSync(path.join(host,p))?'PRESENT':'MISSING'}));
const runRows=[], operations=[], candidateAudits=[], revisionAudits=[], t05=[];
const allExpected=[];
for(const task of prereg.tasks)for(let repeat=1;repeat<=3;repeat++)for(const arm of ['A','D'])allExpected.push(`${task}-${arm}-r${repeat}`);
function comparePixels(base,final,task){return base.frames.map(b=>{const f=final.frames.find(f=>f.id===b.id),mask=read(path.join(kit,'public/tasks',task,`allowed-mask.${b.id}.bin`));let changed=0,alpha=0;const outside=[];
 for(let p=0;p<mask.length;p++){const i=p*4,d=[0,1,2,3].some(c=>b.rgba[i+c]!==f.rgba[i+c]);if(d){changed++;if(!mask[p])outside.push({x:p%b.width,y:Math.floor(p/b.width),before:Array.from(b.rgba.slice(i,i+4)),after:Array.from(f.rgba.slice(i,i+4))});}if(b.rgba[i+3]!==f.rgba[i+3])alpha++;}
 return {frame:b.id,changedPixels:changed,alphaChangedPixels:alpha,outOfBoundsPixels:outside.length,outside,anchor:same(b.anchor,f.anchor),attachments:same(b.attachments,f.attachments),size:b.width===f.width&&b.height===f.height};});}
for(const id of allExpected){
 const dir=path.join(runsDir,id),cfg=json(path.join(dir,'run.json')),ev=json(path.join(host,'eval-v1_2',id,'technical.json')),report=read(path.join(dir,'REPORT.md')).toString();
 const freeze=execution.runs.find(r=>r.trialId===id),sub=json(path.join(dir,'final/submission.json'));
 checks.push({label:id+':slot',pass:`${cfg.task}-${cfg.arm}-r${cfg.repeat}`===id&&cfg.mode==='scored'&&cfg.repositoryFingerprint===prereg.repositoryFingerprint&&cfg.maxRenderedStates===12&&freeze.repositoryFingerprint===cfg.repositoryFingerprint});
 const source=path.join(dir,'final',cfg.arm==='A'?'source.mjs':'source.studio.json');
 verify(id+':source',source,freeze.sourceSha256);verify(id+':submission',path.join(dir,'final/submission.json'),freeze.submissionJsonSha256);
 verify(id+':prompt',path.join(dir,'PROMPT.md'),hash(path.join(kit,'prompts',cfg.arm+'.md')));
 verify(id+':runner',path.join(dir,'run.mjs'),hash(path.join(kit,'runner/run.mjs')));
 verify(id+':common',path.join(dir,'_runner/common.mjs'),hash(path.join(kit,'runner/common.mjs')));
 for(const p of walk(path.join(kit,'public/tasks',cfg.task)))verify(id+':input',path.join(dir,'input',rel(p,path.join(kit,'public/tasks',cfg.task))),hash(p));
 for(const p of walk(path.join(kit,'public/common')))verify(id+':common-input',path.join(dir,'common',rel(p,path.join(kit,'public/common'))),hash(p));
 for(const p of walk(path.join(dir,'toolkit')).filter(p=>!p.includes(path.sep+'node_modules'+path.sep)))verify(id+':toolkit',p,hash(path.join(repo,rel(p,path.join(dir,'toolkit')))));
 const sourceText=read(source).toString();
 const baseline=await readAsset(path.join(kit,'public/tasks',cfg.task,'baseline'));
 const final=await readAsset(path.join(dir,'final'));
 const rebuilt=cfg.arm==='D'?(await compileDoc(repo,json(source))).asset:await buildA(repo,source);
 const rebuilt2=cfg.arm==='D'?(await compileDoc(repo,json(source))).asset:await buildA(repo,source);
 const pixels=comparePixels(baseline,rebuilt,cfg.task);
 const taskConfig=json(path.join(kit,'public/tasks',cfg.task,'task.json'));
 const independentConditions={identity:rebuilt.id===baseline.id&&rebuilt.kind===baseline.kind&&rebuilt.seed===baseline.seed,frames:same(rebuilt.frames.map(f=>f.id),baseline.frames.map(f=>f.id)),clips:same(rebuilt.clips,baseline.clips),metadata:pixels.every(p=>p.anchor&&p.attachments&&p.size),protectedPixels:pixels.every(p=>p.outOfBoundsPixels===0),alpha:!taskConfig.preserveAlpha||pixels.every(p=>p.alphaChangedPixels===0),nontrivial:pixels.reduce((s,p)=>s+p.changedPixels,0)>=taskConfig.minChanges,silhouette:!taskConfig.minAlphaChanges||pixels.reduce((s,p)=>s+p.alphaChangedPixels,0)>=taskConfig.minAlphaChanges,eachAnimationFrame:cfg.task!=='T06'||pixels.every(p=>p.changedPixels>0),fiveComponentTypes:cfg.task!=='T05'||cfg.arm!=='D'||same(json(source).nodes.map(n=>[n.id,n.kind]).sort(),json(path.join(kit,'fixtures/D/T05/initial.studio.json')).nodes.map(n=>[n.id,n.kind]).sort()),determinism:assetHash(rebuilt)===assetHash(rebuilt2),submission:assetHash(rebuilt)===assetHash(final)};
 checks.push({label:id+':independent-technical',pass:(Object.values(independentConditions).every(Boolean)?'PASS':'FAIL')===ev.technicalStatus,conditions:independentConditions});
 const imageHashes=Object.fromEntries(final.frames.map(f=>[f.id,hash(path.join(dir,'final',f.id+'.native.png'))]));
 checks.push({label:id+':freeze-render',expected:freeze.finalNativeRenderSha256.split('|')[0],actual:imageHashes[final.frames[0].id],pass:imageHashes[final.frames[0].id]===freeze.finalNativeRenderSha256.split('|')[0]});
 const events=read(path.join(dir,'logs/events.jsonl')).toString().trim().split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
 const counts=tally(events.map(e=>e.kind==='studio'?'studio:'+e.argv[0]:e.kind));
 const errors=events.filter(e=>e.kind==='error'||(e.kind==='studio'&&(e.exitCode!==0||e.error)));
 for(const [i,e] of events.entries())operations.push({run:id,line:i+1,...e});
 const stateHashes=new Set(),baseHash=assetHash(baseline);let candidates=0,rejected=0,unchanged=0;
 for(const d of fs.readdirSync(path.join(dir,'previews')).filter(x=>x.startsWith('state-')))stateHashes.add(assetHash(await readAsset(path.join(dir,'previews',d))));
 if(cfg.arm==='D'){
  const records=walk(path.join(dir,'studio/candidates')).filter(p=>p.endsWith('.json'));
  candidates=records.length;
  for(const p of records){const c=json(p),b=json(path.join(dir,'studio/revisions',c.baseRevision+'.json')),bc=compileAny(b.doc),derived=applyAnyOperation(bc.document,c.operation),cc=compileAny(c.doc),preserve=[...preserveFromAnyDocument(bc.document),...c.preserveRequest],recheck=checkAnyCandidate({baseCompiled:bc,candidateCompiled:cc,plan:derived.plan,preserve});
   stateHashes.add(assetHash(cc.asset));if(c.checks.status==='REJECTED')rejected++;if(c.checks.status==='UNCHANGED')unchanged++;
   const audit={run:id,candidate:c.candidateId,base:c.baseRevision,operation:c.operation,status:c.checks.status,recheck:recheck.status,docMatches:same(derived.doc,c.doc),idMatches:c.candidateId===`c-${fnv1aHex(stableStringify([c.baseRevision,c.operation,preserve]))}`,renderHashMatches:cc.hashes.renderHash===c.hashes.renderHash,checksMatch:same(recheck,c.checks),preserve,conflicts:c.checks.conflicts,diff:c.checks.diff};candidateAudits.push(audit);
   if(id==='T05-D-r1')t05.push({...audit,benchmark:comparePixels(baseline,cc.asset,cfg.task)});
  }
  for(const p of walk(path.join(dir,'studio/revisions')).filter(p=>p.endsWith('.json'))){const r=json(p);let expected=null;if(r.source.kind==='create')expected=compileAny(json(path.join(kit,'fixtures/D',cfg.task,'initial.studio.json'))).document;else if(r.source.kind==='accept')expected=json(path.join(dir,'studio/candidates',r.source.candidateId+'.json')).doc;else if(r.source.kind==='restore')expected=json(path.join(dir,'studio/revisions',r.source.from+'.json')).doc;revisionAudits.push({run:id,revision:r.revision,parent:r.parent,source:r.source,docMatches:expected!==null&&same(expected,r.doc),renderHashMatches:compileAny(r.doc).hashes.renderHash===r.hashes.renderHash});}
  const head=json(path.join(dir,'studio/head.json')),r=json(path.join(dir,'studio/revisions',sub.revision+'.json'));checks.push({label:id+':submit-revision',pass:same(r.doc,json(source)),head:head.head,submittedRevision:sub.revision});
 }
 stateHashes.add(assetHash(final));stateHashes.delete(baseHash);
 const technical=ev.technicalStatus==='ERROR'?'ERROR':ev.checks.length&&ev.checks.every(c=>c.pass)?'PASS':'FAIL';
 const frameAgreement=pixels.every(p=>{const f=ev.frames.find(f=>f.id===p.frame);return f&&f.changedPixels===p.changedPixels&&f.alphaChangedPixels===p.alphaChangedPixels&&f.outsideAllowedPixels===p.outOfBoundsPixels;});
 runRows.push({run:id,task:cfg.task,repeat:cfg.repeat,arm:cfg.arm,submitted:fs.existsSync(path.join(dir,'final/submission.json')),technical,declaredTechnical:ev.technicalStatus,protocolStatus:'UNVERIFIED_HOST_TRANSCRIPT',protocolArtifactStatus:'CHECKED_SEPARATELY',candidateBudget:stateHashes.size<=12?'PASS_RECORDED_STATES':'BUDGET_FAIL',changedPixels:pixels.reduce((s,p)=>s+p.changedPixels,0),outOfBoundsPixels:pixels.reduce((s,p)=>s+p.outOfBoundsPixels,0),metadataProtection:pixels.every(p=>p.anchor&&p.attachments&&p.size)&&same(baseline.clips,rebuilt.clips),candidateCount:stateHashes.size,candidateFiles:cfg.arm==='D'?candidates:null,unchangedCandidateRecords:cfg.arm==='D'?unchanged:null,rejectedCandidateRecords:cfg.arm==='D'?rejected:null,counts,errorCount:errors.length,errors,sourceSha256:hash(source),renderSha256:imageHashes,assetHash:assetHash(final),deterministic:assetHash(rebuilt)===assetHash(rebuilt2),submittedEqualsRebuild:assetHash(rebuilt)===assetHash(final),submissionHashMatches:sub.artifactHash===assetHash(final),technicalFrameAgreement:frameAgreement,failedChecks:ev.checks.filter(c=>!c.pass),firstEvent:events[0]?.time,lastEvent:events.at(-1)?.time,submitEvents:events.filter(e=>e.kind==='submit').map(e=>e.time),report,sourceImports:sourceText.match(/^import .+$/gm)||[],pixels});
}
const rawReviews=[],pairs=[],FIVE=['X_PREFERRED','Y_PREFERRED','NO_MEANINGFUL_DIFFERENCE','BOTH_NOT_YET','UNVERIFIED'];
const order=json(path.join(kit,'protocol/pair-order.json'));
for(const p of order){const id=`${p.task}-r${p.repeat}`,dir=path.join(reviewsDir,id),key=json(path.join(dir,'key.json'));
 const ca=crypto.createHash('sha256').update(`${key.mappingSeed}|${key.left}|${key.right}`).digest()[0]&1?key.left:key.right;
 checks.push({label:id+':key-mapping',pass:ca===key.candidateA&&key.reviewers[0].X===key.reviewers[1].Y&&key.reviewers[0].Y===key.reviewers[1].X&&key.reviewers[0].X!==key.reviewers[1].X});
 const armOf=p=>json(path.join(p,'run.json')).arm;
 const rr=[];
 for(let slot=1;slot<=2;slot++){
  const rid=`reviewer-${slot}`,d=path.join(dir,rid),r=json(path.join(d,'review.json')),template=json(path.join(d,'review.template.json')),map=key.reviewers.find(m=>m.reviewerId===rid),mapping={X:armOf(map.X),Y:armOf(map.Y)};
  const missing=Object.keys(template).filter(k=>!(k in r));const invalid=[];
  if(r.schema!=='pga-review/2'||r.task!==p.task||r.reviewerSlot!==slot)invalid.push('identity');
  if(!FIVE.includes(r.pairwiseResult))invalid.push('pairwiseResult');
  for(const label of ['X','Y']){if(!['MEETS','NOT_YET','UNVERIFIED'].includes(r.candidates?.[label]?.taskFit))invalid.push(label+'.taskFit');for(const k of ['topStrength','topConcern','blockingIssue'])if(!(k in (r.candidates?.[label]||{})))invalid.push(label+'.'+k);}
  if(!['LOW','MEDIUM','HIGH','UNVERIFIED'].includes(r.confidence))invalid.push('confidence');
  const pref=r.pairwiseResult==='X_PREFERRED'?mapping.X:r.pairwiseResult==='Y_PREFERRED'?mapping.Y:r.pairwiseResult;
  rr.push({pair:id,task:p.task,repeat:p.repeat,reviewer:rid,mapping,taskFit:{X:r.candidates.X.taskFit,Y:r.candidates.Y.taskFit},pairwiseResult:r.pairwiseResult,preference:pref,confidence:r.confidence,playbackViewed:r.playbackViewed,missing,invalid,raw:r,reviewSha256:hash(path.join(d,'review.json'))});
  verify(id+'/'+rid+':prompt',path.join(d,'PROMPT.md'),hash(path.join(kit,'prompts/reviewer.md')));
  verify(id+'/'+rid+':task',path.join(d,'TASK.md'),hash(path.join(kit,'public/tasks',p.task,'TASK.md')));
  for(const src of walk(path.join(kit,'public/tasks',p.task,'baseline')))verify(id+'/'+rid+':baseline',path.join(d,'baseline',rel(src,path.join(kit,'public/tasks',p.task,'baseline'))),hash(src));
  for(const src of walk(path.join(kit,'public/common')))verify(id+'/'+rid+':common',path.join(d,'common',rel(src,path.join(kit,'public/common'))),hash(src));
  const entries=[{label:'Start',asset:await readAsset(path.join(kit,'public/tasks',p.task,'baseline'))}];
  for(const label of ['X','Y']){const a=await readAsset(path.join(map[label],'final'));entries.push({label,asset:a});for(const f of a.frames)for(const s of ['native','dark','light'])verify(id+'/'+rid+':image-'+label,path.join(d,label,f.id+'.'+s+'.png'),hash(path.join(map[label],'final',f.id+'.'+s+'.png')));}
  checks.push({label:id+'/'+rid+':compareHtml',pass:read(path.join(d,'compare.html')).toString()===await viewerHtml(repo,entries)});
  const leaks=walk(d).filter(f=>/^(key\.json|source\.mjs|source\.studio\.json|run\.json|REPORT\.md|technical\.json)$/.test(path.basename(f)));checks.push({label:id+'/'+rid+':leak-files',pass:leaks.length===0,leaks});
 }
 rawReviews.push(...rr);pairs.push({pair:id,task:p.task,repeat:p.repeat,reviewers:rr});
}
function visual(fits){if(fits.includes('UNVERIFIED')||fits.some(f=>!['MEETS','NOT_YET'].includes(f)))return 'UNVERIFIED';if(fits.every(f=>f==='MEETS'))return 'PASS';if(fits.every(f=>f==='NOT_YET'))return 'NOT_YET';return 'DISAGREEMENT';}
function pairStatus(prefs){if(prefs.includes('UNVERIFIED'))return 'UNVERIFIED';if(prefs.every(x=>x==='A'))return 'CONSENSUS_A';if(prefs.every(x=>x==='D'))return 'CONSENSUS_D';if(prefs.every(x=>x==='NO_MEANINGFUL_DIFFERENCE'))return 'NO_MEANINGFUL_DIFFERENCE';if(prefs.every(x=>x==='BOTH_NOT_YET'))return 'BOTH_NOT_YET';return 'MIXED';}
function scenario({animation=false,fallback=true,hostGate=false}={}){
 const rows=[],matrix=[];
 for(const p of pairs){const reviews=p.reviewers.map(r=>({...r,invalidated:r.invalid.length>0||(!fallback&&r.missing.includes('allowedPairwiseResult'))||(animation&&r.task==='T06'&&!r.playbackViewed)}));
  const prefs=reviews.map(r=>r.invalidated?'UNVERIFIED':r.preference),pairResult=pairStatus(prefs),pr={};
  for(const arm of ['A','D']){const raw=runRows.find(r=>r.task===p.task&&r.repeat===p.repeat&&r.arm===arm),fits=reviews.map(r=>r.invalidated?'UNVERIFIED':r.taskFit[r.mapping.X===arm?'X':'Y']),v=visual(fits);
   let s=raw.technical!=='PASS'?'TECHNICAL_FAIL':!raw.submitted?'UNVERIFIED':raw.candidateCount>12?'BUDGET_FAIL':v==='PASS'?'PASS':v==='DISAGREEMENT'?'VISUAL_DISAGREEMENT':v==='NOT_YET'?'VISUAL_NOT_YET':'UNVERIFIED';if(hostGate&&s==='PASS')s='UNVERIFIED';
   pr[arm]={...raw,reviewerFits:fits,candidateVisualStatus:v,taskSuccess:s,taskSuccessBasis:'CONDITIONAL_ON_REPORTED_HOST_COMPLIANCE',auditTaskSuccess:s==='PASS'?'UNVERIFIED':s,pairResult};rows.push(pr[arm]);
  }
  matrix.push({pair:p.pair,task:p.task,repeat:p.repeat,A_technical:pr.A.technical,D_technical:pr.D.technical,A_visual:pr.A.candidateVisualStatus,D_visual:pr.D.candidateVisualStatus,A_success:pr.A.taskSuccess,D_success:pr.D.taskSuccess,reviewer1:prefs[0],reviewer2:prefs[1],pairResult});
 }
 const summary={A:tally(rows.filter(r=>r.arm==='A').map(r=>r.taskSuccess)),D:tally(rows.filter(r=>r.arm==='D').map(r=>r.taskSuccess)),visual:{A:tally(rows.filter(r=>r.arm==='A').map(r=>r.candidateVisualStatus)),D:tally(rows.filter(r=>r.arm==='D').map(r=>r.candidateVisualStatus))},pairResults:tally(matrix.map(r=>r.pairResult)),pairedSuccess:{bothPass:0,AOnly:0,DOnly:0,neitherPass:0},byTask:{}};
 for(const p of matrix)summary.pairedSuccess[p.A_success==='PASS'?(p.D_success==='PASS'?'bothPass':'AOnly'):(p.D_success==='PASS'?'DOnly':'neitherPass')]++;
 for(const task of prereg.tasks)summary.byTask[task]={A:rows.filter(r=>r.task===task&&r.arm==='A').map(r=>r.taskSuccess),D:rows.filter(r=>r.task===task&&r.arm==='D').map(r=>r.taskSuccess)};
 return {summary,rows,matrix};
}
const scenarios={A_frozen_field_rule:scenario(),B_animation_required:scenario({animation:true}),fallback_strict:scenario({fallback:false}),animation_and_fallback_strict:scenario({animation:true,fallback:false})};
const exact=(a,b)=>{const n=a+b;if(!n)return null;let term=2**(-n),sum=term;for(let i=1;i<=Math.min(a,b);i++){term*=((n-i+1)/i);sum+=term;}return Math.min(1,2*sum);};
const wilson=(x,n)=>{const z=1.959963984540054,d=1+z*z/n,c=(x/n+z*z/(2*n))/d,h=z*Math.sqrt(x/n*(1-x/n)/n+z*z/(4*n*n))/d;return [c-h,c+h];};
for(const s of Object.values(scenarios)){const m=s.summary.pairedSuccess,p=s.summary.pairResults,a=p.CONSENSUS_A||0,d=p.CONSENSUS_D||0;s.summary.statistics={mcnemarExactTwoSided:exact(m.AOnly,m.DOnly),consensusSignExactTwoSided:exact(a,d),A_successWilson95:wilson(s.summary.A.PASS||0,18),D_successWilson95:wilson(s.summary.D.PASS||0,18),A_consensusConditionalWilson95:a+d?wilson(a,a+d):null,note:'描述性；18 pairs 嵌套于 6 tasks，独立性近似，UNVERIFIED 不等于已证失败。'};}
const original=json(path.join(host,'scored-analysis-v1_2.json'));
const comparison={primary:same(original.primary.A,scenarios.A_frozen_field_rule.summary.A)&&same(original.primary.D,scenarios.A_frozen_field_rule.summary.D),pairs:same(original.secondary.pairLevelPreference,scenarios.A_frozen_field_rule.summary.pairResults),rowDifferences:[]};
for(const p of original.pairs)for(const arm of ['A','D']){const r=scenarios.A_frozen_field_rule.rows.find(r=>r.run===p.runs[arm].trialId);for(const k of ['technical','candidateVisualStatus','taskSuccess'])if(r[k]!==p.runs[arm][k])comparison.rowDifferences.push({run:r.run,field:k,old:p.runs[arm][k],new:r[k]});}
const cost={};for(const arm of ['A','D']){const rs=runRows.filter(r=>r.arm===arm),n=rs.map(r=>r.candidateCount).sort((a,b)=>a-b);cost[arm]={recordedUniqueCandidates:n.reduce((a,b)=>a+b,0),min:n[0],max:n.at(-1),median:(n[8]+n[9])/2,candidateFiles:rs.reduce((s,r)=>s+(r.candidateFiles||0),0),rejectedRecords:rs.reduce((s,r)=>s+(r.rejectedCandidateRecords||0),0),wrapperCalls:rs.reduce((s,r)=>s+Object.values(r.counts).reduce((a,b)=>a+b,0),0),counts:rs.reduce((s,r)=>{for(const [k,v]of Object.entries(r.counts))s[k]=(s[k]||0)+v;return s;},{}),loggedErrors:rs.reduce((s,r)=>s+r.errorCount,0),note:arm==='A'?'源文件编辑及包装器外渲染无完整宿主台账；候选为已保存产物下限。':'候选记录包含拒绝与重复；成本须区分渲染状态、调用和单字段操作。'};}
write('freeze-checks.json',{environment,required,executionManifestSha256:hash(executionPath),executionFrozenAt:execution.frozenAt,checks,failures:checks.filter(c=>!c.pass),observedSlots:fs.readdirSync(runsDir).filter(d=>/^T\d+-[AD]-r\d+$/.test(d)),expectedSlots:allExpected});
write('reviewer-mapping.json',rawReviews);
write('candidate-and-revision-audit.json',{candidates:candidateAudits,revisions:revisionAudits});
write('operation-ledger.json',operations);
write('t05-d-r1-reconstruction.json',t05);
write('sensitivity-analysis.json',Object.fromEntries(Object.entries(scenarios).map(([k,s])=>[k,{summary:s.summary,matrix:s.matrix,rows:s.rows.map(r=>({run:r.run,visual:r.candidateVisualStatus,taskSuccess:r.taskSuccess,reviewerFits:r.reviewerFits}))}])));
write('audit-results.json',{environment,technical:tally(runRows.map(r=>r.technical)),comparison,scenarios:Object.fromEntries(Object.entries(scenarios).map(([k,v])=>[k,v.summary])),cost,rows:scenarios.A_frozen_field_rule.rows});
csv('run-level-results.csv',scenarios.A_frozen_field_rule.rows,['run','task','repeat','arm','submitted','technical','protocolStatus','candidateBudget','changedPixels','outOfBoundsPixels','metadataProtection','candidateCount','candidateFiles','rejectedCandidateRecords','counts','errorCount','errors','sourceSha256','renderSha256','candidateVisualStatus','taskSuccess','taskSuccessBasis','auditTaskSuccess','reviewerFits','deterministic','submittedEqualsRebuild','technicalFrameAgreement']);
csv('paired-matrix.csv',scenarios.A_frozen_field_rule.matrix);
csv('reviewer-mapping.csv',rawReviews,['pair','reviewer','mapping','taskFit','pairwiseResult','preference','confidence','playbackViewed','missing','invalid']);
// Diagnostic image: baseline, submitted, allowed mask, delta. No asset edit.
const target=runRows.find(r=>r.run==='T05-D-r1'),b=(await readAsset(path.join(kit,'public/tasks/T05/baseline'))).frames[0],f=(await readAsset(path.join(runsDir,'T05-D-r1/final'))).frames[0],mask=read(path.join(kit,'public/tasks/T05/allowed-mask.beacon.bin'));
const scale=10,gap=4,W=(b.width*4+gap*3)*scale,H=b.height*scale,rgba=new Uint8ClampedArray(W*H*4);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const u=Math.floor(x/scale),v=Math.floor(y/scale),panel=Math.floor(u/(b.width+gap)),px=u%(b.width+gap),i=(y*W+x)*4;let c=[235,235,235];if(panel<4&&px<b.width){const p=v*b.width+px,j=p*4,bg=[40,43,49];if(panel<2){const q=panel?f:b;c=q.rgba[j+3]?Array.from(q.rgba.slice(j,j+3)):bg;}else if(panel===2)c=mask[p]?[245,245,245]:[25,25,25];else {const d=[0,1,2,3].some(k=>b.rgba[j+k]!==f.rgba[j+k]);c=d?(mask[p]?[255,180,0]:[255,0,80]):bg;}}rgba.set([...c,255],i);}
fs.writeFileSync(path.join(out,'t05-d-r1-diff.png'),encodePNG(W,H,rgba));
write('t05-d-r1-coordinates.json',target.pixels);
write('read-inputs.json',[...seen.values()].sort((a,b)=>a.path.localeCompare(b.path)));
console.log(JSON.stringify({checks:checks.length,hashFailures:checks.filter(c=>!c.pass),technical:tally(runRows.map(r=>r.technical)),comparison,scenarios:Object.fromEntries(Object.entries(scenarios).map(([k,v])=>[k,v.summary])),cost,candidateAuditFailures:candidateAudits.filter(c=>!c.docMatches||!c.idMatches||!c.renderHashMatches||!c.checksMatch),revisionAuditFailures:revisionAudits.filter(r=>!r.docMatches||!r.renderHashMatches)},null,2));
