#!/usr/bin/env node
// Independent hard-constraint evaluator, intentionally not an aesthetic scorer.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {args,readJson,writeJson,readAsset,compileDoc,buildA,assetHash,stable,loadApi,display,fingerprint} from '../runner/common.mjs';
export async function evaluate({repo,kit,run,out}){
 const cfg=await readJson(join(run,'run.json')),task=await readJson(join(kit,'public/tasks',cfg.task,'task.json')),checks=[],add=(name,pass,details=null)=>checks.push({name,pass,details});
 add('frozen_repository',cfg.repositoryFingerprint===await fingerprint(repo));
 const base=await readAsset(join(kit,'public/tasks',cfg.task,'baseline')),submitted=await readAsset(join(run,'final'));
 const build=async()=>cfg.arm==='A'?await buildA(repo,join(run,'final/source.mjs')):(await compileDoc(repo,await readJson(join(run,'final/source.studio.json')))).asset;
 const final=await build(),again=await build();add('deterministic_rebuild',assetHash(final)===assetHash(again));add('submitted_equals_rebuild',assetHash(final)===assetHash(submitted));
 add('asset_identity',final.id===base.id&&final.seed===base.seed&&final.kind===base.kind);
 add('frame_ids',stable(final.frames.map(f=>f.id))===stable(base.frames.map(f=>f.id)));
 add('clips',stable(final.clips)===stable(base.clips));
 const frames=[],api=await loadApi(repo);let total=0,alphaTotal=0;
 await mkdir(out,{recursive:true});
 for(const b of base.frames){
  const f=final.frames.find(x=>x.id===b.id);if(!f){add('frame_present:'+b.id,false);continue;}
  const sized=f.width===b.width&&f.height===b.height;add('dimensions:'+b.id,sized);if(!sized)continue;
  add('anchor:'+b.id,stable(f.anchor)===stable(b.anchor));add('attachments:'+b.id,stable(f.attachments)===stable(b.attachments));
  const mask=new Uint8Array(await readFile(join(kit,'public/tasks',cfg.task,'allowed-mask.'+b.id+'.bin')));
  if(mask.length!==b.width*b.height)throw Error('Corrupt organizer mask.');
  let changed=0,outside=0,alpha=0;const diff=new Uint8ClampedArray(f.rgba.length);
  for(let p=0;p<mask.length;p++){
   const i=p*4,d=[0,1,2,3].some(c=>b.rgba[i+c]!==f.rgba[i+c]);if(b.rgba[i+3]!==f.rgba[i+3])alpha++;
   if(d){changed++;if(!mask[p])outside++;diff[i]=255;diff[i+1]=mask[p]?180:0;diff[i+2]=mask[p]?0:80;}
   else for(let c=0;c<3;c++)diff[i+c]=Math.round(b.rgba[i+c]*0.22);
   diff[i+3]=255;
  }
  total+=changed;alphaTotal+=alpha;add('protected_pixels:'+b.id,outside===0,{outsidePixels:outside});
  if(task.preserveAlpha)add('alpha:'+b.id,alpha===0);
  if(cfg.task==='T06')add('each_frame_edited:'+b.id,changed>0);
  frames.push({id:b.id,changedPixels:changed,alphaChangedPixels:alpha,outsideAllowedPixels:outside});
  const v=display({width:f.width,height:f.height,rgba:diff},4);await writeFile(join(out,b.id+'.diff.png'),api.encodePNG(v.width,v.height,v.rgba));
 }
 add('nontrivial_edit',total>=task.minChanges,{changedPixels:total,minimum:task.minChanges});
 if(task.minAlphaChanges)add('silhouette_changed',alphaTotal>=task.minAlphaChanges,{alphaChangedPixels:alphaTotal,minimum:task.minAlphaChanges});
 if(cfg.task==='T05'&&cfg.arm==='D'){
  const d=await readJson(join(run,'final/source.studio.json')),start=await readJson(join(kit,'fixtures/D/T05/initial.studio.json'));
  add('five_original_component_types',stable(d.nodes.map(n=>[n.id,n.kind]).sort())===stable(start.nodes.map(n=>[n.id,n.kind]).sort()));
 }
 const result={schema:'pga-benchmark-evaluation/1',task:cfg.task,arm:cfg.arm,repeat:cfg.repeat,mode:cfg.mode,
  technicalStatus:checks.every(c=>c.pass)?'PASS':'FAIL',checks,frames,totalChangedPixels:total,
  visualStatus:'UNVERIFIED',protocolAdherence:'UNVERIFIED',budgetStatus:'UNVERIFIED',
  limitations:['Not an aesthetic judgment.','Host transcript must verify tools, budget and vision use.','A source component-count compliance needs review.','Run candidate code only in a trusted isolated environment.']};
 await writeJson(join(out,'technical.json'),result);return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const o=args();if(!o.repo||!o.run||!o.out)throw Error('Usage: --repo PATH --run TRIAL_DIR --out NEW_REPORT_DIR');
 const kit=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 try{const r=await evaluate({repo:resolve(o.repo),kit,run:resolve(o.run),out:resolve(o.out)});console.log(JSON.stringify(r,null,2));process.exitCode=r.technicalStatus==='PASS'?0:2;}
 catch(e){await writeJson(join(resolve(o.out),'technical.json'),{technicalStatus:'ERROR',visualStatus:'UNVERIFIED',error:e.stack});console.error(e.stack);process.exitCode=3;}
}
