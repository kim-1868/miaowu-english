import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGlobalDictionaryIndex} from '../src/global-dictionary-matcher.js';
import {planHeadwordReaderClicks} from '../src/global-dictionary-headword-click-plan.js';
import {createHeadwordStudyState,applyHeadwordStudyFeedback,previewHeadwordStudyDue}
 from '../src/global-dictionary-headword-srs.js';
const ENTRY='gdict_'+'a'.repeat(24);
const NOUN='gds_'+'b'.repeat(24),VERB='gds_'+'c'.repeat(24);
const lesson={entry_id:ENTRY,headword:'record',reviewed_by:'editor',
 reviewed_at:'2026-11-10T12:00:00Z',meaning_zh:'记录',part_of_speech:'n.',
 phonetic_uk:'/ˈrek.ɔːd/',phonetic_us:'/ˈrek.ɚd/',
 example_en:'Keep a record.',example_zh:'保留记录。',
 senses_json:[{pos:'n.',meaningZh:'记录',exampleEn:'Keep a record.',exampleZh:'保留记录。'},
 {pos:'v.',meaningZh:'录制',exampleEn:'Record the talk.',exampleZh:'录制谈话。'}],
 collocations_json:[{en:'keep a record',zh:'保存记录'}]};
const senses=[{entry_id:ENTRY,sense_id:NOUN,pos:'n.',meaning_zh:'记录',
 active:1,approved:1,reviewed_by:'editor',reviewed_at:'2026-11-10T12:00:00Z'},
 {entry_id:ENTRY,sense_id:VERB,pos:'v.',meaning_zh:'录制',
 active:1,approved:1,reviewed_by:'editor',reviewed_at:'2026-11-10T12:00:00Z'}];
const index=buildGlobalDictionaryIndex({entries:[{entry_id:ENTRY,headword:'record',teaching_ready:true}],forms:[]});
const doc=(id)=>({status:'READ_ONLY_UNMARKED_ENGLISH_TOKENS',book_id:id,category:'cet4',
 tokens:[{chapter_number:1,paragraph_index:0,segment_index:0,start_offset:0,end_offset:6,
 surface:'record',normalized_surface:'record'}]});
const at='2026-11-11T08:00:00.000Z';

test('complete synthetic A/B story: full n/v card, one shared per-user plan, no cross-user bleed',()=>{
 const a=planHeadwordReaderClicks(doc('romance-a'),index,{lessons:new Map([[ENTRY,lesson]]),senses});
 const b=planHeadwordReaderClicks(doc('romance-b'),index,{lessons:new Map([[ENTRY,lesson]]),senses});
 assert.equal(a.cards.length,1);assert.equal(a.cards[0].senses.length,2);
 assert.equal(a.anchors[0].entry_id,b.anchors[0].entry_id);
 assert.equal(a.anchors[0].requires_context_editor_confirmation,true);
 const bookA=applyHeadwordStudyFeedback(createHeadwordStudyState({user_id:'user-a',entry_id:a.anchors[0].entry_id}),
  {kind:'remembered',at});
 const bookB=applyHeadwordStudyFeedback(bookA.state,{kind:'seen',at:'2026-11-11T10:00:00.000Z'});
 assert.equal(bookB.state.due_at,bookA.state.due_at);
 assert.equal(bookB.state.encounter_count,1);
 const onceMore=applyHeadwordStudyFeedback(bookB.state,
  {kind:'remembered',at:'2026-11-11T10:02:00.000Z'});
 assert.equal(onceMore.state.due_at,bookA.state.due_at);
 assert.equal(onceMore.advanced,false);
 assert.equal(previewHeadwordStudyDue(onceMore.state,bookA.state.due_at).is_due,true);
 assert.equal(createHeadwordStudyState({user_id:'user-b',entry_id:ENTRY}).stage,0);
 assert.equal(a.d1_writes+b.d1_writes+bookA.database_writes+bookB.database_writes,0);
});