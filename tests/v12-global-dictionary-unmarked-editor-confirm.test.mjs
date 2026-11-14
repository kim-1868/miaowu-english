import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {buildGlobalDictionaryIndex} from '../src/global-dictionary-matcher.js';
import {validatePackage} from '../src/editorial-content.js';
import {previewUnmarkedEditorTargets,materializeEditorConfirmedUnmarkedV2}
  from '../src/global-dictionary-unmarked-editor-confirm.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const R='gdict_'+'a'.repeat(24),D='gdict_'+'b'.repeat(24);
const RN='gds_'+'1'.repeat(24),RV='gds_'+'2'.repeat(24),DN='gds_'+'3'.repeat(24);
const date='2026-11-11T00:00:00Z';
const approved=(entry_id,headword,parts)=>({entry_id,headword,reviewed_by:'real-synthetic-editor',reviewed_at:date,
 phonetic_uk:'/test/',phonetic_us:'/test/',part_of_speech:parts.map(p=>p.pos).join('/'),
 meaning_zh:parts.map(p=>p.gloss).join('；'),example_en:'An approved example sentence.',
 example_zh:'一条已经在模拟数据里审核的例句。',collocations_json:'[]',
 senses_json:JSON.stringify(parts.map(p=>({pos:p.pos,meaningZh:p.gloss,
  exampleEn:p.example,exampleZh:p.zh})))
});
const fixture=()=>{
 const partsR=[
  {id:RN,pos:'n.',gloss:'记录',example:'She kept a record.',zh:'她保留了记录。'},
  {id:RV,pos:'v.',gloss:'录制',example:'They record a song.',zh:'他们录制歌曲。'}
 ];
 const partsD=[{id:DN,pos:'n.',gloss:'决定',example:'Her decision was final.',zh:'她做出了最终决定。'}];
 const index=buildGlobalDictionaryIndex({entries:[
  {entry_id:R,headword:'record',teaching_ready:true},
  {entry_id:D,headword:'decision',teaching_ready:true}],
  forms:[{form:'recorded',headword:'record',reviewed:false}]});
 const lessons=new Map([[R,approved(R,'record',partsR)],[D,approved(D,'decision',partsD)]]);
 const senses=[...partsR.map(p=>({sense_id:p.id,entry_id:R,pos:p.pos,meaning_zh:p.gloss,
  approved:1,active:1,reviewed_by:'editor',reviewed_at:date})),
 ...partsD.map(p=>({sense_id:p.id,entry_id:D,pos:p.pos,meaning_zh:p.gloss,
  approved:1,active:1,reviewed_by:'editor',reviewed_at:date}))];
 const source={version:2,book:{id:'novel-x',category:'cet4',title:'一词一卡情境演练'},
 chapters:[{id:'ch1',number:1,title:'第一章',preview:true,paragraphs:[
  {segments:[{text:'她保留了 record，准备下次核对。'}]},
  {segments:[{text:'晚上要 record 视频，明早做 decision。'}]},
  {segments:[{text:'后来 recorded 的结果还需要核实。'}]}
 ]}]};
 return {source,index,lessons,senses};
};
async function review(f){return previewUnmarkedEditorTargets(f.source,f.index,f)}
const decide=(anchor,sense_id)=>({chapter_number:anchor.chapter_number,
 paragraph_index:anchor.paragraph_index,segment_index:anchor.segment_index,
 start_offset:anchor.start_offset,entry_id:anchor.entry_id,sense_id,confirmed:true});
const materialize=(f,p,decisions)=>materializeEditorConfirmedUnmarkedV2(f.source,f.index,f,{
 source_sha256:p.source_sha256,plan_sha256:p.plan_sha256,decisions});

test('real source V2 is scanned read-only, with approved candidates and unreviewed form excluded',async()=>{
 const f=fixture(),before=structuredClone(f.source),p=await review(f);
 assert.equal(p.total_detected,4);
 assert.equal(p.approved_word_candidates,3);
 assert.equal(p.unavailable_or_unreviewed,1);
 assert.equal(p.anchors.filter(x=>x.entry_id===R).length,2);
 assert.deepEqual(p.anchors.find(x=>x.entry_id===R).approved_sense_options,[RN,RV]);
 assert.equal(p.review_queue[0].surface,'recorded');
 assert.deepEqual(f.source,before);
 assert.equal(p.publication_allowed,false);
 assert.match(p.source_sha256,/^[a-f0-9]{64}$/);
});
test('editor confirms distinct n/v contexts; one record main card, exact text, all old IDs preserved',async()=>{
 const f=fixture(),p=await review(f);
 const ds=p.anchors.map(a=>decide(a,a.entry_id===D?DN:a.paragraph_index===0?RN:RV));
 const r=await materialize(f,p,ds);
 assert.equal(r.status,'EDITOR_CONFIRMED_V2_DRAFT_NOT_PUBLISHED');
 assert.equal(r.selected_occurrences,3);
 assert.equal(r.still_unmarked,1);
 assert.equal(r.publication_allowed,false);
 assert.equal(r.d1_writes,0);
 const v=r.marked_v2_package;
 assert.equal(v.words,undefined);
 for(let i=0;i<v.chapters[0].paragraphs.length;i++){
  const original=f.source.chapters[0].paragraphs[i].segments.map(x=>x.text??x.surface).join('');
  const transformed=v.chapters[0].paragraphs[i].segments.map(x=>x.text??x.surface).join('');
  assert.equal(transformed,original);
 }
 assert.deepEqual(v.chapters[0].paragraphs[0].segments.filter(s=>s.surface).map(s=>s.gloss),['记录']);
 assert.deepEqual(v.chapters[0].paragraphs[1].segments.filter(s=>s.surface).map(s=>s.gloss),['录制','决定']);
 assert.deepEqual(r.selected_senses.map(x=>x.sense_id),[RN,RV,DN]);
 assert.equal(validatePackage(r.verified_v1_package).mentionCount,3);
 assert.equal(r.verified_v1_package.words.length,2);
 assert.deepEqual(r.verified_v1_package.words.map(x=>x.id),[R,D]);
 assert.ok(r.verified_v1_package.chapters[0].paragraphs[2].segments.every(x=>x.text));
});
test('each selected occurrence needs explicit human confirmation; rejected/unselected remain plain',async()=>{
 const f=fixture(),p=await review(f);
 const one=decide(p.anchors[0],RN);
 const r=await materialize(f,p,[one]);
 assert.equal(r.selected_occurrences,1);
 assert.equal(r.still_unmarked,3);
 assert.equal(r.verified_v1_package.words.length,1);
 assert.deepEqual(r.marked_v2_package.chapters[0].paragraphs[1].segments,
    f.source.chapters[0].paragraphs[1].segments);
});
test('stale novel package or signed lesson plan fails closed',async()=>{
 const f=fixture(),p=await review(f),decision=decide(p.anchors[0],RN);
 f.source.chapters[0].paragraphs[0].segments[0].text+=' !!';
 await assert.rejects(()=>materialize(f,p,[decision]),/STALE_NOVEL_OR_APPROVED_DICTIONARY_REVIEW/);
 const g=fixture(),q=await review(g);
 g.lessons.get(R).senses_json=JSON.stringify([]);
 await assert.rejects(()=>materialize(g,q,[decide(q.anchors[0],RN)]),/STALE_NOVEL_OR_APPROVED_DICTIONARY_REVIEW/);
});
test('wrong sense, unknown word, forged approval and duplicate decisions rejected',async()=>{
 const f=fixture(),p=await review(f),d=decide(p.anchors[0],RN);
 await assert.rejects(()=>materialize(f,p,[{...d,sense_id:DN}]),/UNREVIEWED_OR_CHANGED_CONTEXT_SENSE/);
 await assert.rejects(()=>materialize(f,p,[{...d,entry_id:D}]),/UNREVIEWED_OR_CHANGED_CONTEXT_SENSE/);
 await assert.rejects(()=>materialize(f,p,[d,d]),/DUPLICATE_EDITOR_CONTEXT_DECISION/);
 await assert.rejects(()=>materializeEditorConfirmedUnmarkedV2(f.source,f.index,f,{
   source_sha256:p.source_sha256,plan_sha256:p.plan_sha256,decisions:[d],publisher_approved:true
 }),/INVALID_EDITOR_CONTEXT_CONFIRMATION/);
 await assert.rejects(()=>materialize(f,p,[{...d,approved:true}]),/INVALID_EDITOR_CONTEXT_DECISION/);
 const missing={...d,paragraph_index:2,segment_index:0,start_offset:3};
 await assert.rejects(()=>materialize(f,p,[missing]),/UNREVIEWED_OR_CHANGED_CONTEXT_SENSE/);
});
test('unreviewed source candidate must never become a learning target',async()=>{
 const f=fixture(),p=await review(f);
 const missing=p.review_queue[0];
 await assert.rejects(()=>materialize(f,p,[{...missing,entry_id:R,sense_id:RV,confirmed:true}]),
   /UNREVIEWED_OR_CHANGED_CONTEXT_SENSE/);
});
test('two occurrences within one original segment split at UTF-16 offsets without changing text',async()=>{
 const f=fixture();f.source.chapters[0].paragraphs=[{segments:[{text:'第一次 record，第二次 record。'}]}];
 const p=await review(f),a=p.anchors;
 assert.equal(a.length,2);
 const r=await materialize(f,p,[decide(a[0],RN),decide(a[1],RV)]);
 const pieces=r.marked_v2_package.chapters[0].paragraphs[0].segments;
 assert.equal(pieces.map(x=>x.text??x.surface).join(''),'第一次 record，第二次 record。');
 assert.deepEqual(pieces.filter(x=>x.surface).map(x=>x.gloss),['记录','录制']);
});
test('same Chinese gloss with competing n/v reviewed senses requires extra editorial rework',async()=>{
 const f=fixture(),r=f.lessons.get(R),existing=JSON.parse(r.senses_json);
 existing[1].meaningZh='记录';r.senses_json=JSON.stringify(existing);
 f.senses[1].meaning_zh='记录';
 const p=await review(f);
 const d=decide(p.anchors.find(a=>a.entry_id===R),RN);
 await assert.rejects(()=>materialize(f,p,[d]),/EDITOR_CONTEXT_STABLE_SENSE_REVIEW_REQUIRED/);
});
test('existing V2 explicit learning target retains its identity while additional unmarked words are prepared',async()=>{
 const f=fixture();
 f.source.chapters[0].paragraphs[0].segments=[
  {text:'她保留了 '},{surface:'record',gloss:'记录'},
  {text:'，准备下次核对。'}];
 const p=await review(f);
 assert.equal(p.total_detected,3);
 const only=p.anchors.find(x=>x.surface==='decision');
 const r=await materialize(f,p,[decide(only,DN)]);
 assert.equal(r.selected_occurrences,1);
 assert.equal(r.verified_v1_package.chapters[0].paragraphs[0].segments[1].surface,'record');
 assert.equal(r.verified_v1_package.chapters[0].paragraphs[0].segments[1].gloss,'记录');
 assert.equal(r.verified_v1_package.words.length,2);
 assert.equal(validatePackage(r.verified_v1_package).mentionCount,2);
});
test('unmarked review refuses old forged word IDs and pre-supplied wordcards, preserving legacy tables',async()=>{
 const first=fixture();first.source.chapters[0].paragraphs[0].segments[0].wordId='legacy-id';
 await assert.rejects(()=>review(first),/INVALID_AUTO_DISCOVERY_SEGMENT/);
 const second=fixture();second.source.words=[{id:'legacy-id',headword:'record'}];
 await assert.rejects(()=>review(second),/INVALID_AUTO_DISCOVERY_V2_PACKAGE/);
});
