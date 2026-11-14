import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGlobalDictionaryIndex,matchDictionaryWord,
  preflightNovelDictionaryMatches,normalizedLemma}
  from '../src/global-dictionary-matcher.js';

const entries=[
 {entry_id:'lex-record',headword:'record',teaching_ready:true},
 {entry_id:'lex-develop',headword:'develop',teaching_ready:true},
 {entry_id:'lex-see',headword:'see',teaching_ready:true},
 {entry_id:'lex-saw',headword:'saw',teaching_ready:true},
 {entry_id:'lex-rare',headword:'sophisticated',teaching_ready:false},
 {entry_id:'lex-lead',headword:'lead',teaching_ready:true},
 {entry_id:'lex-lead-copy',headword:'lead',teaching_ready:true}
];
const forms=[
 {form:'recorded',headword:'record',reviewed:true},
 {form:'recording',headword:'record',reviewed:true},
 {form:'developed',headword:'develop',reviewed:true},
 {form:'saw',headword:'see',reviewed:true},
 {form:'seen',headword:'see',reviewed:true},
 {form:'leads',headword:'lead',reviewed:false}
];
const lexicon=()=>buildGlobalDictionaryIndex({entries,forms});
const novel=()=>({version:1,book:{id:'demo-cet6',category:'cet6',title:'六级小说'},
 words:[{id:'old-record',headword:'record',meaningZh:'录制'}],
 chapters:[{id:'ch1',number:1,paragraphs:[
   {segments:[{text:'她准备 '},{wordId:'old-record',surface:'record',gloss:'录制'},
     {text:' a video tomorrow. He developed an idea for the project.'}]},
   {segments:[{text:'She saw the dog and picked up the sophisticated device.'}]}
 ]}]});
test('normalization is case-insensitive, but never guesses phrase, suffix or punctuation',()=>{
 assert.equal(normalizedLemma(' RECORD '),'record');
 assert.equal(normalizedLemma('deVeloped'),'developed');
 assert.equal(normalizedLemma('ice cream'),null);
 assert.equal(normalizedLemma('B.C.'),null);
 assert.equal(normalizedLemma(''),null);
});
test('exact verified headwords match one shared card irrespective of exam category',()=>{
 const index=lexicon();
 const r=matchDictionaryWord('RECORD',index);
 assert.equal(r.status,'matched');
 assert.equal(r.entry_id,'lex-record');
 assert.equal(r.headword,'record');
 assert.equal(r.matched_by,'exact');
 assert.equal(matchDictionaryWord('develop',index).status,'matched');
});
test('validated morphological links match, while unverified spelling links remain review-only',()=>{
 const index=lexicon();
 const recognized=matchDictionaryWord('recorded',index);
 assert.equal(recognized.status,'matched');
 assert.equal(recognized.entry_id,'lex-record');
 assert.equal(recognized.matched_by,'inflection');
 assert.equal(matchDictionaryWord('saw',index).status,'needs_review');
 assert.equal(matchDictionaryWord('saw',index).reason,'AMBIGUOUS_HEADWORD_OR_INFLECTION');
 assert.equal(matchDictionaryWord('leads',index).status,'needs_review');
});
test('one dictionary card can be known but not approved for paid lesson',()=>{
 const result=matchDictionaryWord('sophisticated',lexicon());
 assert.equal(result.status,'dictionary_only');
 assert.equal(result.reason,'TEACHING_CARD_NEEDS_REVIEW');
 assert.equal(matchDictionaryWord('unobserved',lexicon()).status,'missing');
});
test('legacy duplicate entries are reviewed instead of arbitrarily picking a word_id',()=>{
 const index=lexicon();
 const r=matchDictionaryWord('lead',index);
 assert.equal(r.status,'needs_review');
 assert.equal(r.candidates.length,2);
 assert.equal(new Set(r.candidates.map(x=>x.entry_id)).size,2);
});
test('word-form alias must resolve to a known headword and ID collisions are rejected',()=>{
 assert.throws(()=>buildGlobalDictionaryIndex({entries,forms:[{
   form:'ran',headword:'run',reviewed:true}]}),/UNRESOLVED_INFLECTION_LEMMA/);
 assert.throws(()=>buildGlobalDictionaryIndex({entries:[...entries,entries[0]]}),/DUPLICATE_DICTIONARY_ID/);
 assert.throws(()=>buildGlobalDictionaryIndex({entries:[{id:'x',headword:'some words'}]}),/INVALID_DICTIONARY_ENTRY/);
});
test('a CET6 manuscript preserves every original word ID and only scans other English as suggestions',()=>{
 const input=novel(),original=structuredClone(input);
 const r=preflightNovelDictionaryMatches(input,lexicon());
 assert.equal(r.status,'READ_ONLY_PREFLIGHT_NOT_IMPORTED');
 assert.equal(r.category,'cet6');
 assert.equal(r.summary.target_unique,1);
 assert.equal(r.summary.target.matched,1);
 assert.equal(r.targets[0].entry_id,'lex-record');
 assert.deepEqual(r.targets[0].legacy_word_ids,['old-record']);
 assert.equal(r.targets[0].occurrences,1);
 assert.equal(r.release_blocked,false);
 assert.ok(r.discovered.some(x=>x.normalized_surface==='developed'&&
   x.status==='matched'&&x.entry_id==='lex-develop'));
 assert.ok(r.discovered.some(x=>x.normalized_surface==='saw'&&
   x.status==='needs_review'));
 assert.ok(r.discovered.some(x=>x.normalized_surface==='sophisticated'&&
   x.status==='dictionary_only'));
 assert.deepEqual(input,original);
});
test('novel without a words array is allowed for future lookup-only preview, but never auto-rewrites it',()=>{
 const input=novel();delete input.words;
 input.chapters[0].paragraphs[0].segments.push({wordId:'old-unknown',surface:'invented',gloss:'构思'});
 const r=preflightNovelDictionaryMatches(input,lexicon());
 assert.equal(r.summary.target.missing,1);
 assert.equal(r.release_blocked,true);
 assert.ok(r.targets.some(x=>x.normalized_surface==='invented'&&
   x.reason==='DICTIONARY_HEADWORD_NOT_FOUND'));
});
test('only explicitly annotated learning targets can block release',()=>{
 const input=novel();
 input.chapters[0].paragraphs[0].segments=[{text:'John saw a bird near the bakery.'}];
 input.chapters[0].paragraphs[1].segments=[{text:'I called the inspector.'}];
 const r=preflightNovelDictionaryMatches(input,lexicon());
 assert.equal(r.summary.target_unique,0);
 assert.equal(r.summary.discovered.needs_review>0,true);
 assert.equal(r.release_blocked,false);
});
test('input type or extreme scan cannot result in partial publishing decisions',()=>{
 const i=novel();i.chapters[0].number=0;
 assert.throws(()=>preflightNovelDictionaryMatches(i,lexicon()),/INVALID_NOVEL_CHAPTER/);
 const j=novel();j.chapters[0].paragraphs=[{segments:[{text:'a '.repeat(21000)}]}];
 assert.throws(()=>preflightNovelDictionaryMatches(j,lexicon()),/MATCH_SCAN_LIMIT_EXCEEDED/);
});
