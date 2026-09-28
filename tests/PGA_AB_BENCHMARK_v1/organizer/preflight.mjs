#!/usr/bin/env node
// Compatibility and technical readiness, not proof of visual quality or agent benefit.
import {mkdir,readdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {args,readJson,writeJson,buildA,compileDoc,assetHash,fingerprint} from '../runner/common.mjs';
const o=args(),kit=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!o.repo||!o.out)throw Error('Usage: --repo PATH --out NEW_DIR [--run-tests]');
const repo=resolve(o.repo),out=resolve(o.out);await mkdir(out,{recursive:true});
const equality=[];
for(let i=1;i<=6;i++){const task='T0'+i;try{
 const a=await buildA(repo,join(kit,'fixtures/A',task,'candidate.mjs')),d=(await compileDoc(repo,await readJson(join(kit,'fixtures/D',task,'initial.studio.json')))).asset;
 const proof=await readJson(join(kit,'public/tasks',task,'baseline-proof.json'));
 equality.push({task,equal:assetHash(a)===assetHash(d),frozenBaselineMatches:assetHash(a)===proof.hashA});
}catch(e){equality.push({task,error:e.stack});}}
const r=spawnSync(process.execPath,[join(kit,'organizer/readiness-probes.mjs'),repo,join(out,'regressions')],{encoding:'utf8',maxBuffer:16*1024*1024});
await writeFile(join(out,'regressions.log'),(r.stdout??'')+(r.stderr??''));
let probes=[];try{probes=await readJson(join(out,'regressions/results.json'));}catch{}
let tests={status:'NOT_RUN'};
if(o['run-tests']){
 const files=[];async function walk(d){for(const e of await readdir(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())await walk(p);else if(e.name.endsWith('.test.js'))files.push(p);}}await walk(join(repo,'tests'));
 const t=spawnSync(process.execPath,['--test',...files.sort()],{cwd:repo,encoding:'utf8',maxBuffer:32*1024*1024});
 await writeFile(join(out,'npm-equivalent-tests.log'),(t.stdout??'')+(t.stderr??''));tests={status:t.status===0?'PASS':'FAIL',exitCode:t.status,testFiles:files.length,error:t.error?.message??null};
}
const ok=equality.length===6&&equality.every(e=>e.equal&&e.frozenBaselineMatches)&&r.status===0&&probes.length===9&&probes.every(p=>p.status==='PASS')&&tests.status==='PASS';
const result={schema:'pga-benchmark-readiness/1',status:ok?'READY_TECHNICAL':'NOT_READY',repositoryFingerprint:await fingerprint(repo),equality,tests,
 probeStatus:r.status,probes,scope:'Frozen baseline + previous 9 regression probes + project tests; does not establish art quality.',
 caveat:'These probes target the supplied 0.6.0 API. A changed implementation can need an explicit adapter. Setup errors are NOT proof of a product defect or of a fix. Review outcomes, never silently bypass.'};
await writeJson(join(out,'readiness.json'),result);console.log(JSON.stringify({status:result.status,equality,tests,probeStatus:r.status},null,2));process.exitCode=ok?0:2;
