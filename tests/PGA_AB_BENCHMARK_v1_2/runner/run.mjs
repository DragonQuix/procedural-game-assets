#!/usr/bin/env node
// Participant entrypoint. Logs use, but does not provide a security or budget sandbox.
import {readFile,writeFile,mkdir,appendFile,readdir,copyFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readJson,writeJson,buildA,compileDoc,writeAsset,assetHash,safe} from './_runner/common.mjs';
const root=dirname(fileURLToPath(import.meta.url)),cfg=await readJson(join(root,'run.json')),repo=join(root,'toolkit');
const argv=process.argv.slice(2),cmd=argv.shift();
await mkdir(join(root,'logs'),{recursive:true});
async function log(v){await appendFile(join(root,'logs','events.jsonl'),JSON.stringify({time:new Date().toISOString(),...v})+'\n');}
async function current(){
 if(cfg.arm==='A')return {asset:await buildA(repo,join(root,'candidate.mjs')),source:join(root,'candidate.mjs')};
 const head=await readJson(join(root,'studio/head.json'));safe(head.head);
 const rec=await readJson(join(root,'studio/revisions',head.head+'.json'));
 return {asset:(await compileDoc(repo,rec.doc)).asset,doc:rec.doc,revision:head.head};
}
try{
 if(cmd==='studio'){
  if(cfg.arm!=='D')throw Error('Studio is not allowed in arm A.');
  const verb=argv[0];if(!['state','inspect','edit','explore','commit','export'].includes(verb))throw Error('Use only state/inspect/edit/explore/commit/export; r1 is already initialized.');
  if(argv.includes('--doc'))throw Error('No direct document recompilation in D after initialization.');
  if(!argv.includes('--ws'))argv.push('--ws',join(root,'studio'));
  const started=Date.now(),r=spawnSync(process.execPath,[join(repo,'bin/pga-studio.mjs'),...argv],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
  let parsed=null;try{parsed=JSON.parse(r.stdout);}catch{}
  await log({kind:'studio',argv,exitCode:r.status,durationMs:Date.now()-started,stdout:r.stdout,stderr:r.stderr,result:parsed,error:r.error?.message??null});
  process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');process.exitCode=r.status??1;
 }else if(cmd==='render'||cmd==='submit'){
  const started=Date.now(),v=await current(),h=assetHash(v.asset);
  let out;
  if(cmd==='render'){
   const parent=join(root,'previews');await mkdir(parent,{recursive:true});
   const i=(await readdir(parent)).filter(s=>s.startsWith('state-')).length+1;out=join(parent,'state-'+String(i).padStart(3,'0'));
  }else out=join(root,'final');
  try{await readdir(out);throw Error('Output already exists: '+out+'; do not overwrite a submitted result.');}catch(e){if(e.code!=='ENOENT')throw e;}
  await writeAsset(repo,v.asset,out);
  if(cfg.arm==='A')await copyFile(v.source,join(out,'source.mjs'));else await writeJson(join(out,'source.studio.json'),v.doc);
  if(cmd==='submit')await writeJson(join(out,'submission.json'),{...cfg,revision:v.revision??null,artifactHash:h,note:'Budget, tool access and vision use need host transcript verification.'});
  await log({kind:cmd,assetHash:h,revision:v.revision??null,out,durationMs:Date.now()-started});
  console.log(JSON.stringify({ok:true,out,assetHash:h,viewer:join(out,'viewer.html')},null,2));
 }else throw Error('Usage: node run.mjs render | submit | studio <verb> [options]');
}catch(e){await log({kind:'error',command:[cmd,...argv],message:e.message});console.error(e.stack);process.exitCode=1;}
