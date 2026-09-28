#!/usr/bin/env node
// v1.2: organizer-only unblinding of a mirrored review against its key. Never exposed to reviewers.
import {args,readJson} from '../runner/common.mjs';
import {resolve} from 'node:path';
const o=args();
if(!o.key||!o.review)throw Error('Usage: --key KEY.json --review REVIEW.json');
const key=await readJson(resolve(o.key)),review=await readJson(resolve(o.review));
if(key.schema!=='pga-blind-key/2')throw Error('Expected pga-blind-key/2 key, got '+key.schema);
if(review.schema!=='pga-review/2')throw Error('Expected pga-review/2 review, got '+review.schema);
const rid='reviewer-'+review.reviewerSlot;
const map=key.reviewers.find(r=>r.reviewerId===rid);
if(!map)throw Error('No mapping for '+rid+' in key');
const verdict=review.pairwiseResult;
if(!review.allowedPairwiseResult.includes(verdict))throw Error('Bad pairwiseResult: '+verdict);
const preferred=verdict==='X_PREFERRED'?map.X:verdict==='Y_PREFERRED'?map.Y:null;
console.log(JSON.stringify({
 schema:'pga-unblind/1',task:key.task,repeat:key.repeat,reviewerId:rid,verdict,
 preferredRun:preferred,
 preferredRole:preferred?(preferred===key.candidateA?'candidateA':'candidateB'):null,
 taskFit:{X:review.candidates?.X?.taskFit??null,Y:review.candidates?.Y?.taskFit??null},
 confidence:review.confidence??null,
 mirroredPeer:'reviewer-'+(review.reviewerSlot===1?2:1)
},null,2));
