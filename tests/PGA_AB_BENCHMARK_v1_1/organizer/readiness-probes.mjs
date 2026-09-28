#!/usr/bin/env node
// Behavioral readiness probes derived from the independent review.
// PASS requires the intended behavior. Unknown API/fault-hook changes are UNVERIFIED, not success.
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {checkCrashRetry} from './crash-retry-v1_1.mjs';
const root=resolve(process.argv[2]),out=resolve(process.argv[3]);await mkdir(out,{recursive:true});
const imp=p=>import(pathToFileURL(join(root,p)).href);
const {StudioStore}=await imp('src/adapters/studio-store.js');
const original=JSON.parse(await readFile(join(root,'examples/studio/terminal.studio.json'),'utf8'));
const results=[],options={generator:'benchmark-preflight',toolVersion:'preflight/1'};
const attempt=async fn=>{try{return{ok:true,value:await fn()};}catch(e){return{ok:false,code:e.code??e.name,message:e.message};}};
async function ws(){const dir=await mkdtemp(join(out,'case-'));return{dir,...await StudioStore.create(dir,structuredClone(original),options)};}
async function run(id,fn){try{const r=await fn();results.push({id,...r,status:r.pass?'PASS':r.unverified?'UNVERIFIED':'FAIL'});}catch(e){results.push({id,status:'UNVERIFIED',error:e.stack});}}
for(const [op,field,value]of [['material.set','material','flat'],['ramp.set','ramp','amber']]){
 await run('explore-commit-'+op,async()=>{
  const{store}=await ws(),r=await store.explore({baseRevision:'r1',spec:{id:op,target:'terminal.shell',field,values:[value]}});
  const c=r.candidates[0];if(c.status!=='OK')return{pass:false,reason:'Valid control did not create OK candidate',candidate:c};
  const accepted=await attempt(()=>store.commit({action:'accept',candidateId:c.candidateId,expectedHead:'r1'}));
  return{pass:accepted.ok,accepted};
 });
}
await run('stale-history',async()=>{
 const{dir,store:a}=await ws(),b=await StudioStore.open(dir,options);
 const ca=await a.edit({baseRevision:'r1',operation:{id:'geometry.set',target:'terminal.shell',params:{w:28}}});
 const cb=await b.edit({baseRevision:'r1',operation:{id:'geometry.set',target:'terminal.shell',params:{w:24}}});
 const commit=await a.commit({action:'accept',candidateId:ca.candidateId,expectedHead:'r1'});
 const file=join(dir,'revisions',commit.revision+'.json'),before=await readFile(file,'utf8');
 const stale=await attempt(()=>b.commit({action:'accept',candidateId:cb.candidateId,expectedHead:'r1'}));
 return{pass:!stale.ok&&stale.code==='STALE_REVISION'&&before===await readFile(file,'utf8'),stale};
});
await run('crash-retry',async()=>checkCrashRetry({StudioStore,document:original,options,root,out}));
await run('authoritative-protection',async()=>{
 const{dir,store}=await ws(),c=await store.edit({baseRevision:'r1',operation:{id:'geometry.set',target:'terminal.screen',params:{w:10}}});
 if(c.status!=='REJECTED')return{pass:false,reason:'Protected edit not rejected at creation.'};
 const p=join(dir,'candidates',c.candidateId+'.json'),record=JSON.parse(await readFile(p,'utf8'));
 record.preserve=[];record.checks.status='OK';record.checks.code=null;record.checks.conflicts=[];await writeFile(p,JSON.stringify(record));
 const r=await attempt(()=>store.commit({action:'accept',candidateId:c.candidateId,expectedHead:'r1'}));
 const head=JSON.parse(await readFile(join(dir,'head.json'),'utf8'));
 return{pass:!r.ok&&head.head==='r1',commit:r};
});
await run('invalid-preserve',async()=>{
 const{dir,store}=await ws();
 const r=await attempt(()=>store.edit({baseRevision:'r1',operation:{id:'geometry.set',target:'terminal.shell',params:{w:28}},preserve:[{kind:'pixel',target:'terminal.shell'}]}));
 const explicit=!r.ok&&/INVALID|UNSUPPORTED|PROTECT|CONSTRAINT/.test(r.code);
 return{pass:explicit,result:r};
});
await run('request-path-boundary',async()=>{
 const{dir,store}=await ws(),name='outside-'+basename(dir),p=join(out,name+'.json');
 const r=await attempt(()=>store.edit({baseRevision:'r1',operation:{id:'geometry.set',target:'terminal.shell',params:{w:28}},requestId:'../../'+name}));
 let exists=false;try{await readFile(p);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
 return{pass:!r.ok&&/INVALID|UNSAFE|PATH/.test(r.code)&&!exists,result:r,outsideFileExists:exists};
});
await run('metadata-only-protection',async()=>{
 const d=JSON.parse(await readFile(join(root,'examples/studio/rustclaw.studio.json'),'utf8'));
 d.poses=[d.poses.find(p=>p.id==='stand_fwd')];d.clips={};d.constraints=[{kind:'metadata',target:'attachments.head'}];
 const dir=await mkdtemp(join(out,'character-')),{store}=await StudioStore.create(dir,d,options);
 const candidate=await attempt(()=>store.edit({baseRevision:'r1',operation:{id:'art.set',target:'head',value:['.'.repeat(d.art.head[0].length),...d.art.head]}}));
 if(!candidate.ok)return{pass:/PROTECT|CONSTRAINT|CANDIDATE_INVALID/.test(candidate.code),unverified:!/PROTECT|CONSTRAINT|CANDIDATE_INVALID/.test(candidate.code),candidate};
 const c=candidate.value;
 const commit=await attempt(()=>store.commit({action:'accept',candidateId:c.candidateId,expectedHead:'r1'}));
 const head=JSON.parse(await readFile(join(dir,'head.json'),'utf8'));
 return{pass:c.status==='REJECTED'&&!commit.ok&&head.head==='r1',candidateStatus:c.status,commit};
});
await run('pixel-not-channel-count',async()=>{
 const d=JSON.parse(await readFile(join(root,'examples/studio/rustclaw.studio.json'),'utf8'));
 d.poses=d.poses.filter(p=>p.kind==='rig');const ids=new Set(d.poses.map(p=>p.id));d.clips=Object.fromEntries(Object.entries(d.clips).filter(([,c])=>c.frames.every(f=>ids.has(f))));
 const{compileCharacterDocument,checkCharacterCandidate}=await imp('src/studio/character-compiler.js');
 const{applyCharacterOperation}=await imp('src/studio/character-ops.js');
 const base=compileCharacterDocument(d),edit=applyCharacterOperation(d,{id:'palette.set',target:'V',value:'#ffd23d'}),next=compileCharacterDocument(edit.doc);
 const checks=checkCharacterCandidate({baseCompiled:base,candidateCompiled:next,plan:edit.plan,preserve:[]});
 let n=0;for(let j=0;j<base.asset.frames.length;j++){const a=base.asset.frames[j].rgba,b=next.asset.frames[j].rgba;for(let i=0;i<a.length;i+=4)if([0,1,2,3].some(c=>a[i+c]!==b[i+c]))n++;}
 return{pass:checks.totalDiffPixels===n,reported:checks.totalDiffPixels,actual:n};
});
await writeFile(join(out,'results.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));process.exitCode=results.length===9&&results.every(r=>r.status==='PASS')?0:1;
