import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGlobalDictionaryIndex} from '../src/global-dictionary-matcher.js';
import {planHeadwordReaderClicks} from '../src/global-dictionary-headword-click-plan.js';
const R='gdict_'+'a'.repeat(24),N='gds_'+'1'.repeat(24),V='gds_'+'2'.repeat(24);
const lesson=(id=R)=>({entry_id:id,headword:'record',reviewed_by:'editor',
 reviewed_at:'2026-11-10T12:00:00Z',meaning_zh:'记录',part_of_speech:'n.',
 phonetic_uk:'/ˈrek.ɔːd/',phonetic_us:'/ˈrek.ɚd/',
 example_en:'Keep a record of every payment.',example_zh:'保存每笔付款记录。',
 senses_json:JSON.stringify([
 {pos:'n.',meaningZh:'记录',exampleEn:'Keep a record of every payment.',exampleZh:'保存每笔付款记录。'},
 {pos:'v.',meaningZh:'录制',exampleEn:'Record the conversation.',exampleZh:'录制这段谈话。'}]),
 collocations_json:JSON.stringify([{en:'keep a record of',zh:'记录'}])});
const sense=(id,pos,meaningZh,approved=1)=>({sense_id:id,entry_id:R,pos,meaning_zh:meaningZh,
 approved,active:1,reviewed_by:'editor',reviewed_at:'2026-11-10T12:00:00Z'});
const tokens=(word='record',book_id='story-a')=>({status:'READ_ONLY_UNMARKED_ENGLISH_TOKENS',
 book_id,category:'cet4',tokens:[{chapter_number:1,paragraph_index:0,segment_index:0,
 start_offset:5,end_offset:5+word.length,surface:word,normalized_surface:word.toLowerCase()}]});
const idx=()=>buildGlobalDictionaryIndex({entries:[{entry_id:R,headword:'record',teaching_ready:true}],
 forms:[{form:'recorded',headword:'record',reviewed:true}]});
const options=()=>({lessons:new Map([[R,lesson()]]),senses:[sense(N,'n.','记录'),sense(V,'v.','录制')]});

test('two books share one approved card containing noun and verb, not duplicate learning ids',()=>{
 const a=planHeadwordReaderClicks(tokens('record','book-a'),idx(),options());
 const b=planHeadwordReaderClicks(tokens('record','book-b'),idx(),options());
 assert.equal(a.proposed_click_anchors,1);
 assert.equal(a.cards.length,1);assert.equal(a.cards[0].senses.length,2);
 assert.equal(a.cards[0].entry_id,b.cards[0].entry_id);
 assert.equal(a.anchors[0].entry_id,b.anchors[0].entry_id);
 assert.equal(a.cards[0].user_study_key,'sense_id');
 assert.deepEqual(a.cards[0].study_sense_ids,[N,V]);
 assert.equal(a.anchors[0].study_identity,'sense_id');
 assert.equal(a.anchors[0].study_sense_confirmed,false);
 assert.equal(a.anchors[0].context_sense_id,null);
 assert.equal(a.automatic_publication_allowed,false);
 assert.equal(a.user_study_rows_written,0);
 assert.equal(a.headword_level_mastery_supported,false);
});
test('reviewed inflection can propose the same main card',()=>{
 const a=planHeadwordReaderClicks(tokens('recorded'),idx(),options());
 assert.equal(a.proposed_click_anchors,1);
 assert.equal(a.anchors[0].headword,'record');
 assert.equal(a.cards[0].senses.length,2);
});
test('unreviewed inflection and source-only lemma are withheld',()=>{
 const index=buildGlobalDictionaryIndex({entries:[{entry_id:R,headword:'record',teaching_ready:true}],
   forms:[{form:'recorded',headword:'record',reviewed:false}]});
 const withheld=planHeadwordReaderClicks(tokens('recorded'),index,options());
 assert.equal(withheld.proposed_click_anchors,0);
 assert.equal(withheld.review_queue.length,1);
 const index2=buildGlobalDictionaryIndex({entries:[{entry_id:R,headword:'record',teaching_ready:false}]});
 const withheld2=planHeadwordReaderClicks(tokens(),index2,options());
 assert.equal(withheld2.proposed_click_anchors,0);
});
test('only active approved contextual senses appear on one card',()=>{
 const o=options();o.senses[1].approved=0;
 const a=planHeadwordReaderClicks(tokens(),idx(),o);
 assert.equal(a.cards.length,1);
 assert.equal(a.cards[0].senses.length,1);
 assert.equal(a.cards[0].senses[0].meaningZh,'记录');
 assert.equal(a.anchors[0].approved_sense_options.length,1);
});
test('never display a lesson without approved senses or complete audio fields',()=>{
 const o=options();o.senses.forEach(s=>{s.approved=0});
 assert.equal(planHeadwordReaderClicks(tokens(),idx(),o).proposed_click_anchors,0);
 const bad=options();bad.lessons.get(R).phonetic_us=null;
 assert.equal(planHeadwordReaderClicks(tokens(),idx(),bad).proposed_click_anchors,0);
});
test('duplicate approved same meaning/part of speech is not silently selected',()=>{
 const o=options();o.senses.push(sense('gds_'+'3'.repeat(24),'n.','记录'));
 const a=planHeadwordReaderClicks(tokens(),idx(),o);
 assert.equal(a.proposed_click_anchors,0);
 assert.match(a.review_queue[0].reason,/APPROVED_MAIN_CARD/);
});
test('invalid or colliding token positions fail closed',()=>{
 const x=tokens();x.tokens.push({...x.tokens[0]});
 assert.throws(()=>planHeadwordReaderClicks(x,idx(),options()),/DUPLICATE_HEADWORD/);
 const y=tokens();y.tokens[0].end_offset=2;
 assert.throws(()=>planHeadwordReaderClicks(y,idx(),options()),/INVALID_HEADWORD_READER_TOKEN/);
});