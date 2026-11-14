// TEST D1 only: build a *proposed* SQL binding plan from independently signed
// Publisher/OPS editorial evidence. Produces SQL in private workspace only;
// no direct Cloudflare API, no production connection, no user SRS modifications.
// The trusted Ed25519 public key MUST be pinned from the authenticated OPS
// signing authority, never accepted from the editable review packet itself.
import assert from 'node:assert/strict';
import {createHash,verify,createPublicKey} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validatePrivateSenseReviewDecisions} from '../src/global-dictionary-editorial-signoff-gate.js';

const sha=x=>createHash('sha256').update(x).digest('hex');
const qt=x=>"'"+String(x).replaceAll("'","''")+"'";
const norm=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const h=x=>String(x??'').normalize('NFKC').trim().toLowerCase();
const p=x=>h(x).replace(/[.。]/gu,'');
const DIGEST=/^[a-f0-9]{64}$/u;
const ENTRY=/^gdict_[a-f0-9]{24}$/u;
const SENSE=/^gds_[a-f0-9]{24}$/u;
const QA=/^(?:mw-v12-pilot-|qa-|draft-|internal-)/iu;
const QA_SOURCE=/^(?:wordletter-internal-qa|qa-|test-|internal-)/iu;
const D1_ID='88a817cb-23bb-4ae4-bcb8-92286c4165d4';
export function canonicalOpsBatchReceipt(receipt){
 const data={schema:receipt.schema,packet_sha256:receipt.packet_sha256,
  decisions_sha256:receipt.decisions_sha256,
  approved_candidate_hashes:receipt.approved_candidate_hashes,
  reviewer_id:receipt.reviewer_id,ops_audit_id:receipt.ops_audit_id,
  signed_at:receipt.signed_at,target_database_id:receipt.target_database_id};
 return JSON.stringify(data);
}
function authenticated(receipt,packet,decisions,publicKeyPem){
 assert.equal(receipt?.schema,'wordletter-ops-published-sense-batch-v1',
  'OPS_SIGNATURE_SCHEMA_REQUIRED');
 assert.equal(receipt.target_database_id,D1_ID,'OPS_SIGNATURE_TEST_DB_ONLY');
 assert.ok(typeof receipt.reviewer_id==='string'&&receipt.reviewer_id.trim()&&
  typeof receipt.ops_audit_id==='string'&&receipt.ops_audit_id.trim(),
  'OPS_AUTHENTICATED_EDITOR_AUDIT_REQUIRED');
 assert.ok(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(receipt.signed_at||''),
  'OPS_SIGNED_TIMESTAMP_REQUIRED');
 assert.equal(receipt.packet_sha256,sha(JSON.stringify(packet)),
  'OPS_SIGNED_SOURCE_PACKET_CHANGED');
 assert.equal(receipt.decisions_sha256,sha(JSON.stringify(decisions)),
  'OPS_SIGNED_REVIEW_DECISIONS_CHANGED');
 assert.ok(Array.isArray(receipt.approved_candidate_hashes)&&
  receipt.approved_candidate_hashes.length>0&&
  receipt.approved_candidate_hashes.every(x=>DIGEST.test(x))&&
  new Set(receipt.approved_candidate_hashes).size===receipt.approved_candidate_hashes.length,
  'OPS_SIGNED_CANDIDATE_IDS_REQUIRED');
 assert.ok(typeof publicKeyPem==='string'&&publicKeyPem.includes('BEGIN PUBLIC KEY'),
  'OPS_TRUSTED_PUBLIC_KEY_REQUIRED');
 let valid=false;
 try{const key=createPublicKey(publicKeyPem);
  assert.equal(key.asymmetricKeyType,'ed25519','OPS_ED25519_ONLY');
  valid=verify(null,Buffer.from(canonicalOpsBatchReceipt(receipt)),key,
   Buffer.from(receipt.signature_b64||'','base64'));
 }catch{valid=false}
 assert.ok(valid,'OPS_SIGNATURE_INVALID');
}
export function compileSignedNonQaPublishedStagingPlan({packet,decisions,receipt,
 trustedOpsPublicKeyPem}={}){
 assert.equal(packet?.schema,'wordletter-first-real-published-intake-v1',
  'SIGNED_PILOT_WRONG_PACKET');
 assert.equal(packet?.scope,'staging_non_qa_published_books_only',
  'SIGNED_PILOT_WRONG_SCOPE');
 assert.equal(packet?.actual_approved_senses_created,0);
 assert.equal(packet?.actual_links_created,0);
 assert.ok(Array.isArray(packet?.review_candidates)&&packet.review_candidates.length>0,
  'SIGNED_PILOT_NO_REAL_CANDIDATES');
 assert.ok(Array.isArray(decisions),'SIGNED_PILOT_DECISIONS_REQUIRED');
 authenticated(receipt,packet,decisions,trustedOpsPublicKeyPem);
 const allowed=new Set(receipt.approved_candidate_hashes);
 const decisionsByHash=new Map(decisions.map(d=>[d.source_candidate_sha256,d]));
 assert.equal(decisionsByHash.size,decisions.length,'SIGNED_PILOT_DUPLICATE_DECISION');
 const reviewed=validatePrivateSenseReviewDecisions(packet.review_candidates,decisions);
 const proposals=new Map(reviewed.proposals.map(x=>[x.source_candidate_sha256,x]));
 const approved=[],allIds=new Set();
 for(const item of packet.review_candidates){
  if(!allowed.has(item.candidate_hash_sha256))continue;
  const d=decisionsByHash.get(item.candidate_hash_sha256);
  assert.equal(proposals.get(item.candidate_hash_sha256)?.status,
   'READY_FOR_AUTHENTICATED_OPS_FINAL_SIGNOFF','SIGNED_PILOT_EDITORIAL_REVIEW_NOT_READY');
  assert.ok(ENTRY.test(item.entry_id)&&DIGEST.test(item.candidate_hash_sha256),
   'SIGNED_PILOT_INVALID_DICTIONARY_ID');
  assert.ok(item.license_reviewed===true&&item.source_enabled===true&&
   !QA_SOURCE.test(item.source_name)&&
   item.source_name===item.source_key&&DIGEST.test(item.source_sha256),
   'SIGNED_PILOT_ORIGINAL_SOURCE_LICENSE_NOT_VERIFIED');
  assert.ok(Array.isArray(item.old_cards)&&item.old_cards.length>0,
   'SIGNED_PILOT_MISSING_CURRENT_LEGACY_CARDS');
  assert.ok(h(d.headword)===h(item.headword)&&p(d.selected_pos)===p(item.part_of_speech)&&
   norm(d.selected_meaning_zh)===norm(item.meaning_zh),
   'SIGNED_PILOT_REVIEWED_SENSE_CHANGED');
  const seen=new Set();
  for(const card of item.old_cards){
   assert.ok(typeof card.legacy_word_id==='string'&&
    typeof card.book_id==='string'&&!QA.test(card.book_id)&&
    typeof card.chapter_id==='string'&&
    /^p(?:0|[1-9]\d*):s(?:0|[1-9]\d*)$/u.test(card.anchor)&&
    norm(card.context_gloss)===norm(item.meaning_zh)&&
    DIGEST.test(card.old_card_sha256),'SIGNED_PILOT_INVALID_PUBLISHED_ANCHOR');
   const k=card.chapter_id+':'+card.anchor;
   assert.ok(!seen.has(k),'SIGNED_PILOT_DUPLICATE_ANCHOR');
   seen.add(k);
   const identity=[card.legacy_word_id,item.headword,card.phonetic_uk,
    card.phonetic_us,item.part_of_speech,item.meaning_zh,
    card.example_en,card.example_zh,card.collocations_json];
   assert.equal(card.old_card_sha256,sha(JSON.stringify(identity)),
    'SIGNED_PILOT_OLD_CARD_HASH_CHANGED');
   allIds.add(card.legacy_word_id);
  }
  approved.push({item,decision:d});
 }
 assert.equal(approved.length,allowed.size,'SIGNED_PILOT_SIGNED_CANDIDATE_MISSING');
 assert.ok(approved.length>0&&approved.length<=20,'SIGNED_PILOT_LIMIT');
 // An old ID may appear in multiple chapters of the same sense, but never
 // in two distinct approved senses.
 const oldToSense=new Map(),byEntry=new Map(),statements=[];
 for(const {item,decision:d} of approved){
  const sense='gds_'+sha(item.candidate_hash_sha256+'\0'+item.entry_id).slice(0,24);
  assert.ok(SENSE.test(sense));
  for(const old of item.old_word_ids){
   assert.ok(!oldToSense.has(old)||oldToSense.get(old)===sense,
    'SIGNED_PILOT_AMBIGUOUS_OLD_ID');
   oldToSense.set(old,sense);
  }
  if(!byEntry.has(item.entry_id))byEntry.set(item.entry_id,[]);
  byEntry.get(item.entry_id).push({item,d,sense});
 }
 for(const [entry,items] of byEntry){
  const first=items[0],it=first.item;
  assert.ok(items.every(x=>x.item.source_name===it.source_name&&
   x.item.source_sha256===it.source_sha256&&
   h(x.item.headword)===h(it.headword)&&
   x.d.phonetic_uk===first.d.phonetic_uk&&
   x.d.phonetic_us===first.d.phonetic_us),
   'SIGNED_PILOT_ONE_CARD_SOURCE_OR_IPA_CONFLICT');
  const lessonSenses=items.map(x=>({pos:x.d.selected_pos,
   meaningZh:x.d.selected_meaning_zh,exampleEn:x.d.example_en,
   exampleZh:x.d.example_zh}));
  statements.push('UPDATE global_dictionary_entries SET teaching_ready=1, reviewed_at='+
   qt(receipt.signed_at)+' WHERE entry_id='+qt(entry)+
   ' AND headword='+qt(it.headword)+' COLLATE NOCASE'+
   ' AND source_name='+qt(it.source_name)+' AND teaching_ready=0'+
   ' AND EXISTS(SELECT 1 FROM global_dictionary_sources src WHERE src.source_key='+
   qt(it.source_name)+' AND src.source_sha256='+qt(it.source_sha256)+
   ' AND src.enabled=1 AND src.license_reviewed=1);');
  const cols=['entry_id','headword','senses_json','phonetic_uk','phonetic_us',
   'part_of_speech','meaning_zh','example_en','example_zh','collocations_json',
   'reviewed_by','reviewed_at'];
  const values=[entry,it.headword,JSON.stringify(lessonSenses),
   first.d.phonetic_uk,first.d.phonetic_us,first.d.selected_pos,
   first.d.selected_meaning_zh,first.d.example_en,first.d.example_zh,
   first.item.old_cards[0].collocations_json,receipt.reviewer_id,receipt.signed_at];
  statements.push('INSERT INTO global_dictionary_lessons ('+cols.join(',')+
   ') SELECT '+values.map(qt).join(',')+' WHERE EXISTS(SELECT 1 FROM global_dictionary_entries'+
   ' WHERE entry_id='+qt(entry)+' AND teaching_ready=1);');
 }
 for(const {item,decision:d} of approved){
  const sense=oldToSense.get(item.old_word_ids[0]);
  statements.push('INSERT INTO global_dictionary_senses'+
   ' (sense_id,entry_id,pos,meaning_zh,example_en,example_zh,reviewed_by,reviewed_at,approved,active)'+
   ' VALUES ('+[qt(sense),qt(item.entry_id),qt(d.selected_pos),
    qt(d.selected_meaning_zh),qt(d.example_en),qt(d.example_zh),
    qt(receipt.reviewer_id),qt(receipt.signed_at),'1','1'].join(',')+');');
  const ids=new Map();
  for(const card of item.old_cards){
   if(ids.has(card.legacy_word_id)){
    assert.equal(ids.get(card.legacy_word_id).old_card_sha256,card.old_card_sha256,
     'SIGNED_PILOT_OLD_ID_DIVERGENT_SHA');
   }else{ids.set(card.legacy_word_id,card)}
  }
  for(const [legacy,card] of ids){
   const occur=item.old_cards.filter(x=>x.legacy_word_id===legacy);
   const guards=occur.map(x=>
    'EXISTS(SELECT 1 FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id'+
    ' JOIN books b ON b.id=ch.book_id WHERE cw.word_id='+qt(legacy)+
    ' AND cw.chapter_id='+qt(x.chapter_id)+' AND cw.context_anchor='+qt(x.anchor)+
    ' AND b.id='+qt(x.book_id)+' AND b.status='+qt('published')+
    ' AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP'+
    ' AND json_valid(ch.content_json)=1 AND json_extract(ch.content_json,'+
    qt('$.paragraphs['+x.anchor.split(':')[0].slice(1)+'].segments['+
     x.anchor.split(':')[1].slice(1)+'].wordId')+')='+qt(legacy)+
    ' AND json_extract(ch.content_json,'+
    qt('$.paragraphs['+x.anchor.split(':')[0].slice(1)+'].segments['+
     x.anchor.split(':')[1].slice(1)+'].gloss')+')='+qt(x.context_gloss)+')');
   const eq=['w.headword='+qt(item.headword)+' COLLATE NOCASE',
    'w.phonetic_uk='+qt(card.phonetic_uk),
    'w.phonetic_us='+qt(card.phonetic_us),
    'w.part_of_speech='+qt(item.part_of_speech),
    'w.meaning_zh='+qt(item.meaning_zh),
    'w.example_en='+qt(card.example_en),'w.example_zh='+qt(card.example_zh),
    'w.collocations_json='+qt(card.collocations_json)];
   statements.push('INSERT INTO global_dictionary_legacy_sense_links'+
    ' (legacy_word_id,sense_id,old_card_sha256,reviewed_by,reviewed_at,review_note)'+
    ' SELECT '+[qt(legacy),qt(sense),qt(card.old_card_sha256),
      qt(receipt.reviewer_id),qt(receipt.signed_at),qt('OPS:'+receipt.ops_audit_id)].join(',')+
    ' FROM words w WHERE w.id='+qt(legacy)+' AND '+eq.join(' AND ')+
    ' AND '+guards.join(' AND ')+';');
  }
 }
 return {status:'SIGNED_STAGING_SQL_PLAN_ONLY_NOT_APPLIED',
  target_database_id:D1_ID,expected_senses:approved.length,
  expected_lessons:byEntry.size,expected_legacy_links:oldToSense.size,
  signed_ops_audit_id:receipt.ops_audit_id,
  changes_existing_books:false,changes_user_learning_state:false,
  production_access:false,database_writes_performed:0,
  sql:statements.join('\n')+'\n'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,7,'SIGNED_STAGING_PLAN_PRIVATE_CLI_USAGE');
  const [packet,decisions,receipt,pub]=process.argv.slice(2,6).map(f=>
   JSON.parse(readFileSync(f,'utf8')));
  // Public key content must be provisioned separately by trusted OPS setup;
  // never read it from candidate artifact nor generate a key during release.
  const plan=compileSignedNonQaPublishedStagingPlan({
   packet,decisions,receipt,trustedOpsPublicKeyPem:pub.pem});
  writeFileSync(process.argv[6],plan.sql,{flag:'wx',mode:0o600});
  console.log('SIGNED_STAGING_SQL_PLAN_PREPARED_COUNTS='+JSON.stringify({
   senses:plan.expected_senses,lessons:plan.expected_lessons,
   links:plan.expected_legacy_links,applied:false}));
 }catch(e){console.error('SIGNED_STAGING_SQL_PLAN_BLOCKED',e.message);process.exitCode=1}
}
