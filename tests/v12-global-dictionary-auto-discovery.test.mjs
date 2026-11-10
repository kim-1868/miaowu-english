import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGlobalDictionaryIndex} from '../src/global-dictionary-matcher.js';
import {extractUnmarkedV2EnglishTokens,planApprovedNovelAutoDiscovery}
 from '../src/global-dictionary-auto-discovery.js';

const sid=i=>'gds_'+i.toString(16).padStart(24,'0');
const entry=(id,word)=>({entry_id:id,headword:word,teaching_ready:true,source:'signed'});
const lesson=(id,word,parts)=>({
  entry_id:id,headword:word,reviewed_by:'editor',reviewed_at:'2026-11-11',
  phonetic_uk:'/test/',phonetic_us:'/test/',
  part_of_speech:parts.map(p=>p.pos).join('/'),
  meaning_zh:parts.map(p=>p.gloss).join('；'),
  example_en:'A natural sentence uses the target word.',
  example_zh:'这个自然句子使用了目标词。',
  senses_json:JSON.stringify(parts.map(p=>({
    pos:p.pos,meaningZh:p.gloss,exampleEn:p.en,exampleZh:p.zh
  }))),collocations_json:'[]'
});
const sense=(id,entry_id,pos,meaning_zh)=>({
  sense_id:sid(id),entry_id,pos,meaning_zh,
  approved:1,active:1,reviewed_by:'publisher',reviewed_at:'2026-11-11'
});
const source=()=>({version:2,
  book:{id:'safe-v2-novel',title:'安全自动发现',category:'cet6'},
  chapters:[{number:1,paragraphs:[{segments:[
    {text:'她做出了 decision，然后试着 record 一段留言。'},
    {surface:'record',gloss:'记录'},
    {text:'后来又 recorded 了一段视频。'}]}]}]});
const fixtures=()=>{
 const entries=[entry('gdict_decision','decision'),entry('gdict_record','record')];
 const forms=[{form:'recorded',headword:'record',reviewed:false}];
 const index=buildGlobalDictionaryIndex({entries,forms});
 const parts=[
   {pos:'n.',gloss:'记录',en:'Keep a record of this.',zh:'把这件事记下来。'},
   {pos:'v.',gloss:'录制',en:'They record the song.',zh:'他们录制了这首歌。'}
 ];
 const lessons=new Map([
   ['gdict_decision',lesson('gdict_decision','decision',[
     {pos:'n.',gloss:'决定',en:'Her decision surprised me.',zh:'她的决定让我吃惊。'}])],
   ['gdict_record',lesson('gdict_record','record',parts)]
 ]);
 const senses=[sense(1,'gdict_decision','n.','决定'),
   sense(2,'gdict_record','n.','记录'),
   sense(3,'gdict_record','v.','录制')];
 return {index,lessons,senses};
};
test('extracts exact unmarked English tokens, offsets, skips existing study targets without text mutation',()=>{
 const original=source(),snapshot=JSON.stringify(original);
 const result=extractUnmarkedV2EnglishTokens(original);
 assert.deepEqual(result.unique_spellings,['decision','record','recorded']);
 assert.equal(result.tokens.length,3);
 assert.deepEqual(result.tokens.map(x=>x.surface),['decision','record','recorded']);
 assert.equal(result.tokens[0].chapter_number,1);
 assert.equal(result.tokens[0].segment_index,0);
 assert.equal(JSON.stringify(original),snapshot);
});
test('only a single independently approved stable sense can become a suggestion, and never publish',()=>{
 const sourceData=source(),before=structuredClone(sourceData);
 const extracted=extractUnmarkedV2EnglishTokens(sourceData);
 const {index,lessons,senses}=fixtures();
 const r=planApprovedNovelAutoDiscovery(extracted,index,{lessons,senses});
 assert.equal(r.proposed_occurrences,1);
 assert.equal(r.suggestions[0].surface,'decision');
 assert.equal(r.suggestions[0].gloss,'决定');
 assert.equal(r.suggestions[0].sense_id,sid(1));
 assert.equal(r.suggestions[0].action,'PROPOSE_ONLY_REQUIRES_CONTEXT_EDITOR_CONFIRMATION');
 assert.equal(r.needs_review_occurrences,2);
 assert.equal(r.review_queue.find(x=>x.surface==='record').reason,
   'MULTIPLE_APPROVED_SENSES_REQUIRE_CONTEXT');
 assert.equal(r.review_queue.find(x=>x.surface==='recorded').approved_options,0);
 assert.equal(r.requires_context_editor_confirmation,true);
 assert.equal(r.production_d1_writes,0);
 assert.equal(r.user_state_writes,0);
 assert.deepEqual(sourceData,before);
});
test('unreviewed senses never qualify, even when a matching lemma exists',()=>{
 const extracted=extractUnmarkedV2EnglishTokens(source());
 const x=fixtures();x.senses[0].approved=0;
 const result=planApprovedNovelAutoDiscovery(extracted,x.index,{
   lessons:x.lessons,senses:x.senses
 });
 assert.equal(result.proposed_occurrences,0);
 assert.equal(result.review_queue.some(x=>x.surface==='decision'),true);
});
test('malformed manuscripts and illegal pre-created wordId are rejected',()=>{
 const s=source();s.words=[];
 assert.throws(()=>extractUnmarkedV2EnglishTokens(s),/INVALID_AUTO_DISCOVERY_V2_PACKAGE/);
 const dup=source();dup.chapters.push(structuredClone(dup.chapters[0]));
 assert.throws(()=>extractUnmarkedV2EnglishTokens(dup),/INVALID_AUTO_DISCOVERY_CHAPTER/);
 const forged=source();forged.chapters[0].paragraphs[0].segments[0].wordId='fake';
 assert.throws(()=>extractUnmarkedV2EnglishTokens(forged),/INVALID_AUTO_DISCOVERY_SEGMENT/);
});
