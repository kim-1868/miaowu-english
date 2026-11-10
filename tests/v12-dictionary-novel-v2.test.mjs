import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash,webcrypto} from 'node:crypto';
import {validatePackage} from '../src/editorial-content.js';
import {normalizeDictionaryNovelV2,convertDictionaryNovelV2}
 from '../src/global-dictionary-novel-v2.js';
import {buildGlobalDictionaryIndex} from '../src/global-dictionary-matcher.js';
import {inspectStagingDictionaryNovelV2,handleOpsDictionaryNovelV2}
 from '../src/ops-dictionary-v2.js';
import {digestOpsToken} from '../src/ops-access.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const manuscript=()=>({
 version:2,book:{
   id:'story-cet6-v2',title:'六级统一词典小说',
   category:'cet6',description:'新小说，无需重复附带完整词卡'
 },chapters:[{id:'chapter-01',number:1,title:'第一章',preview:false,
  paragraphs:[
   {segments:[{text:'她想要 '},{surface:'record',gloss:'录制'},
      {text:' 一段新的视频。'}]},
   {segments:[{text:'随后开始 '},{surface:'recorded',gloss:'记录'},
      {text:' 事情的经过。'}]}
  ]}]
});
const approvedLesson={
 entry_id:'gdict_record',headword:'record',
 phonetic_uk:'/rɪˈkɔːd/',phonetic_us:'/rɪˈkɔːrd/',
 part_of_speech:'n./v.',meaning_zh:'记录；录制',
 example_en:'They recorded the entire conversation.',
 example_zh:'他们录下了整个对话。',
 reviewed_by:'editor-01',reviewed_at:'2026-11-10T00:00:00Z',
 senses_json:JSON.stringify([
  {pos:'n.',meaningZh:'记录',exampleEn:'Keep a record of your work.',
   exampleZh:'记录你的工作。'},
  {pos:'v.',meaningZh:'录制',exampleEn:'They recorded the conversation.',
   exampleZh:'他们录制了对话。'}
 ]),collocations_json:'[]'
};
const index=()=>buildGlobalDictionaryIndex({
 entries:[{entry_id:'gdict_record',headword:'record',teaching_ready:true}],
 forms:[{form:'recorded',headword:'record',reviewed:true}]
});
function fixture(){
 const sql=new DatabaseSync(':memory:');
 try{
  for(const file of ['013_global_dictionary.sql','016_global_dictionary_lessons.sql'])
   sql.exec(readFileSync(new URL('../db/'+file,import.meta.url),'utf8'));
  sql.exec('CREATE TABLE ops_operators(id TEXT,display_name TEXT,role TEXT,'+
    'environment TEXT,key_digest TEXT,is_active INTEGER,revoked_at TEXT);');
  sql.exec('CREATE TABLE ops_audit_events(id TEXT,actor_id TEXT,event_type TEXT,request_id TEXT);');
  sql.prepare('INSERT INTO global_dictionary_sources VALUES(?,?,?,?,?,?,?,?)').run(
    'owner_ecdict_exam_snapshot','MIT',1,'a'.repeat(64),2,2,'2026-11-10',1);
  for(const [entry,word] of [['gdict_record','record'],['gdict_see','see'],
     ['gdict_saw','saw']]){
   sql.prepare('INSERT INTO global_dictionary_entries '+
    '(entry_id,headword,exam_levels_json,source_name,teaching_ready,reviewed_at) '+
    'VALUES(?,?,?,?,?,?)').run(entry,word,'["cet6"]',
      'owner_ecdict_exam_snapshot',1,'2026-11-10');
  }
  for(const [form,entry] of [['recorded','gdict_record'],['saw','gdict_see']]){
   sql.prepare('INSERT INTO global_dictionary_forms(form,entry_id,source_name,reviewed) '+
    'VALUES(?,?,?,?)').run(form,entry,'owner_ecdict_exam_snapshot',1);
  }
  sql.prepare('INSERT INTO global_dictionary_lessons '+
   '(entry_id,headword,senses_json,phonetic_uk,phonetic_us,part_of_speech,'+
    'meaning_zh,example_en,example_zh,collocations_json,reviewed_by,reviewed_at) '+
    'VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(
     approvedLesson.entry_id,approvedLesson.headword,approvedLesson.senses_json,
     approvedLesson.phonetic_uk,approvedLesson.phonetic_us,approvedLesson.part_of_speech,
     approvedLesson.meaning_zh,approvedLesson.example_en,approvedLesson.example_zh,
     approvedLesson.collocations_json,approvedLesson.reviewed_by,approvedLesson.reviewed_at
    );
  const db={prepare(query){
   const statement=sql.prepare(query);
   return {
    async all(){return {results:statement.all()};},
    bind(...args){
     return {async all(){return {results:statement.all(...args)};},
       async first(){return statement.get(...args)}};
    }
   };
  }};
  return {sql,db,env:{APP_ENV:'staging',DB:db,
   GLOBAL_DICTIONARY_LOOKUP_ENABLED:'true',OPS_TOKEN_PEPPER:'e'.repeat(64)}};
 }catch(e){sql.close();throw e}
}
test('wordcard-free V2 importer builds one globally stable reviewed card for multiple senses and inflections',async()=>{
 const {sql,env}=fixture();
 try{
  const source=manuscript(),copy=structuredClone(source);
  const before=sql.prepare('SELECT total_changes() AS n').get().n;
  const result=await inspectStagingDictionaryNovelV2(env,{package:source});
  assert.equal(result.status,'DICTIONARY_V2_READ_ONLY_CONVERSION');
  assert.equal(result.ready_to_convert,true);
  assert.equal(result.approved_occurrences,2);
  assert.equal(result.unique_main_cards,1);
  assert.equal(result.converted_package.version,1);
  assert.equal(result.converted_package.words.length,1);
  assert.equal(result.converted_package.words[0].id,'gdict_record');
  assert.equal(result.converted_package.words[0].headword,'record');
  assert.equal(result.converted_package.words[0].meaningZh,'记录；录制');
  assert.deepEqual(result.converted_package.chapters[0].paragraphs.map(
    p=>p.segments.find(s=>s.wordId)?.wordId),['gdict_record','gdict_record']);
  assert.equal(validatePackage(result.converted_package).mentionCount,2);
  assert.deepEqual(source,copy);
  assert.equal(sql.prepare('SELECT total_changes() AS n').get().n,before);
  assert.equal(result.publication_ready,false);
  assert.equal(result.userDataChanged,false);
 }finally{sql.close()}
});
test('missing dictionary headword is reported without synthesizing a fake card or partial import',async()=>{
 const {sql,env}=fixture();
 try{
  const source=manuscript();
  source.chapters[0].paragraphs[1].segments[1].surface='quixotic';
  const result=await inspectStagingDictionaryNovelV2(env,{package:source});
  assert.equal(result.ready_to_convert,false);
  assert.equal(result.approved_occurrences,1);
  assert.equal(result.review_queue[0].reason,'DICTIONARY_HEADWORD_NOT_FOUND');
  assert.equal(result.converted_package,undefined);
 }finally{sql.close()}
});
test('unreviewed licence or lesson absence makes an existing lemma nonpublishable',async()=>{
 const {sql,env}=fixture();
 try{
  sql.exec('UPDATE global_dictionary_sources SET enabled=0,license_reviewed=0');
  const unlicensed=await inspectStagingDictionaryNovelV2(env,{package:manuscript()});
  assert.equal(unlicensed.ready_to_convert,false);
  assert.equal(unlicensed.review_queue.length,2);
  sql.exec('UPDATE global_dictionary_sources SET enabled=1,license_reviewed=1');
  sql.exec('DELETE FROM global_dictionary_lessons');
  const noLesson=await inspectStagingDictionaryNovelV2(env,{package:manuscript()});
  assert.equal(noLesson.ready_to_convert,false);
  assert.ok(noLesson.review_queue.every(x=>x.reason==='LESSON_NOT_APPROVED_OR_INCOMPLETE'));
 }finally{sql.close()}
});
test('a dictionary lemma without complete example or accepted senses blocks all matching forms',async()=>{
 const {sql,env}=fixture();
 try{
  sql.exec("UPDATE global_dictionary_lessons SET example_zh=''");
  const result=await inspectStagingDictionaryNovelV2(env,{package:manuscript()});
  assert.equal(result.ready_to_convert,false);
  assert.equal(result.review_queue.length,2);
 }finally{sql.close()}
});
test('same form can resolve to different canonical entries in different contexts with approved editor choices',async()=>{
 const {sql,env}=fixture();
 try{
  const source=manuscript();
  source.chapters[0].paragraphs[0].segments[1].surface='saw';
  source.chapters[0].paragraphs[0].segments[1].gloss='看见';
  source.chapters[0].paragraphs[1].segments[1].surface='saw';
  source.chapters[0].paragraphs[1].segments[1].gloss='锯子';
  // Both candidates have structurally approved dictionary lessons.
  for(const [entry,word] of [['gdict_see','see'],['gdict_saw','saw']]){
   sql.prepare('INSERT INTO global_dictionary_lessons '+
    '(entry_id,headword,senses_json,phonetic_uk,phonetic_us,part_of_speech,'+
    'meaning_zh,example_en,example_zh,collocations_json,reviewed_by,reviewed_at) '+
    'VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(
      entry,word,JSON.stringify([entry==='gdict_saw'
        ?{pos:'n.',meaningZh:'锯子',exampleEn:'The saw is sharp.',
          exampleZh:'这把锯子很锋利。'}
        :{pos:'v.',meaningZh:'看见',exampleEn:'I saw a bird.',
          exampleZh:'我看见一只鸟。'}]),
      '/sɔː/','/sɔː/',entry==='gdict_saw'?'n.':'v.',
      entry==='gdict_saw'?'锯子':'看见',
      entry==='gdict_saw'?'The saw is sharp.':'I saw a bird.',
      entry==='gdict_saw'?'这把锯子很锋利。':'我看见一只鸟。',
      '[]','reviewer','2026-11-10');
  }
  const without=await inspectStagingDictionaryNovelV2(env,{package:source});
  assert.equal(without.ready_to_convert,false);
  assert.ok(without.review_queue.every(x=>x.reason==='AMBIGUOUS_HEADWORD_OR_INFLECTION'));
  const choices=[
   {chapter_number:1,paragraph_index:0,segment_index:1,
    entry_id:'gdict_see',confirmed:true},
   {chapter_number:1,paragraph_index:1,segment_index:1,
    entry_id:'gdict_saw',confirmed:true}
  ];
  const selected=await inspectStagingDictionaryNovelV2(env,{package:source,decisions:choices});
  assert.equal(selected.ready_to_convert,true);
  assert.deepEqual(selected.converted_package.words.map(x=>x.id),
    ['gdict_saw','gdict_see']);
  assert.deepEqual(selected.converted_package.chapters[0].paragraphs.map(p=>
    p.segments[1].wordId),['gdict_see','gdict_saw']);
 }finally{sql.close()}
});
test('client cannot insert preapproved wordcards or overwrite old explicit study IDs in V2',()=>{
 const n=manuscript();
 n.words=[{id:'fake-card',headword:'record',reviewed:true}];
 assert.throws(()=>normalizeDictionaryNovelV2(n),/V2_WORDS_ARRAY_FORBIDDEN/);
 delete n.words;
 n.chapters[0].paragraphs[0].segments[1].wordId='previous-study-id';
 assert.throws(()=>normalizeDictionaryNovelV2(n),/INVALID_DICTIONARY_V2_TARGET/);
});
test('plain text English alone cannot become mandatory learning targets or trigger unauthorized cards',()=>{
 const n=manuscript();
 n.chapters[0].paragraphs[0].segments=[{text:'She recorded an interesting story.'}];
 const parsed=normalizeDictionaryNovelV2(n);
 assert.equal(parsed.targets.length,1);
 assert.equal(parsed.unique_surfaces.length,1);
 assert.equal(parsed.unique_surfaces[0],'recorded');
});
test('V2 preflight endpoint stays staging-only and requires the publisher secret',async()=>{
 const {sql,env}=fixture();
 try{
  const request=new Request('https://staging.example/api/ops/import/dictionary-v2/preflight',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({package:manuscript()})
  });
  const prod=await handleOpsDictionaryNovelV2(request,{...env,APP_ENV:'production'},
   '/api/ops/import/dictionary-v2/preflight');
  assert.equal(prod.status,404);
  const unauth=await handleOpsDictionaryNovelV2(request,env,
   '/api/ops/import/dictionary-v2/preflight');
  assert.equal(unauth.status,401);
  const token='mwops_'+'c'.repeat(64);
  const digest=await digestOpsToken(token,env.OPS_TOKEN_PEPPER);
  sql.prepare('INSERT INTO ops_operators VALUES(?,?,?,?,?,?,?)').run(
    'ops-publisher','Staging Publisher','publisher','staging',digest,1,null);
  const requestOk=new Request('https://staging.example/api/ops/import/dictionary-v2/preflight',{
   method:'POST',headers:{'content-type':'application/json','X-Mw-Ops-Key':token},
   body:JSON.stringify({package:manuscript()})
  });
  const ok=await handleOpsDictionaryNovelV2(requestOk,env,
    '/api/ops/import/dictionary-v2/preflight');
  assert.equal(ok.status,200);
  assert.equal((await ok.json()).ready_to_convert,true);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM ops_audit_events').get().n,0);
 }finally{sql.close()}
});


test('full upstream inflection also exists as dictionary headword: exact approved Chinese sense selects reviewed lemma',async()=>{
 const {sql,env}=fixture();
 try{
  sql.prepare('INSERT INTO global_dictionary_entries '+
   '(entry_id,headword,exam_levels_json,source_name,teaching_ready) '+
   'VALUES(?,?,?,?,?)').run('gdict_recorded','recorded','["cet6"]',
     'owner_ecdict_exam_snapshot',0);
  const source=manuscript();
  const result=await inspectStagingDictionaryNovelV2(env,{package:source});
  assert.equal(result.ready_to_convert,true);
  assert.equal(result.unique_main_cards,1);
  assert.equal(result.converted_package.words[0].id,'gdict_record');
  assert.ok(result.resolved.some(x=>x.surface==='recorded'&&
   x.reason==='UNIQUE_REVIEWED_CONTEXT_SENSE'));
  assert.ok(result.review_queue.length===0);
  const changed=manuscript();
  changed.chapters[0].paragraphs[1].segments[1].gloss='制造';
  const uncertain=await inspectStagingDictionaryNovelV2(env,{package:changed});
  assert.equal(uncertain.ready_to_convert,false);
  assert.equal(uncertain.review_queue.length,1);
  assert.equal(uncertain.review_queue[0].reason,'AMBIGUOUS_HEADWORD_OR_INFLECTION');
 }finally{sql.close()}
});
test('never silently choose among two fully approved dictionary headwords with the same Chinese gloss',async()=>{
 const {sql,env}=fixture();
 try{
  sql.prepare('INSERT INTO global_dictionary_entries '+
   '(entry_id,headword,exam_levels_json,source_name,teaching_ready,reviewed_at) '+
   'VALUES(?,?,?,?,?,?)').run('gdict_recorded','recorded','["cet6"]',
    'owner_ecdict_exam_snapshot',1,'2026-11-10');
  sql.prepare('INSERT INTO global_dictionary_lessons '+
   '(entry_id,headword,senses_json,phonetic_uk,phonetic_us,part_of_speech,'+
   'meaning_zh,example_en,example_zh,collocations_json,reviewed_by,reviewed_at) '+
   'VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(
    'gdict_recorded','recorded',JSON.stringify([{
     pos:'v.',meaningZh:'记录',exampleEn:'They recorded it.',
     exampleZh:'他们记录了这件事。'
    }]),'/rɪˈkɔːd/','/rɪˈkɔːrd/','v.','记录',
    'They recorded it.','他们记录了这件事。','[]','editor','2026-11-10');
  const result=await inspectStagingDictionaryNovelV2(env,{package:manuscript()});
  assert.equal(result.ready_to_convert,false);
  assert.equal(result.review_queue.length,1);
  assert.equal(result.review_queue[0].normalized_surface,'recorded');
  assert.equal(result.review_queue[0].reason,'AMBIGUOUS_HEADWORD_OR_INFLECTION');
 }finally{sql.close()}
});

test('A4.3 exact lemma still rejects an unsupported Chinese contextual gloss',async()=>{
 const {sql,env}=fixture();
 try{
   const source=manuscript();
   source.chapters[0].paragraphs[0].segments[1].gloss='扭曲事实';
   const result=await inspectStagingDictionaryNovelV2(env,{package:source});
   assert.equal(result.ready_to_convert,false);
   assert.equal(result.converted_package,undefined);
   assert.equal(result.review_queue.length,1);
   assert.equal(result.review_queue[0].reason,
     'CONTEXT_GLOSS_NOT_IN_REVIEWED_DICTIONARY_SENSES');
 }finally{sql.close()}
});
