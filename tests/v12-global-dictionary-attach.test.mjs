import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash,webcrypto} from 'node:crypto';
import {validatePackage} from '../src/editorial-content.js';
import {planOpsBookImport} from '../src/ops-import.js';
import {previewBindingManifest,saveStagingBindingManifest}
 from '../src/ops-global-binding-manifests.js';
import {attachDictionaryBindingsToStagingDraft,
 handleOpsDictionaryAttach} from '../src/global-dictionary-attach.js';
import {digestOpsToken} from '../src/ops-access.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const novel=()=>({
 version:1,book:{id:'story-cet6-auto',title:'六级自动匹配小说',category:'cet6',
   description:'原创六级学习故事'},
 words:[{id:'old-record',headword:'record',meaningZh:'录制',
  phoneticUk:'/rɪˈkɔːd/',phoneticUs:'/rɪˈkɔːd/',
  partOfSpeech:'v.',exampleEn:'She records her thoughts.',
  exampleZh:'她录下自己的想法。',collocations:[]}],
 chapters:[{id:'chapter-01',number:1,title:'第一章',preview:false,
  paragraphs:[{segments:[{text:'她打算 '},
   {wordId:'old-record',surface:'record',gloss:'录制'},
   {text:' 一段短片。'}]},{segments:[
   {text:'随后，她又 '},{wordId:'old-record',surface:'record',gloss:'录制'},
   {text:' 了一段新片。'}
  ]}]
 }]
});
const actor={id:'ops-publisher',role:'publisher'};
function setup(){
 const sql=new DatabaseSync(':memory:');
 try{
  sql.exec(readFileSync(new URL('../db/001_schema.sql',import.meta.url),'utf8'));
  for(const file of ['013_global_dictionary.sql','014_global_dictionary_bindings.sql',
    '015_global_dictionary_book_bindings.sql'])
    sql.exec(readFileSync(new URL('../db/'+file,import.meta.url),'utf8'));
  sql.exec('CREATE TABLE ops_operators(id TEXT,display_name TEXT,role TEXT,'+
    'environment TEXT,key_digest TEXT,is_active INTEGER,revoked_at TEXT);');
  sql.exec('CREATE TABLE ops_audit_events(id TEXT,actor_id TEXT,event_type TEXT,request_id TEXT);');
  sql.prepare('INSERT INTO categories(id,slug,title) VALUES(?,?,?)')
    .run('cet6','cet6','大学英语六级');
  sql.prepare('INSERT INTO global_dictionary_sources VALUES(?,?,?,?,?,?,?,?)').run(
    'owner_ecdict_exam_snapshot','MIT',1,'a'.repeat(64),1,0,
    '2026-11-10',1);
  sql.prepare('INSERT INTO global_dictionary_entries '+
    '(entry_id,headword,exam_levels_json,source_name,teaching_ready,reviewed_at) '+
    'VALUES(?,?,?,?,?,?)').run(
      'gdict_record','record','["cet4","cet6"]',
      'owner_ecdict_exam_snapshot',1,'2026-11-10');
  const db={
   prepare(query){
    const make=(args)=>({
      query,args,
      async all(){return {results:sql.prepare(query).all(...args)};},
      async first(){return sql.prepare(query).get(...args);},
      async run(){return sql.prepare(query).run(...args);}
    });
    return { ...make([]),bind(...args){return make(args)}};
   },
   async batch(statements){
    sql.exec('BEGIN TRANSACTION');
    try{
     const out=statements.map(q=>sql.prepare(q.query).run(...q.args));
     sql.exec('COMMIT');
     return out;
    }catch(error){sql.exec('ROLLBACK');throw error}
   }
  };
  const env={APP_ENV:'staging',DB:db,
   GLOBAL_DICTIONARY_LOOKUP_ENABLED:'true',
   GLOBAL_DICTIONARY_BINDING_SAVE_ENABLED:'true',
   GLOBAL_DICTIONARY_BINDING_ATTACH_ENABLED:'true'};
  return {sql,db,env};
 }catch(error){sql.close();throw error}
}
async function store(env,pack){
 const r=await previewBindingManifest(env,{package:pack});
 const payload={
   package:pack,requestId:'attach-candidate-001',
   confirmSave:true,confirmAttach:true,
   expectedPackageSha256:r.package_sha256,
   expectedBindingSha256:r.binding_sha256
 };
 await saveStagingBindingManifest(env,payload,actor);
 return payload;
}
function importOriginal(sql,pack){
 const plan=planOpsBookImport(validatePackage(pack));
 sql.exec('BEGIN TRANSACTION');
 try{
  for(const item of plan.statements)sql.prepare(item.sql).run(...item.params);
  sql.exec('COMMIT');
 }catch(e){sql.exec('ROLLBACK');throw e}
}
test('A4.2 exactly matching imported draft receives separate canonical dictionary bindings with no reader changes',async()=>{
 const {sql,env}=setup();
 try{
  const pack=novel(),saved=await store(env,pack);
  await assert.rejects(()=>attachDictionaryBindingsToStagingDraft(env,saved,actor),
    /IMPORT_BOOK_DRAFT_FIRST/);
  importOriginal(sql,pack);
  const beforeWords=sql.prepare('SELECT COUNT(*) AS n FROM words').get().n;
  const beforeAnchors=sql.prepare('SELECT COUNT(*) AS n FROM chapter_words').get().n;
  const response=await attachDictionaryBindingsToStagingDraft(env,saved,actor);
  assert.equal(response.attached,true);
  assert.equal(response.idempotent,false);
  assert.equal(response.bindings,2);
  assert.equal(response.published,false);
  assert.equal(response.readerSwitched,false);
  assert.equal(response.userDataChanged,false);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM global_dictionary_book_bindings').get().n,2);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM chapter_words').get().n,beforeAnchors);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM words').get().n,beforeWords);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM user_words').get().n,0);
  assert.equal(sql.prepare('SELECT status FROM books WHERE id=?').get(pack.book.id).status,'draft');
  const rows=sql.prepare('SELECT context_anchor,entry_id,legacy_word_id '+
     'FROM global_dictionary_book_bindings ORDER BY context_anchor').all();
  assert.deepEqual(rows.map(r=>r.entry_id),['gdict_record','gdict_record']);
  assert.deepEqual(rows.map(r=>r.context_anchor),['p0:s1','p1:s1']);
  assert.ok(rows.every(r=>r.legacy_word_id==='old-record'));
  const duplicate=await attachDictionaryBindingsToStagingDraft(env,saved,actor);
  assert.equal(duplicate.idempotent,true);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM global_dictionary_book_bindings').get().n,2);
 }finally{sql.close()}
});
test('A4.2 prevents attachment if published status, changed chapter text or changed anchors',async()=>{
 const {sql,env}=setup();
 try{
  const pack=novel(),saved=await store(env,pack);
  importOriginal(sql,pack);
  sql.exec("UPDATE books SET status='published'");
  await assert.rejects(()=>attachDictionaryBindingsToStagingDraft(env,saved,actor),
    /BINDING_ATTACH_REQUIRES_DRAFT/);
  sql.exec("UPDATE books SET status='draft'");
  sql.exec("UPDATE chapters SET title='被修改'");
  await assert.rejects(()=>attachDictionaryBindingsToStagingDraft(env,saved,actor),
    /UPLOADED_NOVEL_CHAPTER_DRIFT/);
  sql.prepare('UPDATE chapters SET title=?').run(pack.chapters[0].title);
  sql.exec("UPDATE chapter_words SET context_anchor='p8:s8' WHERE context_anchor='p0:s1'");
  await assert.rejects(()=>attachDictionaryBindingsToStagingDraft(env,saved,actor),
    /UPLOADED_NOVEL_WORD_ANCHOR_DRIFT/);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM global_dictionary_book_bindings').get().n,0);
 }finally{sql.close()}
});
test('A4.2 rejects stale or tampered manifest, operator change and revoked dictionary review',async()=>{
 const {sql,env}=setup();
 try{
  const pack=novel(),saved=await store(env,pack);
  importOriginal(sql,pack);
  await assert.rejects(()=>attachDictionaryBindingsToStagingDraft(env,{
    ...saved,expectedBindingSha256:'f'.repeat(64)
  },actor),/STALE_BINDING_PREVIEW/);
  await assert.rejects(()=>attachDictionaryBindingsToStagingDraft(env,saved,{
    id:'ops-other',role:'publisher'
  }),/BINDING_ACTOR_MISMATCH/);
  sql.prepare('UPDATE global_dictionary_binding_manifests SET bindings_json=?')
    .run('[{"entry_id":"gdict_fake"}]');
  await assert.rejects(()=>attachDictionaryBindingsToStagingDraft(env,saved,actor),
    /BINDING_STORED_MANIFEST_CORRUPTED/);
  sql.prepare('UPDATE global_dictionary_binding_manifests SET bindings_json=?')
    .run(JSON.stringify((await previewBindingManifest(env,saved)).manifest.bindings));
  sql.exec('UPDATE global_dictionary_sources SET enabled=0,license_reviewed=0');
  await assert.rejects(()=>attachDictionaryBindingsToStagingDraft(env,saved,actor),
    /BINDING_REVIEW_REQUIRED/);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM global_dictionary_book_bindings').get().n,0);
 }finally{sql.close()}
});
test('A4.2 fails closed on a disabled staging switch and never exposes production endpoint',async()=>{
 const {sql,env}=setup();
 try{
  const pack=novel(),saved=await store(env,pack);
  importOriginal(sql,pack);
  await assert.rejects(()=>attachDictionaryBindingsToStagingDraft({
    ...env,GLOBAL_DICTIONARY_BINDING_ATTACH_ENABLED:'false'
  },saved,actor),/GLOBAL_BINDING_ATTACH_DISABLED/);
  const req=new Request('https://example.com/api/ops/import/bindings/attach',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(saved)
  });
  const prod=await handleOpsDictionaryAttach(req,{...env,APP_ENV:'production'},
    '/api/ops/import/bindings/attach');
  assert.equal(prod.status,404);
  const stagingNoToken=await handleOpsDictionaryAttach(req,{
    ...env,OPS_TOKEN_PEPPER:'a'.repeat(64)
  },'/api/ops/import/bindings/attach');
  assert.equal(stagingNoToken.status,401);
 }finally{sql.close()}
});
