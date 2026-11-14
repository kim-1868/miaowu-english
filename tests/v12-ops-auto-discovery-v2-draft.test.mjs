import test from 'node:test';
import assert from 'node:assert/strict';
import {draftAutoDiscoveredV2} from '../public/auto-discovery-v2-draft.js';
const word=(word,gloss,offset,ch=1,pi=0,si=0)=>({
 action:'PROPOSE_ONLY_REQUIRES_CONTEXT_EDITOR_CONFIRMATION',
 chapter_number:ch,paragraph_index:pi,segment_index:si,
 start_offset:offset,end_offset:offset+word.length,
 surface:word,gloss,sense_id:'gds_'+'1'.repeat(24)
});
const novel=()=>({version:2,book:{id:'draft-book',category:'cet4'},
 chapters:[{number:1,paragraphs:[{segments:[
  {text:'她做出了 decision，然后留下 record。'},
  {surface:'love',gloss:'爱情'}]}]}]});
test('confirmed suggestions produce exact offsets while preserving all unmodified text and existing study tokens',()=>{
 const old=novel();const original=structuredClone(old);
 const a='她做出了 decision，然后留下 record。';
 const inputs=[word('record','记录',a.indexOf('record')),word('decision','决定',a.indexOf('decision'))];
 const draft=draftAutoDiscoveredV2(old,inputs);
 assert.deepEqual(old,original);
 const rebuilt=draft.chapters[0].paragraphs[0].segments.map(x=>x.surface||x.text).join('');
 assert.equal(rebuilt,a+'love');
 assert.deepEqual(draft.chapters[0].paragraphs[0].segments.filter(x=>x.surface).map(x=>x.surface),
  ['decision','record','love']);
 assert.equal(draft.words,undefined);
});
test('stale offsets, duplicate overlaps and forged publisher flag fail closed',()=>{
 const source=novel(),txt=source.chapters[0].paragraphs[0].segments[0].text;
 const good=word('decision','决定',txt.indexOf('decision'));
 assert.throws(()=>draftAutoDiscoveredV2(source,[{...good,sense_id:'gds_invalid'}]),
  /AUTO_DISCOVERY_SUGGESTION_UNVERIFIED/);
 assert.throws(()=>draftAutoDiscoveredV2(source,[{...good,start_offset:0,end_offset:8}]),
  /AUTO_DISCOVERY_CONTEXT_CHANGED_OR_OVERLAPPING/);
 assert.throws(()=>draftAutoDiscoveredV2(source,[good,good]),
  /AUTO_DISCOVERY_CONTEXT_CHANGED_OR_OVERLAPPING/);
 assert.throws(()=>draftAutoDiscoveredV2(source,[{...good,chapter_number:99}]),
  /AUTO_DISCOVERY_SUGGESTION_POSITION_NOT_FOUND/);
 assert.throws(()=>draftAutoDiscoveredV2({...source,words:[]},[good]),
  /AUTO_DISCOVERY_INVALID_V2_DRAFT_INPUT/);
});
