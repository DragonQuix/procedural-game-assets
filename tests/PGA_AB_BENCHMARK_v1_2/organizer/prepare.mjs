#!/usr/bin/env node
// Creates a participant-only directory. Never mount the master kit in the participant session.
import {mkdir,cp,copyFile,writeFile,readdir,readFile} from 'node:fs/promises';
import {join,resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {args,readJson,writeJson,fingerprint} from '../runner/common.mjs';
const o=args(),kit=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!o.repo||!/^T0[1-6]$/.test(o.task)||!['A','D'].includes(o.arm)||!o.out)throw Error('Usage: --repo PATH --task T01 --arm A|D --out EMPTY_DIR [--repeat 1] [--mode smoke|scored --readiness FILE]');
const repo=resolve(o.repo),out=resolve(o.out),mode=o.mode??'smoke',hash=await fingerprint(repo);
if(!['smoke','scored'].includes(mode))throw Error('Unknown mode.');
if(mode==='scored'){
 if(!o.readiness)throw Error('Scored trials need --readiness preflight/readiness.json');
 const r=await readJson(resolve(o.readiness));if(r.status!=='READY_TECHNICAL'||r.repositoryFingerprint!==hash)throw Error('Readiness does not match this repository or is not passing.');
}
try{if((await readdir(out)).length)throw Error('Output directory is not empty.');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(out,{recursive:true});await cp(join(kit,'public/tasks',o.task),join(out,'input'),{recursive:true});
await cp(join(kit,'public/common'),join(out,'common'),{recursive:true});
await cp(join(kit,'runner/common.mjs'),join(out,'_runner/common.mjs'),{recursive:true});
await copyFile(join(kit,'runner/run.mjs'),join(out,'run.mjs'));
await cp(join(kit,'fixtures',o.arm,o.task),out,{recursive:true});
const tk=join(out,'toolkit');await mkdir(tk,{recursive:true});
await copyFile(join(repo,'package.json'),join(tk,'package.json'));
await cp(join(repo,'src'),join(tk,'src'),{recursive:true,filter:(src)=>{
 const r=relative(join(repo,'src'),src).replaceAll('\\','/');
 return o.arm==='D'||!(r==='studio'||r.startsWith('studio/')||r.startsWith('adapters/studio-'));
}});
await mkdir(join(tk,'bin'),{recursive:true});
if(o.arm==='D')await copyFile(join(repo,'bin/pga-studio.mjs'),join(tk,'bin/pga-studio.mjs'));
let dep=join(repo,'node_modules/pngjs');try{await readdir(dep);}catch{dep=join(repo,'skills/procedural-game-assets/assets/toolkit/node_modules/pngjs');}
await mkdir(join(tk,'node_modules'),{recursive:true});await cp(dep,join(tk,'node_modules/pngjs'),{recursive:true});
const cfg={schema:'pga-benchmark-run/1',task:o.task,arm:o.arm,repeat:Number(o.repeat??1),mode,repositoryFingerprint:hash,maxRenderedStates:12};
await writeJson(join(out,'run.json'),cfg);
await writeFile(join(out,'PROMPT.md'),await readFile(join(kit,'prompts',o.arm+'.md'),'utf8'));
await writeFile(join(out,'REPORT.md'),'# Participant report\n\nStatus: NOT_STARTED\n\nRecord rendered states, actual images viewed, changes, limitations, unverified items, and transcript availability. Do not invent token or cost counts.\n');
await writeFile(join(out,'HOW_TO.md'),await readFile(join(kit,'prompts',o.arm+'-commands.md'),'utf8'));
if(o.arm==='D'){
 const r=spawnSync(process.execPath,[join(tk,'bin/pga-studio.mjs'),'create','--doc',join(out,'initial.studio.json'),'--out',join(out,'studio')],{cwd:out,encoding:'utf8'});
 await mkdir(join(out,'logs'),{recursive:true});await writeFile(join(out,'logs/setup.json'),r.stdout??'');if(r.status!==0)throw Error('D initialization failed: '+r.stderr);
}
console.log(JSON.stringify({out,task:o.task,arm:o.arm,mode,prompt:join(out,'PROMPT.md')},null,2));
