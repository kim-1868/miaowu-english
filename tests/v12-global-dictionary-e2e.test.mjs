import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {inspectStagingDictionaryNovelV2,inspectStagingDictionaryAutoDiscovery} from '../src/ops-dictionary-v2.js';
import {previewBindingManifest,saveStagingBindingManifest}
 from '../src/ops-global-binding-manifests.js';
import {attachDictionaryBindingsToStagingDraft}
 from '../src/global-dictionary-attach.js';
import {planOpsBookImport} from '../src/ops-import.js';
import {validatePackage} from '../src/editorial-content.js';
import {verifyGlobalDictionaryBindingBundle}
 from '../src/global-dictionary-bundle.js';
import {exportVerifiedBindingBundle}
 from '../src/ops-global-binding-manifests.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const actor={id:'ops-publisher',role:'publisher'};
const sample=(category)=>({
 version:2,sourceLabel:'dictionary-v2',
 book:{id:'story-'+category+'-e2e',title:'小说自动配卡-'+category,
  category,description:'该小说用统一字典主词卡'},
 chapters:[{id:'chapter-'+category+'-01',number:1,title:'第一章',
  preview:false,paragraphs:[
   {segments:[{text:'她决定 '},{surface:'record',gloss:'记录'},
     {text:' 这次比赛的经过。'}]},
   {segments:[{text:'他已经 '},{surface:'recorded',gloss:'录制'},
     {text:' 了一段完整的视频。'}]}
  ]}]
});
function setup(){
 const sql=new DatabaseSync(':memory:');
 try{
  for(const name of ['001_schema.sql','013_global_dictionary.sql',
    '014_global_dictionary_bindings.sql',
    '015_global_dictionary_book_bindings.sql',
    '016_global_dictionary_lessons.sql'])
   sql.exec(readFileSync(new URL('../db/'+name,import.meta.url),'utf8'));
  sql.exec('CREATE TABLE word_categories(word_id TEXT,category_id TEXT,'+
    'proficiency_note TEXT,PRIMARY KEY(word_id,category_id));');
  sql.prepare('INSERT INTO categories(id,slug,title) VALUES(?,?,?)')
   .run('cet4','cet4','大学英语四级');
  sql.prepare('INSERT INTO categories(id,slug,title) VALUES(?,?,?)')
   .run('cet6','cet6','大学英语六级');
  sql.prepare('INSERT INTO global_dictionary_sources '+
   '(source_key,license_name,license_reviewed,source_sha256,imported_entries,'+
   'imported_forms,imported_at,enabled) VALUES(?,?,?,?,?,?,?,?)')
   .run('reviewed_demo','MIT',1,'a'.repeat(64),2,1,'2026-11-10',1);
  for(const [id,word,reviewed] of [
   ['gdict_record','record',1],
   ['gdict_recorded','recorded',0]
  ])sql.prepare(
   'INSERT INTO global_dictionary_entries '+
   '(entry_id,headword,exam_levels_json,source_name,teaching_ready,reviewed_at) '+
   'VALUES(?,?,?,?,?,?)'
  ).run(id,word,'["cet4","cet6"]','reviewed_demo',reviewed,
    reviewed?'2026-11-10':null);
  sql.prepare('INSERT INTO global_dictionary_forms '+
   '(form,entry_id,source_name,reviewed) VALUES(?,?,?,?)')
   .run('recorded','gdict_record','reviewed_demo',1);
  sql.prepare('INSERT INTO global_dictionary_lessons '+
   '(entry_id,headword,senses_json,phonetic_uk,phonetic_us,part_of_speech,'+
   'meaning_zh,example_en,example_zh,collocations_json,reviewed_by,reviewed_at) '+
   'VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run('gdict_record','record',JSON.stringify([
   {pos:'n.',meaningZh:'记录',exampleEn:'Keep a record of it.',
    exampleZh:'保留这份记录。'},
   {pos:'v.',meaningZh:'录制',exampleEn:'They recorded a film.',
    exampleZh:'他们录制了一部影片。'}
  ]),'/ˈrekɔːd/','/ˈrekɔːrd/','n./v.','记录；录制',
  'They recorded the film.','他们录制了影片。',
  '[]','editor-01','2026-11-10');
  const db={prepare(query){
   const st=sql.prepare(query);
   const make=(args)=>({
    query,args,
    async first(){return st.get(...args)},
    async all(){return {results:st.all(...args)}},
    async run(){return st.run(...args)}
   });
   return {...make([]),bind(...args){return make(args)}};
  },async batch(stmts){
   sql.exec('BEGIN TRANSACTION');
   try{
    const result=stmts.map(s=>sql.prepare(s.query).run(...s.args));
    sql.exec('COMMIT');return result;
   }catch(e){sql.exec('ROLLBACK');throw e}
  }};
  return {sql,env:{DB:db,APP_ENV:'staging',
    GLOBAL_DICTIONARY_LOOKUP_ENABLED:'true',
    GLOBAL_DICTIONARY_BINDING_SAVE_ENABLED:'true',
    GLOBAL_DICTIONARY_BINDING_ATTACH_ENABLED:'true'}};
 }catch(e){sql.close();throw e}
}
// Test-only fixture in disposable SQLite. The production V1 import path
// deliberately REFUSES dictionary entry IDs as per-sense learning identities.
// This fixture allows binding/attach QA without adding a production bypass.
function seedDisposableDictionaryDraft(sql,input){
 assert.throws(()=>planOpsBookImport(validatePackage(input)),
  /DICTIONARY_SENSE_BINDING_REQUIRED/);
 sql.exec('BEGIN TRANSACTION');
 try{
  const b=input.book;
  sql.prepare("INSERT INTO books(id,category_id,title,description,status) VALUES(?,?,?,?,'draft')")
   .run(b.id,b.category,b.title,b.description||'');
  for(const w of input.words){
   sql.prepare('INSERT OR IGNORE INTO words '+
    '(id,headword,phonetic_uk,phonetic_us,part_of_speech,meaning_zh,example_en,example_zh,collocations_json) '+
    'VALUES(?,?,?,?,?,?,?,?,?)')
    .run(w.id,w.headword,w.phoneticUk,w.phoneticUs,w.partOfSpeech,w.meaningZh,
     w.exampleEn,w.exampleZh,JSON.stringify(w.collocations||[]));
   sql.prepare("INSERT OR IGNORE INTO word_categories(word_id,category_id,proficiency_note) VALUES(?,?,'')")
    .run(w.id,b.category);
  }
  for(const ch of input.chapters){
   sql.prepare('INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview) VALUES(?,?,?,?,?,?)')
    .run(ch.id,b.id,ch.number,ch.title,
     JSON.stringify({version:1,paragraphs:ch.paragraphs}),ch.preview?1:0);
   for(const [pi,p] of ch.paragraphs.entries()){
    const context=p.segments.map(s=>s.wordId?s.surface:s.text).join('');
    for(const [si,s] of p.segments.entries())if(s.wordId)
     sql.prepare('INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES(?,?,?,?)')
      .run(ch.id,s.wordId,context,'p'+pi+':s'+si);
   }
  }
  sql.exec('COMMIT');
 }catch(e){sql.exec('ROLLBACK');throw e}
}
test('E2E: CET4 and CET6 V2 candidate manifests bind only to disposable draft fixtures while normal V1 importer blocks dictionary IDs',async()=>{
 const {sql,env}=setup();
 try{
  const a=sample('cet4'),b=sample('cet6');
  const outputs=[];
  // A historical word remains intact while new books are attached.
  sql.prepare('INSERT INTO users(id,username,password_hash,password_salt) VALUES(?,?,?,?)')
   .run('existing-learner','existing-learner','hash','salt');
  sql.prepare('INSERT INTO words(id,headword,meaning_zh) VALUES(?,?,?)')
   .run('legacy-record','record','记录');
  sql.prepare('INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) '+
   'VALUES(?,?,?,?,?)').run('existing-learner','legacy-record','learning',1,
    '2026-11-11 12:00:00');
  sql.prepare('INSERT INTO review_events(id,user_id,word_id,game_type,result) VALUES(?,?,?,?,?)')
   .run('old-event','existing-learner','legacy-record','quick-review','correct');
  const before={
   user:sql.prepare('SELECT * FROM user_words').all(),
   events:sql.prepare('SELECT * FROM review_events').all(),
   entitlements:sql.prepare('SELECT * FROM entitlements').all()
  };
  for(const [n,source] of [a,b].entries()){
   const converted=await inspectStagingDictionaryNovelV2(env,{package:source});
   assert.equal(converted.ready_to_convert,true);
   assert.equal(converted.unique_main_cards,1);
   assert.equal(converted.approved_occurrences,2);
   assert.equal(converted.converted_package.words[0].id,'gdict_record');
   assert.deepEqual(converted.converted_package.chapters[0].paragraphs
     .map(p=>p.segments[1].wordId),['gdict_record','gdict_record']);
   const novel=converted.converted_package;
   const proof=await previewBindingManifest(env,{package:novel});
   assert.equal(proof.ready_to_stage,true,
    'E2E preflight must not force redundant manual decisions after V2 gloss review');
   assert.equal(proof.blockers.length,0);
   assert.ok(proof.manifest.bindings.some(x=>
     x.resolution==='canonical_anchored_reviewed_form'));
   const payload={
    package:novel,requestId:'dictionary-e2e-'+String(n).padStart(2,'0'),
    confirmSave:true,confirmAttach:true,
    expectedPackageSha256:proof.package_sha256,
    expectedBindingSha256:proof.binding_sha256
   };
   await saveStagingBindingManifest(env,payload,actor);
   const bundle=await exportVerifiedBindingBundle(env,payload,actor);
   const verified=await verifyGlobalDictionaryBindingBundle(bundle);
   assert.equal(verified.publication_allowed,false);
   seedDisposableDictionaryDraft(sql,novel);
   const attached=await attachDictionaryBindingsToStagingDraft(env,payload,actor);
   assert.equal(attached.attached,true);
   assert.equal(attached.published,false);
   assert.equal(attached.bindings,2);
   outputs.push({source:source.book.id,word_id:novel.words[0].id,
     binding_hash:proof.binding_sha256});
  }
  assert.deepEqual(outputs.map(x=>x.word_id),['gdict_record','gdict_record']);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM global_dictionary_book_bindings')
    .get().n,4);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM books WHERE status=?')
    .get('draft').n,2);
  assert.equal(sql.prepare('SELECT COUNT(DISTINCT word_id) AS n FROM chapter_words')
    .get().n,1);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM word_categories WHERE word_id=?')
    .get('gdict_record').n,2);
  assert.deepEqual(sql.prepare('SELECT * FROM user_words').all(),before.user);
  assert.deepEqual(sql.prepare('SELECT * FROM review_events').all(),before.events);
  assert.deepEqual(sql.prepare('SELECT * FROM entitlements').all(),before.entitlements);
 }finally{sql.close()}
});
test('E2E: an invented V2 target meaning remains blocked before any book or manifest write',async()=>{
 const {sql,env}=setup();
 try{
  const v2=sample('cet6');
  v2.chapters[0].paragraphs[1].segments[1].gloss='完全不存在的释义';
  const result=await inspectStagingDictionaryNovelV2(env,{package:v2});
  assert.equal(result.ready_to_convert,false);
  assert.equal(result.converted_package,undefined);
  assert.equal(result.review_queue.length,1);
  // The altered token is an ambiguous inflection and neither reviewed
  // candidate has this invented gloss; the safe outcome is review-required.
  assert.equal(result.review_queue[0].reason,
    'AMBIGUOUS_HEADWORD_OR_INFLECTION');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM books').get().n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM global_dictionary_binding_manifests')
    .get().n,0);
 }finally{sql.close()}
});


test('E2E: a V1 package cannot impersonate an approved canonical card using forged examples',async()=>{
 const {sql,env}=setup();
 try{
  const result=await inspectStagingDictionaryNovelV2(env,{package:sample('cet4')});
  assert.equal(result.ready_to_convert,true);
  const original=result.converted_package;
  const checked=await previewBindingManifest(env,{package:original});
  assert.equal(checked.ready_to_stage,true);
  const forged=structuredClone(original);
  forged.words[0].exampleEn='A fabricated marketing sentence replaces the reviewed dictionary example.';
  const rejected=await previewBindingManifest(env,{package:forged});
  assert.equal(rejected.ready_to_stage,false);
  assert.ok(rejected.blockers.some(x=>x.reason==='CANONICAL_WORD_CARD_CONTENT_MISMATCH'));
  await assert.rejects(()=>saveStagingBindingManifest(env,{
    package:forged,requestId:'forged-main-card-01',confirmSave:true,
    expectedPackageSha256:rejected.package_sha256,
    expectedBindingSha256:rejected.binding_sha256
  },actor),/BINDING_REVIEW_REQUIRED/);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM books').get().n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM global_dictionary_binding_manifests')
    .get().n,0);
 }finally{sql.close()}
});

test('E2E staging unmarked English auto-discovery requires an approved unique sense and never writes user data',async()=>{
 const {sql,env}=setup();
 try{
  sql.exec(readFileSync(new URL('../db/018_global_dictionary_reviewed_senses.sql',
   import.meta.url),'utf8'));
  for(const [sense_id,pos,meaning] of [
    ['gds_'+'1'.repeat(24),'n.','记录'],
    ['gds_'+'2'.repeat(24),'v.','录制']
  ]){
    sql.prepare(
     'INSERT INTO global_dictionary_senses(sense_id,entry_id,pos,meaning_zh,example_en,example_zh,reviewed_by,reviewed_at,approved,active) VALUES(?,?,?,?,?,?,?,?,1,1)'
    ).run(sense_id,'gdict_record',pos,meaning,
     pos==='n.'?'Keep a record of this.':'They record the song.',
     pos==='n.'?'把这件事记录下来。':'他们录制了这首歌。',
     'publisher-test','2026-11-11');
  }
  const source={version:2,book:{
   id:'novel-cet4-unmarked',category:'cet4',
   title:'试验中文小说',description:'中文故事未标注目标词'},
   chapters:[{number:1,paragraphs:[{
    segments:[{text:'他准备 record 那段短视频。'}]
   }]}]};
  const before=JSON.stringify(source);
  const result=await inspectStagingDictionaryAutoDiscovery(env,{package:source});
  assert.equal(result.proposed_occurrences,0);
  assert.equal(result.needs_review_occurrences,1);
  assert.equal(result.review_queue[0].reason,'MULTIPLE_APPROVED_SENSES_REQUIRE_CONTEXT');
  sql.prepare('UPDATE global_dictionary_senses SET active=0 WHERE pos=?').run('n.');
  const only=await inspectStagingDictionaryAutoDiscovery(env,{package:source});
  assert.equal(only.proposed_occurrences,1);
  assert.equal(only.suggestions[0].gloss,'录制');
  assert.equal(only.suggestions[0].action,
   'PROPOSE_ONLY_REQUIRES_CONTEXT_EDITOR_CONFIRMATION');
  assert.equal(only.production_d1_writes,0);
  assert.equal(only.publisher_signed_off,false);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM books').get().n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM user_words').get().n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM review_events').get().n,0);
  assert.equal(JSON.stringify(source),before);
  await assert.rejects(()=>inspectStagingDictionaryAutoDiscovery(
   {...env,APP_ENV:'production'},{package:source}),/DICTIONARY_V2_NOT_ENABLED/);
 }finally{sql.close()}
});
