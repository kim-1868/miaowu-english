// The first REAL non-QA publisher review gate. It cannot approve an original
// card from spelling similarity, a GitHub deployment approval, or an AI decision.
// Genuine commercial rights + contextual language review require a separate
// signed OPS decision whose Ed25519 public key is pinned outside this packet.
//
// Input: existing AES256-encrypted real 2-book HOLD editorial packet, only after
// trusted in-runner decryption. Output is a PRIVATE editable review template or
// a safe aggregate; the template must itself be encrypted before upload.
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const hash=x=>createHash('sha256').update(x).digest('hex');
const H=/^[0-9a-f]{64}$/u,ENTRY=/^gdict_[0-9a-f]{24}$/u;
const ROLE='commercial-lesson-and-published-context-publisher-signoff-v1';
const TEST_DB_ID='88a817cb-23bb-4ae4-bcb8-92286c4165d4';
export const RIGHTS_KINDS=Object.freeze([
 'lexical_definition','uk_ipa','us_ipa','english_example',
 'chinese_example','collocations','original_story_context']);
export const CHECK_KINDS=Object.freeze([
 'same_word_sense','part_of_speech','uk_ipa','us_ipa','english_example',
 'chinese_example','story_context_semantics','commercial_rights',
 'dictionary_entry','authenticated_ops_signoff']);
const norm=x=>String(x??'').normalize('NFKC').trim();
const compact=x=>norm(x).replace(/\s+/gu,'');
const lemma=x=>norm(x).toLowerCase().replaceAll('’',"'");
const pos=x=>lemma(x).replace(/[.。]/gu,'');
const noQa=x=>!(/^(?:qa-|draft-|internal-|mw-v12-pilot-)/iu.test(x||''));
const validTime=x=>typeof x==='string'&&
 /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(x)&&
 !Number.isNaN(Date.parse(x));
const unique=x=>new Set(x).size===x.length;
function signedContentAttestation(a){
 return JSON.stringify({
  schema:a.schema,
  source_proof_sha256:a.source_proof_sha256,
  candidate_sha256:a.candidate_sha256,
  reviewer_id:a.reviewer_id,
  reviewed_at:a.reviewed_at,
  rights:a.rights,
  checks:a.checks,
  dictionary:a.dictionary,
  publisher_rights_confirmation:a.publisher_rights_confirmation
 });
}
export function canonicalPublisherReceipt(receipt){
 return JSON.stringify({
  schema:receipt.schema,
  purpose:receipt.purpose,
  publisher_review_sha256:receipt.publisher_review_sha256,
  source_proof_sha256:receipt.source_proof_sha256,
  candidate_sha256:receipt.candidate_sha256,
  reviewer_id:receipt.reviewer_id,
  ops_audit_id:receipt.ops_audit_id,
  signed_at:receipt.signed_at,
  target_database_id:receipt.target_database_id
 });
}
function validatePacket(packet){
 assert.equal(packet?.schema,'wordletter-real-published-two-book-editorial-intake-v1',
  'PUBLISHER_RIGHTS_REAL_PACKET_REQUIRED');
 assert.equal(packet?.scope,
  'two_actual_published_production_novels_READ_ONLY_evidence',
  'PUBLISHER_RIGHTS_WRONG_SCOPE');
 assert.equal(packet?.status,
  'REAL_TWO_BOOKS_CONTEXT_VERIFIED_EDITORIAL_AND_RIGHTS_HOLD',
  'PUBLISHER_RIGHTS_SOURCE_MUST_STAY_HOLD');
 assert.equal(packet?.source_encrypted_artifact_id,13963540716,
  'PUBLISHER_RIGHTS_SOURCE_ARTIFACT_MISMATCH');
 assert.equal(packet?.source_snapshot_artifact_id,13911979176);
 assert.ok(H.test(packet.source_proof_sha256||''));
 for(const [k,expected] of Object.entries({
  production_d1_writes:0,staging_d1_writes:0,user_study_changes:0,
  actual_signed_off_senses:0,actual_legacy_links:0,published_book_edits:0}))
  assert.equal(packet[k],expected,'PUBLISHER_RIGHTS_NOT_A_NEW_DB_RELEASE');
 const d=packet.review_decision;
 assert.equal(d?.action,'HOLD');
 assert.equal(d.authenticated_ops_signoff,false);
 assert.equal(d.editor_signature,null);
 assert.equal(d.approved_sense_id,null);
 assert.equal(d.dictionary_entry_id,null);
 assert.equal(d.teaching_example_rights_approved,false);
 assert.equal(d.same_sense_across_books_verified,false);
 assert.ok(RIGHTS_KINDS.every(k=>d.rights?.[k]?.verified===false)&&
  CHECK_KINDS.every(k=>d.checks?.[k]?.approved===false),
  'PUBLISHER_RIGHTS_SOURCE_ALREADY_PRETENDS_REVIEWED');
 const c=packet.candidate;
 assert.ok(c&&H.test(c.original_textual_fingerprint_sha256||'')&&
  norm(c.headword)&&norm(c.part_of_speech)&&norm(c.meaning_zh)&&
  Array.isArray(c.real_cards)&&c.real_cards.length===2,
  'PUBLISHER_RIGHTS_TWO_REAL_BOOKS_REQUIRED');
 const cards=c.real_cards;
 assert.ok(unique(cards.map(x=>x.book_id))&&
  unique(cards.map(x=>x.legacy_word_id))&&
  cards.every(x=>noQa(x.book_id)&&H.test(x.old_card_sha256||'')&&
   H.test(x.context_paragraph_sha256||'')&&
   compact(x.context_gloss)===compact(c.meaning_zh)&&
   pos(x.part_of_speech)===pos(c.part_of_speech)&&
   lemma(x.old_headword)===lemma(c.headword)),
  'PUBLISHER_RIGHTS_CARD_CONTEXT_IDENTITY_CHANGED');
 for(const c of cards){
  const cardHash=hash(JSON.stringify([c.legacy_word_id,c.old_headword,
   c.phonetic_uk,c.phonetic_us,c.part_of_speech,c.meaning_zh,
   c.example_en,c.example_zh,c.collocations_json]));
  assert.equal(c.old_card_sha256,cardHash,'PUBLISHER_RIGHTS_OLD_CARD_CHANGED');
  assert.equal(c.context_paragraph_sha256,hash(c.paragraph_json),
   'PUBLISHER_RIGHTS_STORY_CONTEXT_CHANGED');
  let p;
  try{p=JSON.parse(c.paragraph_json);
   assert.ok(Array.isArray(JSON.parse(c.collocations_json)))}
  catch{throw Error('PUBLISHER_RIGHTS_INVALID_CARD_JSON')}
  const m=/^p(\d+):s(\d+)$/u.exec(c.anchor||'');
  assert.ok(m&&Number.isSafeInteger(+m[1])&&Number.isSafeInteger(+m[2])&&
   Array.isArray(p.segments)&&p.segments.length>(+m[2]),
   'PUBLISHER_RIGHTS_INVALID_STORY_ANCHOR');
  const s=p.segments[+m[2]];
  assert.ok(s.wordId===c.legacy_word_id&&
   compact(s.gloss)===compact(c.meaning_zh)&&
   s.surface===c.segment_surface,'PUBLISHER_RIGHTS_SEGMENT_CHANGED');
 }
 return c;
}
function candidateHash(packet){
 const c=packet.candidate;
 return hash(JSON.stringify([
  packet.source_proof_sha256,
  c.original_textual_fingerprint_sha256,
  c.headword,c.part_of_speech,c.meaning_zh,
  c.real_cards.map(x=>[x.book_id,x.chapter_id,x.anchor,
   x.legacy_word_id,x.old_card_sha256,x.context_paragraph_sha256])
 ]));
}
function rightsDefault(){return Object.fromEntries(RIGHTS_KINDS.map(k=>[k,{
 verified:false,legal_basis:'',rights_holder:'',license_reference:'',
 evidence_sha256:null,reviewed_by:'',reviewed_at:''}]));}
function checksDefault(){return Object.fromEntries(CHECK_KINDS.map(k=>[k,{
 verified:false,evidence_sha256:null,reviewer_note:''}]));}
export function createRealPublisherClearanceTemplate(packet){
 validatePacket(packet);
 return {schema:'wordletter-real-two-book-publisher-clearance-v1',
  source_proof_sha256:packet.source_proof_sha256,
  candidate_sha256:candidateHash(packet),
  reviewer_id:'',reviewed_at:'',
  rights:rightsDefault(),
  checks:checksDefault(),
  dictionary:{entry_id:null,source_key:null,source_registry_sha256:null,
   verified_existing_enabled_licensed_entry:false},
  publisher_rights_confirmation:{commercial_teaching_rights:false,
   rights_authority:'',supporting_contract_or_creation_record_sha256:null},
  ops_signature_required:true,
  is_approved:false,
  note:'Never automatically pre-check boxes or create a commercial permission. All source rights/IPA/examples/context and lexical decisions require real evidence and a separately authenticated OPS Ed25519 receipt.'};
}
function verifyRights(a,blockers){
 for(const k of RIGHTS_KINDS){
  const v=a?.rights?.[k];
  if(v?.verified!==true||!['original','licensed','public_domain'].includes(v.legal_basis)||
   !norm(v.rights_holder)||!norm(v.license_reference)||!H.test(v.evidence_sha256||'')||
   !norm(v.reviewed_by)||!validTime(v.reviewed_at))
   blockers.push('MISSING_LICENSE_EVIDENCE_'+k.toUpperCase());
 }
}
function verifyChecks(a,blockers){
 for(const k of CHECK_KINDS){
  const v=a?.checks?.[k];
  if(v?.verified!==true||!H.test(v.evidence_sha256||'')||
   !norm(v.reviewer_note))
   blockers.push('MISSING_EDITORIAL_EVIDENCE_'+k.toUpperCase());
 }
}
function verifyPublisherReceipt({attestation,packet,receipt,trustedOpsPublicKeyPem},blockers){
 if(receipt?.schema!=='wordletter-ops-publisher-clearance-receipt-v1'||
  receipt.purpose!==ROLE||
  receipt.target_database_id!==TEST_DB_ID||
  receipt.source_proof_sha256!==packet.source_proof_sha256||
  receipt.candidate_sha256!==candidateHash(packet)||
  receipt.publisher_review_sha256!==hash(signedContentAttestation(attestation))||
  receipt.reviewer_id!==attestation.reviewer_id||
  !norm(receipt.ops_audit_id)||!validTime(receipt.signed_at)){
  blockers.push('AUTHENTICATED_OPS_TEST_SCOPE_RECEIPT_MISSING_OR_CHANGED');
  return;
 }
 if(!norm(trustedOpsPublicKeyPem)||!trustedOpsPublicKeyPem.includes('BEGIN PUBLIC KEY')){
  blockers.push('TRUSTED_OPS_ED25519_KEY_MISSING');
  return;
 }
 try{
  const key=createPublicKey(trustedOpsPublicKeyPem);
  if(key.asymmetricKeyType!=='ed25519'||typeof receipt.signature_b64!=='string'||
   !/^[A-Za-z0-9+/]+={0,2}$/u.test(receipt.signature_b64)||
   !verify(null,Buffer.from(canonicalPublisherReceipt(receipt)),key,
    Buffer.from(receipt.signature_b64,'base64')))
   blockers.push('INVALID_OR_UNTRUSTED_OPS_ED25519_SIGNATURE');
 }catch{blockers.push('INVALID_OR_UNTRUSTED_OPS_ED25519_SIGNATURE')}
}
export function evaluateRealPublisherClearance({packet,attestation=null,receipt=null,
 trustedOpsPublicKeyPem=null}={}){
 validatePacket(packet);
 const blockers=[],warnings=[];
 if(!attestation){
  blockers.push('NO_INDEPENDENT_COMMERCIAL_EDITORIAL_ATTESTATION');
 }else{
  if(attestation.schema!=='wordletter-real-two-book-publisher-clearance-v1'||
   attestation.source_proof_sha256!==packet.source_proof_sha256||
   attestation.candidate_sha256!==candidateHash(packet)||
   !norm(attestation.reviewer_id)||!validTime(attestation.reviewed_at))
   blockers.push('REVIEW_SOURCE_FINGERPRINT_OR_EDITOR_IDENTITY_INVALID');
  verifyRights(attestation,blockers);
  verifyChecks(attestation,blockers);
  if(attestation.dictionary?.verified_existing_enabled_licensed_entry!==true||
    !ENTRY.test(attestation.dictionary.entry_id||'')||
    !norm(attestation.dictionary.source_key)||
    !H.test(attestation.dictionary.source_registry_sha256||''))
   blockers.push('APPROVED_DICTIONARY_ENTRY_AND_LICENSE_REGISTRY_UNVERIFIED');
  const c=attestation.publisher_rights_confirmation;
  if(c?.commercial_teaching_rights!==true||
   !norm(c.rights_authority)||!H.test(c.supporting_contract_or_creation_record_sha256||''))
   blockers.push('PUBLISHER_COMMERCIAL_TEACHING_RIGHTS_NOT_ESTABLISHED');
  if(attestation.is_approved===true||attestation.ops_signature_required!==true)
   blockers.push('UNTRUSTED_LOCAL_DECISION_MUST_NOT_SELF_APPROVE');
  if(blockers.length===0)verifyPublisherReceipt(
   {attestation,packet,receipt,trustedOpsPublicKeyPem},blockers);
 }
 // Technical consistency != linguistic or legal approval: remain conservative.
 const c=packet.candidate,english=c.real_cards[0].example_en||'';
 if(english.length<12||english.length>250)
  warnings.push('ENGLISH_EXAMPLE_LENGTH_OUTLIER_FOR_EDITOR');
 if(!/[\u3400-\u9fff]/u.test(c.real_cards[0].example_zh||''))
  warnings.push('CHINESE_EXAMPLE_REQUIRES_LANGUAGE_REVIEW');
 if(!/[a-z]/iu.test(english))
  warnings.push('ENGLISH_EXAMPLE_REQUIRES_LANGUAGE_REVIEW');
 return {schema:'wordletter-real-two-book-clearance-result-v1',
  status:blockers.length?'HOLD_REQUIRE_VERIFIED_EDITOR_AND_RIGHTS':
   'AUTHENTICATED_PUBLISHER_ATTESTATION_PRESENT_STAGING_PREFLIGHT_ONLY',
  reviewed_real_novels:2,reviewed_legacy_cards:2,
  content_and_rights_blockers:blockers,
  nonapproval_warnings:warnings,
  rights_evidence_count:attestation?
   RIGHTS_KINDS.filter(k=>attestation.rights?.[k]?.verified===true).length:0,
  editorial_evidence_count:attestation?
   CHECK_KINDS.filter(k=>attestation.checks?.[k]?.verified===true).length:0,
  ops_signature_valid:blockers.length===0,
  target_database_id:TEST_DB_ID,
  production_database_read_or_write:false,
  staging_database_writes:0,commercial_senses_approved_in_database:0,
  signed_review_attestation_not_database_activation:true,
  caution:'Even a valid signed attestation requires an independent live TEST source/license/entry check, backup and explicit TEST import approval. This tool performs no DB I/O.'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const [mode,source,...args]=process.argv.slice(2);
  const packet=JSON.parse(readFileSync(source,'utf8'));
  if(mode==='template'&&args.length===1){
   const result=createRealPublisherClearanceTemplate(packet);
   writeFileSync(args[0],JSON.stringify(result),{flag:'wx',mode:0o600});
   console.log('REAL_PUBLISHER_RIGHTS_REVIEW_TEMPLATE_PRIVATE_HOLD_ONLY');
  }else if(mode==='status'&&args.length===1){
   const result=evaluateRealPublisherClearance({packet});
   writeFileSync(args[0],JSON.stringify(result),{flag:'wx',mode:0o600});
   console.log('REAL_PUBLISHER_CLEARANCE_SAFE_COUNTS='+JSON.stringify({
    status:result.status,rights_evidence:0,editorial_evidence:0,
    signed_ops:false,database_writes:0,
    blocker_count:result.content_and_rights_blockers.length
   }));
  }else throw Error('REAL_PUBLISHER_REVIEW_CLI_USAGE');
 }catch(e){
  console.error('REAL_PUBLISHER_RIGHTS_GATE_BLOCKED',
   /^[A-Z_0-9]+$/u.test(String(e?.message))?e.message:
    'PRIVATE_SOURCE_VALIDATION_FAILED');
  process.exitCode=1;
 }
}
