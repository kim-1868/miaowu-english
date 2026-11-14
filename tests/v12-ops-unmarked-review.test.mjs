import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUnmarkedV2File,normalizeEditorPreview,makeEditorDecisions}
  from '../public/ops-unmarked-review.js';
const r='gdict_'+'a'.repeat(24),s1='gds_'+'b'.repeat(24),s2='gds_'+'c'.repeat(24);
const source=()=>({version:2,book:{id:'novel-ops',category:'cet6',title:'某故事'},
 chapters:[{number:1,paragraphs:[{segments:[{text:'她记下了 record，然后 record 一段视频。'}]}]}]});
const positions=()=>{const text=source().chapters[0].paragraphs[0].segments[0].text;
 let n=text.indexOf('record'); const m=text.indexOf('record',n+1);
 return [n,m];};
const fake=()=>{
 const [n,m]=positions();return {
 status:'EDITOR_CONTEXT_SELECTION_REQUIRED',book_id:'novel-ops',
 source_sha256:'a'.repeat(64),plan_sha256:'b'.repeat(64),
 publication_allowed:false,write_count:0,approved_word_candidates:2,
 approved_cards:[{entry_id:r,headword:'record',senses:[
 {sense_id:s1,pos:'n.',meaningZh:'记录'},
 {sense_id:s2,pos:'v.',meaningZh:'录制'}]}],
 anchors:[n,m].map(n=>({chapter_number:1,paragraph_index:0,segment_index:0,
 start_offset:n,end_offset:n+6,surface:'record',entry_id:r,
 approved_sense_options:[s1,s2]})),review_queue:[]
 };};
test('rejects V1 and V2 with injected cards, accepts mixed marked/unmarked V2',()=>{
 assert.equal(validateUnmarkedV2File({package:source()}).book.id,'novel-ops');
 assert.throws(()=>validateUnmarkedV2File({...source(),words:[]}),/不包含 words/);
 assert.throws(()=>validateUnmarkedV2File({...source(),version:1}),/V2/);
 const mixed=source();mixed.chapters[0].paragraphs[0].segments.push({surface:'record',gloss:'记录'});
 assert.equal(validateUnmarkedV2File(mixed).book.id,'novel-ops');
});
test('reviews each occurrence but keeps a shared entry card and all contextual sense options',()=>{
 const rows=normalizeEditorPreview(fake(),source());
 assert.equal(rows.length,2);
 assert.equal(rows[0].anchor.entry_id,rows[1].anchor.entry_id);
 assert.equal(rows[0].options.length,2);
 assert.match(rows[1].excerpt,/视频/);
 const decisions=makeEditorDecisions(rows,new Map([[rows[0].key,s1],[rows[1].key,s2]]));
 assert.equal(decisions.length,2);
 assert.deepEqual(decisions.map(x=>x.sense_id),[s1,s2]);
 assert.ok(decisions.every(x=>x.confirmed===true&&x.entry_id===r));
});
test('invalid source fingerprint, missing permission flags, fake approved option and forged result are rejected',()=>{
 for(const prop of ['source_sha256','plan_sha256']){
  const x=fake();x[prop]='not-sha';
  assert.throws(()=>normalizeEditorPreview(x,source()),/不完整/);
 }
 for(const prop of ['publication_allowed','write_count']){
  const x=fake();x[prop]=prop==='write_count'?1:true;
  assert.throws(()=>normalizeEditorPreview(x,source()),/不完整/);
 }
 const y=fake();y.anchors[0].approved_sense_options=['gds_'+'f'.repeat(24)];
 assert.throws(()=>normalizeEditorPreview(y,source()),/词义与词头/);
});
test('stale token positions and wrong book ID cannot be used to confirm',()=>{
 const stale=fake();stale.anchors[0].start_offset++;
 assert.throws(()=>normalizeEditorPreview(stale,source()),/位置已经改变/);
 const wrong=fake();wrong.book_id='wrong';
 assert.throws(()=>normalizeEditorPreview(wrong,source()),/书籍编号/);
});
test('duplicate anchors are rejected, and choices cannot use a sense from another entry',()=>{
 const preview=fake();preview.anchors[1]={...preview.anchors[0]};
 assert.throws(()=>normalizeEditorPreview(preview,source()),/对应关系不一致/);
 const rows=normalizeEditorPreview(fake(),source());
 assert.throws(()=>makeEditorDecisions(rows,new Map([[rows[0].key,'gds_'+'f'.repeat(24)]])),/不一致/);
 assert.throws(()=>makeEditorDecisions(rows,new Map([['forged',s1]])),/不一致/);
});