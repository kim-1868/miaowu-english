import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {previewBindingManifest,saveStagingBindingManifest,
  handleOpsBindingManifest} from '../src/ops-global-binding-manifests.js';
import {digestOpsToken} from '../src/ops-access.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const novel=()=>({
 version:1,
 book:{id:'story-cet6-new',title:'六级小说',category:'cet6'},
 words:[{id:'novel-record',headword:'record',meaningZh:'录制',
  phoneticUk:'/rɪˈkɔːd/',phoneticUs:'/rɪˈkɔːd/',
  partOfSpeech:'v.',exampleEn:'They record an interview.',
  exampleZh:'他们录制一次采访。'}],
 chapters:[{
  id:'ch01',number:1,title:'第1章',preview:false,
  paragraphs:[{segments:[{text:'他们决定 '},
   {wordId:'novel-record',surface:'record',gloss:'录制'},
   {text:' the interview.'}]}]
 }]
});
function setup(){
 const sql=new DatabaseSync(':memory:');
 try{
  sql.exec(readFileSync(new URL('../db/013_global_dictionary.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../db/014_global_dictionary_bindings.sql',import.meta.url),'utf8'));
  sql.exec('CREATE TABLE books(id TEXT PRIMARY KEY)');
  sql.exec('CREATE TABLE ops_operators(id TEXT, display_name TEXT, role TEXT,'+
   'environment TEXT, key_digest TEXT,is_active INTEGER,revoked_at TEXT)');
  sql.exec('CREATE TABLE ops_audit_events(id TEXT,actor_id TEXT,event_type TEXT,request_id TEXT)');
  sql.prepare('INSERT INTO global_dictionary_sources VALUES(?,?,?,?,?,?,?,?)').run(
   'owner_ecdict_exam_snapshot','MIT',1,'a'.repeat(64),1,0,
   '2026-11-10',1);
  sql.prepare('INSERT INTO global_dictionary_entries '+
   '(entry_id,headword,exam_levels_json,source_name,source_translation_unverified,'+
   'teaching_ready,reviewed_at) VALUES(?,?,?,?,?,?,?)').run(
    'gdict_record','record','["cet4","cet6"]','owner_ecdict_exam_snapshot',
    '记录；录制',1,'2026-11-10');
  const db={prepare(query){
    const st=sql.prepare(query);
    return {async all(){return {results:st.all()};},
     bind(...values){return {
       async all(){return {results:st.all(...values)};},
       async first(){return st.get(...values);},
       async run(){return st.run(...values);}
     }}};
  }};
  return {sql,db,env:{APP_ENV:'staging',
    DB:db,GLOBAL_DICTIONARY_LOOKUP_ENABLED:'true',
    GLOBAL_DICTIONARY_BINDING_SAVE_ENABLED:'true'}};
 }catch(e){sql.close();throw e}
}
const actor={id:'ops-publisher',role:'publisher'};
test('A3.2 full validated novel preview generates deterministic uncommitted evidence',async()=>{
 const {sql,env}=setup();
 try{
  const manuscript=novel(),copy=structuredClone(manuscript);
  const preview=await previewBindingManifest(env,{package:manuscript});
  assert.equal(preview.ready_to_stage,true);
  assert.equal(preview.approved_count,1);
  assert.equal(preview.total_targets,1);
  assert.match(preview.package_sha256,/^[0-9a-f]{64}$/);
  assert.match(preview.binding_sha256,/^[0-9a-f]{64}$/);
  assert.deepEqual(preview.manifest.bindings,[{
    chapter_number:1,paragraph_index:0,segment_index:1,
    legacy_word_id:'novel-record',entry_id:'gdict_record',
    normalized_surface:'record',resolution:'unique_verified_match'
  }]);
  assert.deepEqual(manuscript,copy);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM global_dictionary_binding_manifests').get().n,0);
  assert.equal((await previewBindingManifest(env,{package:manuscript})).binding_sha256,
    preview.binding_sha256);
 }finally{sql.close()}
});
test('A3.2 explicit confirmation saves immutable sidecar only, idempotently',async()=>{
 const {sql,env}=setup();
 try{
  const pack=novel();
  const preview=await previewBindingManifest(env,{package:pack});
  const request={package:pack,expectedPackageSha256:preview.package_sha256,
    expectedBindingSha256:preview.binding_sha256,
    requestId:'candidate-book-001',confirmSave:true};
  const saved=await saveStagingBindingManifest(env,request,actor);
  assert.equal(saved.stored,true);
  assert.equal(saved.status,'candidate');
  assert.equal(saved.published,false);
  assert.equal(saved.userDataChanged,false);
  const savedAgain=await saveStagingBindingManifest(env,request,actor);
  assert.equal(savedAgain.idempotent,true);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM global_dictionary_binding_manifests').get().n,1);
  const stored=sql.prepare('SELECT * FROM global_dictionary_binding_manifests').get();
  assert.equal(stored.actor_id,actor.id);
  assert.equal(stored.package_sha256,preview.package_sha256);
  assert.equal(stored.binding_sha256,preview.binding_sha256);
  assert.equal(stored.total_occurrences,1);
  assert.equal(JSON.parse(stored.bindings_json)[0].legacy_word_id,'novel-record');
  assert.equal(sql.prepare('SELECT count(*) AS n FROM books').get().n,0);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM ops_audit_events').get().n,0);
 }finally{sql.close()}
});
test('A3.2 blocks stale preview, guessed decisions, and ID reuse',async()=>{
 const {sql,env}=setup();
 try{
  const p=novel(),v=await previewBindingManifest(env,{package:p});
  const base={package:p,requestId:'candidate-book-002',confirmSave:true,
    expectedPackageSha256:v.package_sha256,
    expectedBindingSha256:v.binding_sha256};
  await assert.rejects(()=>saveStagingBindingManifest(env,{
    ...base,expectedBindingSha256:'b'.repeat(64)
  },actor),/STALE_BINDING_PREVIEW/);
  await assert.rejects(()=>saveStagingBindingManifest(env,{
    ...base,confirmSave:false
  },actor),/INVALID_BINDING_CONFIRMATION/);
  const other=novel();other.book.title='另一篇标题';
  await assert.rejects(()=>saveStagingBindingManifest(env,{
    ...base,package:other
  },actor),/STALE_BINDING_PREVIEW/);
  await saveStagingBindingManifest(env,base,actor);
  const different=novel();different.book.id='story-cet6-two';
  const another=await previewBindingManifest(env,{package:different});
  await assert.rejects(()=>saveStagingBindingManifest(env,{
    package:different,requestId:base.requestId,confirmSave:true,
    expectedPackageSha256:another.package_sha256,
    expectedBindingSha256:another.binding_sha256
  },actor),/BINDING_REQUEST_ID_CONFLICT/);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM global_dictionary_binding_manifests').get().n,1);
 }finally{sql.close()}
});
test('A3.2 never uses a new candidate save to bypass existing book revision 409',async()=>{
 const {sql,env}=setup();
 try{
  const packageData=novel(),preview=await previewBindingManifest(env,{package:packageData});
  sql.prepare('INSERT INTO books(id) VALUES(?)').run(packageData.book.id);
  await assert.rejects(()=>saveStagingBindingManifest(env,{
   package:packageData,expectedPackageSha256:preview.package_sha256,
   expectedBindingSha256:preview.binding_sha256,
   confirmSave:true,requestId:'candidate-book-004'
  },actor),/EXISTING_BOOK_REQUIRES_VERSIONED_REVISION/);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM global_dictionary_binding_manifests').get().n,0);
 }finally{sql.close()}
});
test('A3.2 fails closed if dictionary source unapproved, or content has missing word IDs',async()=>{
 const {sql,env}=setup();
 try{
  sql.exec('UPDATE global_dictionary_sources SET enabled=0,license_reviewed=0');
  const unapproved=await previewBindingManifest(env,{package:novel()});
  assert.equal(unapproved.ready_to_stage,false);
  assert.equal(unapproved.approved_count,0);
  await assert.rejects(()=>saveStagingBindingManifest(env,{
   package:novel(),requestId:'candidate-book-005',confirmSave:true,
   expectedPackageSha256:unapproved.package_sha256,
   expectedBindingSha256:unapproved.binding_sha256
  },actor),/BINDING_REVIEW_REQUIRED/);
  const invalid=novel();
  invalid.chapters[0].paragraphs[0].segments[1].wordId='missing-word';
  await assert.rejects(()=>previewBindingManifest(env,{package:invalid}),
    /unknown wordId/);
 }finally{sql.close()}
});
test('A3.2 permissions restrict both preview and candidate save to staging publishers',async()=>{
 const {sql,db,env}=setup();
 try{
  const req=new Request('https://example.com/api/ops/import/bindings/confirm',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({package:novel()})
  });
  const prod=await handleOpsBindingManifest(req,{...env,APP_ENV:'production'},
    '/api/ops/import/bindings/confirm');
  assert.equal(prod.status,404);
  const unauthorized=await handleOpsBindingManifest(req,{...env,OPS_TOKEN_PEPPER:'b'.repeat(64)},
    '/api/ops/import/bindings/confirm');
  assert.equal(unauthorized.status,401);
  const token='mwops_'+'c'.repeat(64),pepper='d'.repeat(64);
  const digest=await digestOpsToken(token,pepper);
  sql.prepare('INSERT INTO ops_operators VALUES(?,?,?,?,?,?,?)').run(
   'ops-publisher','Publisher','publisher','staging',digest,1,null);
  const previewRequest=new Request('https://example.com/api/ops/import/bindings/preview',{
   method:'POST',headers:{'content-type':'application/json','X-Mw-Ops-Key':token},
   body:JSON.stringify({package:novel()})
  });
  const result=await handleOpsBindingManifest(previewRequest,{
    ...env,OPS_TOKEN_PEPPER:pepper
  },'/api/ops/import/bindings/preview');
  assert.equal(result.status,200);
  assert.equal((await result.json()).ready_to_stage,true);
  const block=await handleOpsBindingManifest(req,{
    ...env,GLOBAL_DICTIONARY_BINDING_SAVE_ENABLED:'false',
    OPS_TOKEN_PEPPER:pepper
  },'/api/ops/import/bindings/confirm');
  assert.equal(block.status,401);
 }finally{sql.close()}
});
