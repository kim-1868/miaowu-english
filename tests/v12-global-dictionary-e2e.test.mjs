import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {inspectStagingDictionaryNovelV2} from '../src/ops-dictionary-v2.js';
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
function importDraft(sql,input){
 const valid=validatePackage(input),plan=planOpsBookImport(valid);
 sql.exec('BEGIN TRANSACTION');
 try{
  for(const query of plan.statements)
   sql.prepare(query.sql).run(...query.params);
  sql.exec('COMMIT');
 }catch(e){sql.exec('ROLLBACK');throw e}
}
test('E2E: CET4 and CET6 V2 novels reuse one approved global card, save verified manifests, and attach to drafts without touching users',async()=>{
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
   importDraft(sql,novel);
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
  assert.equal(result.review_queue[0].reason,
    'CONTEXT_GLOSS_NOT_IN_REVIEWED_DICTIONARY_SENSES');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM books').get().n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM global_dictionary_binding_manifests')
    .get().n,0);
 }finally{sql.close()}
});
