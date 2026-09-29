import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadApi} from '../../PGA_AB_BENCHMARK_v1_2/runner/common.mjs';

const out=path.dirname(fileURLToPath(import.meta.url)),host=path.dirname(out),repo=path.resolve(host,'../..'),kit=path.join(repo,'tests/PGA_AB_BENCHMARK_v1_2');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),write=(p,x)=>fs.writeFileSync(path.join(out,p),typeof x==='string'?x:JSON.stringify(x,null,2)+'\n');
const audit=read(path.join(out,'audit-results.json')),inv=read(path.join(out,'initial-experiment-inventory.json')),reviews=read(path.join(out,'reviewer-mapping.json')),ops=read(path.join(out,'operation-ledger.json'));
const unblind=[];
for(const r of reviews){const dir=path.join(host,'reviews-v1_2-scored',r.pair),args=[path.join(kit,'organizer/unblind.mjs'),'--key',path.join(dir,'key.json'),'--review',path.join(dir,r.reviewer,'review.json')],s=spawnSync(process.execPath,args,{encoding:'utf8',cwd:repo});unblind.push({pair:r.pair,reviewer:r.reviewer,command:[process.execPath,...args],exitCode:s.status,stdout:s.stdout,stderr:s.stderr});}
write('frozen-unblind-replay.json',unblind);
const vision=[];
for(const r of audit.rows){const playback=r.task==='T06'?(r.run==='T06-A-r2'?'SELF_REPORTED_WITH_SCREENSHOTS':'UNVERIFIED'): 'NOT_APPLICABLE';vision.push({role:'participant',id:r.run,imageInput:'SELF_REPORTED',playback,toolCallEvidence:'MISSING',materialEvidence:r.run==='T06-A-r2'?inv.filter(x=>x.path.includes('T06-A-r2')&&/play-(run|stand)/.test(x.path)):[],reportExcerpts:r.report.split(/\r?\n/).filter(l=>/播放|实际查|真实|工具错误|UNVERIFIED/.test(l))});}
for(const r of reviews){const kept=r.pair==='T06-r1'&&r.reviewer==='reviewer-2';vision.push({role:'reviewer',id:r.pair+'/'+r.reviewer,imageInput:'SELF_REPORTED',playback:r.task==='T06'?(r.playbackViewed?(kept?'SELF_REPORTED_WITH_PLAYBACK_SCRIPT_AND_SCREENSHOTS':'SELF_REPORTED'):'UNVERIFIED'):'NOT_APPLICABLE',toolCallEvidence:'MISSING',actualViews:r.raw.actualViews,materialEvidence:kept?inv.filter(x=>x.path.includes(path.join('T06-r1','reviewer-2'))&&/playback.cjs|playrun_|playstand_/.test(x.path)):[],notes:r.raw.notes});}
write('vision-evidence.json',vision);
const externalLog='C:/Users/admin/.fastctx/jobs/j-ojzdgz/output.log';
if(fs.existsSync(externalLog)){const bytes=fs.readFileSync(externalLog);write('referenced-playback-failure-log.json',{run:'T06-D-r2',path:externalLog,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),text:bytes.toString('utf8'),status:'CONFIRMED_SERVER_START_FAILED',limitation:'仅证明该次临时HTTP服务因SyntaxError未启动；不证明浏览器插件调用或模型图像输入。'});}
const candidates=read(path.join(out,'candidate-and-revision-audit.json'));
const ranges=pattern=>{const values=inv.filter(pattern).map(x=>x.mtime).sort();return {count:values.length,min:values[0],max:values.at(-1)};};
const chronology={firstWrapperEvent:ops.map(x=>x.time).sort()[0],lastSubmit:ops.filter(x=>x.kind==='submit').map(x=>x.time).sort().at(-1),executionFreeze:read(path.join(host,'runs-v1_2/execution-freeze-manifest.json')).frozenAt,evaluate:ranges(x=>x.path.includes('eval-v1_2')&&x.path.endsWith('technical.json')),reviews:ranges(x=>x.path.includes('reviews-v1_2-scored')&&x.path.endsWith('review.json')),firstFormalUnblind:fs.readFileSync(path.join(host,'reviews-v1_2-scored/FIRST_UNBLIND_TIMESTAMP.txt'),'utf8').trim(),submissionsPerRun:audit.rows.map(r=>({run:r.run,count:r.submitEvents.length})),note:'mtime 与日志没有第三方可信时间戳；可以检验现存证据顺序，不能证明没有历史删除、先读 key 或临时修改后恢复。'};
write('chronology.json',chronology);
// Observe existing A component construction without editing source or recording new samples.
const api=await loadApi(repo),componentObservations=[];
for(let repeat=1;repeat<=3;repeat++){
 const run=`T05-A-r${repeat}`,painters=[],calls=new WeakMap(),base=api.PixelPainter;
 class ObservedPainter extends base{
  constructor(...args){super(...args);painters.push(this);calls.set(this,[]);}
 }
 for(const method of ['rect','ellipse','set','map','blit'])ObservedPainter.prototype[method]=function(...args){calls.get(this).push({method,args:args.map(a=>typeof a==='function'?'FUNCTION':a instanceof base?'PAINTER':a)});return base.prototype[method].apply(this,args);};
 const mod=await import(pathToFileURL(path.join(host,'runs-v1_2',run,'final/source.mjs')).href);
 mod.build({...api,PixelPainter:ObservedPainter});
 componentObservations.push({run,componentPainters:painters.length-1,components:painters.slice(1).map((p,i)=>({index:i+1,calls:calls.get(p).filter(c=>c.method!=='set'||c.args.length<=3)})),note:'五个 painter 只能证明五个绘制分组，不能证明每个分组保持原始 panel/disc 支持形状。T05-A-r1 灯的额外 cap、r2 杆脚超出首个几何体，需共同类型合同才能裁决。'});
}
write('t05-a-component-audit.json',componentObservations);
write('evidence-summary.json',{chronology,unblindRejected:unblind.filter(r=>r.exitCode!==0).map(r=>({pair:r.pair,reviewer:r.reviewer})),candidateCount:candidates.candidates.length,revisionCount:candidates.revisions.length,visionCounts:{participants:{CONFIRMED:0,SELF_REPORTED:36,UNVERIFIED:0,FAILED:0},reviewers:{CONFIRMED:0,SELF_REPORTED:36,UNVERIFIED:0,FAILED:0}},note:'CONFIRMED 限宿主图像输入调用与关联图像证据。现有报告与截图支持自述，但不能证明图像确实进入 participant/reviewer 的模型上下文。'});
const table=(headers,rows)=>'| '+headers.join(' | ')+' |\n| '+headers.map(()=> '---').join(' | ')+' |\n'+rows.map(r=>'| '+r.map(v=>String(v??'UNKNOWN').replaceAll('|','/')).join(' | ')+' |').join('\n')+'\n';
const rs=[...audit.rows].sort((a,b)=>a.run.localeCompare(b.run));
const s=read(path.join(out,'sensitivity-analysis.json')),ps=[...s.A_frozen_field_rule.matrix].sort((a,b)=>a.pair.localeCompare(b.pair));
let md='# 完整结果表\n\n这些是冻结 statisticalRules 按 review.taskFit 字段的机械复算。taskSuccess 是接受原主持人全局合规声明后的条件值，不把缺失宿主轨迹变成已验证 PASS。CSV 另有 auditTaskSuccess：没有完整合规证据的条件 PASS 为 UNVERIFIED。该列是证据认证状态，不是宣称这些 run 发生了失败。\n\n## 36 runs\n\n';
md+=table(['run','技术','变化像素','越界','候选数','视觉','条件 taskSuccess','审计认证'],rs.map(r=>[r.run,r.technical,r.changedPixels,r.outOfBoundsPixels,r.candidateCount,r.candidateVisualStatus,r.taskSuccess,r.auditTaskSuccess]));
md+='\n全部 submitted=true，元数据/锚点/附件点技术检查通过，已保存候选状态均 ≤12。协议完整状态均为 UNVERIFIED_HOST_TRANSCRIPT；协议产物链、冻结输入和工具副本核对通过。最终源与全部帧 SHA-256、错误详情见 run-level-results.csv。\n\n## 18 pairs\n\n';
md+=table(['pair','A技术','D技术','A视觉','D视觉','R1偏好','R2偏好','pair结果'],ps.map(p=>[p.pair,p.A_technical,p.D_technical,p.A_visual,p.D_visual,p.reviewer1,p.reviewer2,p.pairResult]));
md+='\n## 每 task 的 3 次重复\n\n';
md+=table(['task','A r1/r2/r3','D r1/r2/r3','pair r1/r2/r3'],['T01','T02','T03','T04','T05','T06'].map(t=>[t,...['A','D'].map(a=>[1,2,3].map(i=>rs.find(r=>r.task===t&&r.arm===a&&r.repeat===i).taskSuccess).join(' / ')),ps.filter(p=>p.task===t).map(p=>p.pairResult).join(' / ')]));
md+='\n## 36 reviewer 解盲\n\n';
md+=table(['pair/reviewer','X→','Y→','X taskFit','Y taskFit','原始 verdict','arm偏好','confidence','playbackViewed'],[...reviews].sort((a,b)=>(a.pair+a.reviewer).localeCompare(b.pair+b.reviewer)).map(r=>[r.pair+'/'+r.reviewer,r.mapping.X,r.mapping.Y,r.taskFit.X,r.taskFit.Y,r.pairwiseResult,r.preference,r.confidence,r.playbackViewed]));
md+='\n## 36 runs 的包装器操作成本\n\n';
md+=table(['run','候选','explore','edit','commit','render','submit','错误','拒绝候选'],rs.map(r=>[r.run,r.candidateCount,r.counts['studio:explore']||0,r.arm==='A'?'UNKNOWN':r.counts['studio:edit']||0,r.arm==='A'?'N/A':r.counts['studio:commit']||0,r.counts.render||0,r.counts.submit||0,r.errorCount,r.arm==='A'?'N/A':r.rejectedCandidateRecords]));
write('complete-tables.md',md);
console.log(JSON.stringify({unblindRejected:unblind.filter(r=>r.exitCode!==0).map(r=>r.pair+'/'+r.reviewer),chronology:{...chronology,submissionsPerRun:'36 x 1'},components:componentObservations.map(x=>({run:x.run,count:x.componentPainters}))},null,2));
