import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
export const readJson = async p => JSON.parse(await readFile(p,'utf8'));
export const writeJson = async (p,v) => { await mkdir(resolve(p,'..'),{recursive:true}); await writeFile(p,JSON.stringify(v,null,2)+'\n'); };
export const stable = v => JSON.stringify(v,(_,x)=>x && typeof x==='object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])) : x);
export const sha = x => createHash('sha256').update(x).digest('hex');
export const safe = x => { if(typeof x!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(x)) throw Error('Unsafe ID: '+x); return x; };
export function args(v=process.argv.slice(2)) {
  const o={_:[]}; for(let i=0;i<v.length;i++) {if(v[i].startsWith('--')) {const k=v[i].slice(2); if(!v[i+1]||v[i+1].startsWith('--'))o[k]=true;else o[k]=v[++i];}else o._.push(v[i]);} return o;
}
export async function loadApi(repo) {
  const imp=p=>import(pathToFileURL(join(repo,p)).href);
  const [r,g,f,a,m,h,p]=await Promise.all(['src/core/raster.js','src/core/rng.js','src/bake/frame.js','src/bake/asset.js','src/recipes/machine.js','src/recipes/humanoid.js','src/export/png.js'].map(imp));
  return {...r,...g,...f,...a,...m,...h,...p};
}
export async function compileDoc(repo,doc) {
  const {compileAny}=await import(pathToFileURL(join(repo,'src/studio/dispatch.js')).href);
  return compileAny(doc,{toolVersion:'benchmark-fixture/1'});
}
export async function buildA(repo,path) {
  const api=await loadApi(repo);
  const mod=await import(pathToFileURL(path).href+'?fresh='+Date.now()+'-'+Math.random());
  if(typeof mod.build!=='function') throw Error('Source must export build(api).');
  return validateAsset(await mod.build(api));
}
export function validateAsset(a) {
  safe(a?.id); if(!Array.isArray(a.frames)||!a.frames.length||a.frames.length>64)throw Error('Invalid frame count.');
  const seen=new Set();
  for(const f of a.frames) {
    safe(f.id); if(seen.has(f.id))throw Error('Duplicate frame ID.');seen.add(f.id);
    if(!Number.isSafeInteger(f.width)||!Number.isSafeInteger(f.height)||f.width<1||f.height<1||f.width>512||f.height>512)throw Error('Bad frame size.');
    if(!f.rgba||f.rgba.length!==f.width*f.height*4)throw Error('Bad RGBA length.');
    for(const p of [f.anchor,...Object.values(f.attachments??{})])if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('Invalid metadata.');
  }
  for(const c of Object.values(a.clips??{})) {
    if(!c.frames?.length||c.frames.some(id=>!seen.has(id)))throw Error('Bad clip references.');
    const ms=Array.isArray(c.ms)?c.ms:[c.ms];
    if(ms.some(n=>!Number.isFinite(n)||n<=0)||(Array.isArray(c.ms)&&c.ms.length!==c.frames.length))throw Error('Bad timing.');
  }
  return a;
}
export function canonicalMeta(a) {
  return {id:a.id,kind:a.kind,seed:a.seed,clips:a.clips??{},frames:a.frames.map(f=>({id:f.id,width:f.width,height:f.height,anchor:f.anchor,attachments:f.attachments??{},bounds:f.bounds??null}))};
}
export function assetHash(a) {
  const h=createHash('sha256');h.update(stable(canonicalMeta(a)));
  for(const f of a.frames)h.update(Buffer.from(f.rgba));return h.digest('hex');
}
export function display(f,scale=4,bg='#202028') {
  const rgb=[1,3,5].map(i=>parseInt(bg.slice(i,i+2),16));
  const w=f.width*scale,h=f.height*scale,rgba=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(Math.floor(y/scale)*f.width+Math.floor(x/scale))*4,j=(y*w+x)*4,a=f.rgba[i+3]/255;
    for(let c=0;c<3;c++)rgba[j+c]=Math.round(f.rgba[i+c]*a+rgb[c]*(1-a));rgba[j+3]=255;
  }
  return {width:w,height:h,rgba};
}
export async function writeAsset(repo,a,out) {
  validateAsset(a); await mkdir(out,{recursive:true});
  const api=await loadApi(repo), meta=canonicalMeta(a);
  for(const f of a.frames) {
    await writeFile(join(out,f.id+'.native.png'),api.encodePNG(f.width,f.height,f.rgba));
    await writeFile(join(out,f.id+'.rgba'),Buffer.from(f.rgba));
    for(const [name,bg] of [['dark','#202028'],['light','#d6d8dc']]){
      const v=display(f,4,bg);await writeFile(join(out,f.id+'.'+name+'.png'),api.encodePNG(v.width,v.height,v.rgba));
    }
  }
  await writeJson(join(out,'asset.json'),{...meta,hash:assetHash(a),format:'pga-benchmark-output/1'});
  await writeFile(join(out,'viewer.html'),await viewerHtml(repo,[{label:'Asset',asset:a}]));
}
export async function readAsset(out) {
  const a=await readJson(join(out,'asset.json'));
  a.frames=await Promise.all(a.frames.map(async f=>({...f,rgba:new Uint8ClampedArray(await readFile(join(out,safe(f.id)+'.rgba')))})));
  return validateAsset(a);
}
export async function viewerHtml(repo,entries) {
  const {encodePNG}=await loadApi(repo);
  const payload=entries.map(({label,asset:a})=>({label,clips:a.clips??{},frames:a.frames.map(f=>({id:f.id,w:f.width,h:f.height,url:'data:image/png;base64,'+encodePNG(f.width,f.height,f.rgba).toString('base64')}))}));
  return `<!doctype html><meta charset="utf-8"><title>Asset comparison</title>
<style>body{font:16px/1.5 system-ui;margin:24px;background:#f4f5f6;color:#15171b}section{display:inline-block;vertical-align:top;margin:12px;padding:12px;border:1px solid #bfc5cc}img,canvas{image-rendering:pixelated}canvas{background:#202028}small{display:block}button,select{margin:8px}figure{margin:8px 0;background:#202028;padding:8px}</style>
<h1>Native + 4x / fixed conditions</h1><p>Review the complete asset first. Animation needs actual playback; a still image is insufficient.</p><main id="root"></main>
<script>const entries=${JSON.stringify(payload).replaceAll('<','\\u003c')};
for(const entry of entries){const s=document.createElement('section');const h=document.createElement('h2');h.textContent=entry.label;s.append(h);document.querySelector('main').append(s);
const select=document.createElement('select');for(const [i,f]of entry.frames.entries()){const o=document.createElement('option');o.value=i;o.textContent=f.id;select.append(o);}s.append(select);
const fig=document.createElement('figure'),native=document.createElement('img'),cv=document.createElement('canvas');fig.append(native,document.createElement('br'),cv);s.append(fig);
const ctx=cv.getContext('2d');ctx.imageSmoothingEnabled=false;const images=entry.frames.map(f=>{const im=new Image();im.src=f.url;return im;});
function draw(i){const f=entry.frames[i];native.src=f.url;native.width=f.w;native.height=f.h;cv.width=f.w*4;cv.height=f.h*4;ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,cv.width,cv.height);if(images[i].complete)ctx.drawImage(images[i],0,0,cv.width,cv.height);else images[i].onload=()=>draw(i);}
select.onchange=()=>{playing=false;draw(+select.value);};let playing=false,last=0,idx=0,clip=null;
const cs=document.createElement('select');for(const key of Object.keys(entry.clips)){const o=document.createElement('option');o.value=key;o.textContent=key;cs.append(o);}if(cs.options.length){s.append(cs);const b=document.createElement('button');b.textContent='Play / pause';b.onclick=()=>{playing=!playing;clip=entry.clips[cs.value];last=performance.now();idx=0;};s.append(b);}
const bg=document.createElement('button');bg.textContent='Dark / light';let dark=true;bg.onclick=()=>{dark=!dark;fig.style.background=dark?'#202028':'#d6d8dc';cv.style.background=dark?'#202028':'#d6d8dc';};s.append(bg);
function tick(t){if(playing&&clip){const ms=Array.isArray(clip.ms)?clip.ms[idx]:clip.ms;if(t-last>=ms){idx=(idx+1)%clip.frames.length;last=t;}draw(entry.frames.findIndex(f=>f.id===clip.frames[idx]));}requestAnimationFrame(tick);}requestAnimationFrame(tick);draw(0);}
</script>`;
}
export async function fingerprint(repo) {
  const h=createHash('sha256');async function walk(dir,rel=''){for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const r=rel?rel+'/'+e.name:e.name;if(e.isDirectory())await walk(join(dir,e.name),r);else if(e.isFile()){h.update(r);h.update(await readFile(join(dir,e.name)));}}}
  await walk(join(repo,'src'));h.update(await readFile(join(repo,'package.json')));return h.digest('hex');
}
