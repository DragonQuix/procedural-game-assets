// Run by the organizer; writes public baseline assets and independent allowed masks.
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {args,readJson,writeJson,buildA,compileDoc,assetHash,writeAsset,loadApi,display,fingerprint} from '../runner/common.mjs';
const opt=args(),root=resolve(opt.repo??''),kit=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!opt.repo)throw Error('Usage: node organizer/build-materials.mjs --repo PATH');
const api=await loadApi(root),results=[];
for(let i=1;i<=6;i++){
 const id='T0'+i,task=await readJson(join(kit,'public/tasks',id,'task.json')),dir=join(kit,'public/tasks',id);
 const doc=await readJson(join(kit,'fixtures/D',id,'initial.studio.json')),compiled=await compileDoc(root,doc);
 const a=await buildA(root,join(kit,'fixtures/A',id,'candidate.mjs')),d=compiled.asset;
 if(assetHash(a)!==assetHash(d))throw Error(id+': A and D initial pixels or metadata differ.');
 await writeAsset(root,d,join(dir,'baseline'));
 const maskReport=[];
 for(const f of d.frames){
  const mask=new Uint8Array(f.width*f.height);
  if(task.allowedRectangles)for(const[x,y,w,h]of task.allowedRectangles)for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(xx>=0&&yy>=0&&xx<f.width&&yy<f.height)mask[yy*f.width+xx]=1;
  if(task.holes)for(const[x,y,w,h]of task.holes)for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(xx>=0&&yy>=0&&xx<f.width&&yy<f.height)mask[yy*f.width+xx]=0;
  if(task.maskMode==='opaque'){
    // Include only declared component masks, NOT all rendered differences.
    for(const target of task.targets){const m=compiled.masks[target];for(let y=0;y<doc.canvas.h;y++)for(let x=0;x<doc.canvas.w;x++)if(m[y*doc.canvas.w+x])mask[(y+1)*f.width+x+1]=1;}
    const protectedMask=compiled.masks[task.protectNode];for(let y=0;y<doc.canvas.h;y++)for(let x=0;x<doc.canvas.w;x++)if(protectedMask[y*doc.canvas.w+x])mask[(y+1)*f.width+x+1]=0;
  }
  if(task.maskMode==='colors'){
   const cset=new Set(task.allowedColors.map(s=>s.toLowerCase()));for(let p=0;p<mask.length;p++){
    const hex='#'+[0,1,2].map(c=>f.rgba[p*4+c].toString(16).padStart(2,'0')).join('');
    if(cset.has(hex)&&f.rgba[p*4+3]!==0)mask[p]=1;
   }
  }
  const rgba=new Uint8ClampedArray(mask.length*4);for(let p=0;p<mask.length;p++){rgba[p*4]=rgba[p*4+1]=rgba[p*4+2]=mask[p]*255;rgba[p*4+3]=255;}
  await writeFile(join(dir,'allowed-mask.'+f.id+'.bin'),mask);
  await writeFile(join(dir,'allowed-mask.'+f.id+'.png'),api.encodePNG(f.width,f.height,rgba));
  const zoom=display({width:f.width,height:f.height,rgba},4);
  await writeFile(join(dir,'allowed-mask.'+f.id+'.4x.png'),api.encodePNG(zoom.width,zoom.height,zoom.rgba));
  maskReport.push({frame:f.id,width:f.width,height:f.height,editablePixels:mask.reduce((s,v)=>s+v,0)});
 }
 await writeJson(join(dir,'baseline-proof.json'),{task:id,hashA:assetHash(a),hashD:assetHash(d),equal:true,masks:maskReport});
 results.push({task:id,hash:assetHash(a),equal:true,frames:d.frames.length});
}
await writeJson(join(kit,'evidence','material-build.json'),{repositoryFingerprint:await fingerprint(root),results});
console.log(JSON.stringify(results,null,2));
