import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {collectPublishedFirstSenseReviewPacket as collect}
 from '../scripts/v12-first-published-sense-review-packet.mjs';
import {canonicalOpsBatchReceipt,compileSignedNonQaPublishedStagingPlan as compile}
 from '../scripts/v12-signed-first-published-test-link-plan.mjs';
import {listPublishedApprovedLegacySenseAnchors}
 from '../src/global-dictionary-published-approved-legacy-overlay.js';

const sha=s=>createHash('sha256').update(s).digest('hex');
const source='wordletter-owner-original-card';
const entry='gdict_'+'a'.repeat(24);
function old(i){
 return {book_id:'real-book-'+i,chapter_id:'real-chapter-'+i,anchor:'p0:s0',
 legacy_word_id:'real-old-'+i,old_headword:'choice',old_uk:'/tʃɔɪs/',
 old_us:'/tʃɔɪs/',old_pos:'n.',old_meaning:'选择',
 old_en:'She made a careful choice.',old_zh:'她做出了谨慎的选择。',
 old_collocations:'[]',entry_id:entry,source_name:source,
 source_key:source,license_name:'owner-original-verified',license_reviewed:1,
 source_enabled:1,source_sha256:'f'.repeat(64),
 existing_sense_id:null,context_word_id:'real-old-'+i,context_gloss:'选择'};
}
function setup(){
 const packet=collect([{success:true,results:[old(1),old(2)]}]);
 const d=structuredClone(packet.default_hold_decisions[0]);
 d.action='request_signoff';d.selected_pos='n.';d.selected_meaning_zh='选择';
 d.phonetic_uk='/tʃɔɪs/';d.phonetic_us='/tʃɔɪs/';
 d.example_en='She made a careful choice.';
 d.example_zh='她做出了谨慎的选择。';
 d.reviewer={identity:'editor-test',reviewed_at:'2026-11-12T15:00:00Z',note:'synthetic only'};
 for(const k of Object.keys(d.checks))d.checks[k]={value:true,evidence:'synthetic-check'};
 d.license={basis:'original author',reference:'internal signed synthetic license',
  allows_commercial_use:true,english_example_rights:'original author',
  chinese_example_rights:'original author'};
 const decisions=[d];
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const key=publicKey.export({type:'spki',format:'pem'});
 const receipt={schema:'wordletter-ops-published-sense-batch-v1',
  packet_sha256:sha(JSON.stringify(packet)),
  decisions_sha256:sha(JSON.stringify(decisions)),
  approved_candidate_hashes:[packet.review_candidates[0].candidate_hash_sha256],
  reviewer_id:'editor-test',ops_audit_id:'synthetic-ops-event-001',
  signed_at:'2026-11-12T15:00:00Z',
  target_database_id:'88a817cb-23bb-4ae4-bcb8-92286c4165d4'};
 receipt.signature_b64=sign(null,Buffer.from(canonicalOpsBatchReceipt(receipt)),
  privateKey).toString('base64');
 return {packet,decisions,receipt,trustedOpsPublicKeyPem:key};
}
const file=x=>readFileSync(new URL(x,import.meta.url),'utf8');
function database(){
 const db=new DatabaseSync(':memory:');
 db.exec(file('../db/001_schema.sql'));
 for(const f of ['../db/013_global_dictionary.sql',
  '../db/016_global_dictionary_lessons.sql',
  '../db/018_global_dictionary_reviewed_senses.sql'])db.exec(file(f));
 db.prepare("INSERT INTO categories(id,slug,title,is_visible) VALUES('cet4','cet4','四级',1)").run();
 db.prepare('INSERT INTO global_dictionary_sources'+
  ' (source_key,license_name,license_reviewed,source_sha256,imported_at,enabled)'+
  ' VALUES(?,?,?,?,?,?)').run(source,'owner-original-verified',1,'f'.repeat(64),
    '2026-11-12T15:00:00Z',1);
 db.prepare('INSERT INTO global_dictionary_entries'+
  ' (entry_id,headword,source_name,teaching_ready) VALUES(?,?,?,0)')
  .run(entry,'choice',source);
 for(let i=1;i<=2;i++){
  const id='real-book-'+i,chapter='real-chapter-'+i,word='real-old-'+i;
  db.prepare("INSERT INTO books(id,category_id,title,status,sort_order) VALUES(?, 'cet4',?, 'published',0)")
   .run(id,id);
  db.prepare('INSERT INTO chapters'+
   ' (id,book_id,chapter_no,title,content_json,is_preview,published_at)'+
   ' VALUES(?,?,1,?,?,1,CURRENT_TIMESTAMP)')
   .run(chapter,id,chapter,JSON.stringify({paragraphs:[{segments:[{
    surface:'choice',wordId:word,gloss:'选择'}]}]}));
  db.prepare('INSERT INTO words'+
   ' (id,headword,phonetic_uk,phonetic_us,part_of_speech,meaning_zh,'+
   'example_en,example_zh,collocations_json) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(word,'choice','/tʃɔɪs/','/tʃɔɪs/','n.','选择',
    'She made a careful choice.','她做出了谨慎的选择。','[]');
  db.prepare('INSERT INTO chapter_words'+
   ' (chapter_id,word_id,context_anchor,context_sentence) VALUES(?,?,?,?)')
   .run(chapter,word,'p0:s0','She made a careful choice.');
 }
 return db;
}
class BoundDB {
 constructor(db){this.db=db}
 prepare(query){const db=this.db;return {bind(...args){return{
  all:async()=>({results:db.prepare(query).all(...args)})}}}}
}
test('signed commercial review plan compiles TEST-only lesson/sense/legacy links; SQLite reader connects real published A/B',async()=>{
 const plan=compile(setup());
 assert.equal(plan.status,'SIGNED_STAGING_SQL_PLAN_ONLY_NOT_APPLIED');
 assert.equal(plan.expected_lessons,1);
 assert.equal(plan.expected_senses,1);
 assert.equal(plan.expected_legacy_links,2);
 assert.equal(plan.database_writes_performed,0);
 assert.equal(plan.production_access,false);
 assert.doesNotMatch(plan.sql,/\b(?:UPDATE user_words|UPDATE entitlements|DROP TABLE|DELETE FROM|wrangler deploy)\b/i);
 const db=database();
 try{
  db.exec(plan.sql);
  const count=q=>db.prepare(q).get().n;
  assert.equal(count('SELECT count(*) n FROM global_dictionary_senses WHERE approved=1'),1);
  assert.equal(count('SELECT count(*) n FROM global_dictionary_lessons'),1);
  assert.equal(count('SELECT count(*) n FROM global_dictionary_legacy_sense_links'),2);
  assert.equal(count('SELECT count(*) n FROM user_words'),0);
  const a=await listPublishedApprovedLegacySenseAnchors(new BoundDB(db),
   {chapterId:'real-chapter-1',userId:'guest'});
  const b=await listPublishedApprovedLegacySenseAnchors(new BoundDB(db),
   {chapterId:'real-chapter-2',userId:'guest'});
  assert.equal(a.anchors.length,1);
  assert.equal(b.anchors.length,1);
  assert.equal(a.anchors[0].sense_id,b.anchors[0].sense_id);
  assert.throws(()=>db.exec(plan.sql));
 }finally{db.close()}
});
test('missing signed proof, forged key, tampered review, wrong DB, unreviewed license are refused',()=>{
 const x=setup();
 assert.throws(()=>compile({...x,receipt:null}));
 const forged=setup();
 assert.throws(()=>compile({...x,trustedOpsPublicKeyPem:forged.trustedOpsPublicKeyPem}),
  /OPS_SIGNATURE_INVALID/);
 assert.throws(()=>compile({...x,decisions:[]}),/OPS_SIGNED_REVIEW_DECISIONS_CHANGED/);
 assert.throws(()=>compile({...x,receipt:{...x.receipt,target_database_id:'PRODUCTION'}}),
  /OPS_SIGNATURE_TEST_DB_ONLY/);
 const y=setup();y.packet.review_candidates[0].license_reviewed=false;
 assert.throws(()=>compile(y),/OPS_SIGNED_SOURCE_PACKET_CHANGED/);
 const z=setup();z.receipt.approved_candidate_hashes=[];
 assert.throws(()=>compile(z),/OPS_SIGNED_CANDIDATE_IDS_REQUIRED/);
});
