// NEW/unlinked sense editorial preflight. Private review inputs only.
// Unlike the legacy 1150-sense gate, this deliberately forbids old word IDs.
// A reviewer proposal is NOT a Publisher approval, D1 write or study merge.
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const entry=/^gdict_[0-9a-f]{24}$/u;
const word=/^[a-z]+(?:['-][a-z]+)*$/u;
const tier=new Set(['基础','四级新增','六级新增','考研新增']);
const txt=x=>typeof x==='string'?x.trim():'';
const norm=x=>txt(x).normalize('NFKC').toLowerCase().replaceAll('’',"'");
const zh=x=>txt(x).normalize('NFKC').replace(/\s+/gu,'');
const part=x=>norm(x).replaceAll(/[.。]/gu,'');
const date=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(x)&&
  !Number.isNaN(Date.parse(x));
const checked=()=>({value:false,evidence:''});
const keys=['meaning','part_of_speech','uk_ipa','us_ipa','original_example_en',
 'original_example_zh','copyright_and_commercial_rights','existing_sense_overlap',
 'new_sense_identity','lexical_risk_and_context'];
const invalidApproval=x=>x?.publisher_approved!==false||x?.teaching_ready!==false||
 x?.approved_sense_id!==null||x?.commercial_release_allowed!==false||
 x?.lesson_approved===true||x?.reviewer_approved===true||x?.active===true;
function sourceFingerprint(x){
 return hash(JSON.stringify([x.entry_id,norm(x.headword),x.target_tier,
  part(x.pos_draft),zh(x.meaning_zh_draft),txt(x.example_en_draft),
  txt(x.example_zh_draft),txt(x.lexical_attention_reason)]));
}
function assertNewSource(x){
 if(!x||x.schema!=='wordletter-exam-first-original-bilingual-review-v1'||
  x.batch==='HISTORICAL_SENSE_80'||!entry.test(x.entry_id||'')||
  !word.test(norm(x.headword))||!tier.has(x.target_tier)||
  !part(x.pos_draft)||!zh(x.meaning_zh_draft)||
  !txt(x.example_en_draft)||!txt(x.example_zh_draft)||
  x.candidate_hash_sha256!==null||x.old_word_id_count!==0||
  x.human_editorial_check_required!==true||invalidApproval(x)||
  x.legacy_word_ids!==undefined||x.old_word_ids!==undefined)
  throw Error('NEW_SENSE_SOURCE_MUST_BE_UNLINKED_UNAPPROVED_AND_COMPLETE');
 if(!new RegExp('(?<![a-z])'+norm(x.headword)+'(?![a-z])','iu').test(x.example_en_draft))
  throw Error('NEW_SENSE_DRAFT_EXAMPLE_DOES_NOT_CONTAIN_HEADWORD');
 return sourceFingerprint(x);
}
export function createNewSenseEditorialDecisionTemplate(source){
 const fingerprint=assertNewSource(source);
 return {schema:'wordletter-new-sense-editorial-decision-v1',
  source_review_fingerprint_sha256:fingerprint,
  entry_id:source.entry_id,headword:source.headword,target_tier:source.target_tier,
  original_pos_draft:source.pos_draft,original_meaning_zh_draft:source.meaning_zh_draft,
  original_example_en_draft:source.example_en_draft,
  original_example_zh_draft:source.example_zh_draft,
  original_lexical_attention_reason:source.lexical_attention_reason,
  old_word_ids:[],action:'hold',selected_pos:'',selected_meaning_zh:'',
  selected_example_en:'',selected_example_zh:'',phonetic_us:'',phonetic_uk:'',
  revision_reason:'',reviewer:{identity:'',reviewed_at:'',note:''},
  checks:Object.fromEntries(keys.map(k=>[k,checked()])),
  license:{basis:'',reference:'',allows_commercial_use:false,
    english_example_rights:'',chinese_example_rights:''},
  editorial_signoff_pending:true,publisher_approved:false,
  teaching_ready:false,approved_sense_id:null,commercial_release_allowed:false,
  automatic_learning_merge:false};
}
export function validateNewSenseEditorialDecisions(sources,decisions){
 if(!Array.isArray(sources)||!sources.length||!Array.isArray(decisions))
  throw Error('NEW_SENSE_REVIEW_INPUT_REQUIRED');
 const origins=new Map(),dmap=new Map();
 for(const x of sources){
  const fp=assertNewSource(x);
  if(origins.has(fp))throw Error('DUPLICATE_NEW_SENSE_SOURCE_FINGERPRINT');
  origins.set(fp,x);
 }
 for(const d of decisions){
  if(d?.schema!=='wordletter-new-sense-editorial-decision-v1'||
     !origins.has(d.source_review_fingerprint_sha256)||
     dmap.has(d.source_review_fingerprint_sha256))
   throw Error('NEW_SENSE_REVIEW_UNKNOWN_OR_DUPLICATED_DECISION');
  dmap.set(d.source_review_fingerprint_sha256,d);
 }
 const proposed=[];
 for(const [fp,x] of origins){
  const d=dmap.get(fp),blockers=[];
  if(!d)blockers.push('NEW_SENSE_EDITORIAL_DECISION_MISSING');
  else if(d.action!=='request_signoff')blockers.push('NEW_SENSE_EDITORIAL_HOLD_OR_REJECT');
  else {
   if(d.source_review_fingerprint_sha256!==fp||d.entry_id!==x.entry_id||
      norm(d.headword)!==norm(x.headword)||d.target_tier!==x.target_tier||
      part(d.original_pos_draft)!==part(x.pos_draft)||
      zh(d.original_meaning_zh_draft)!==zh(x.meaning_zh_draft)||
      d.original_example_en_draft!==x.example_en_draft||
      d.original_example_zh_draft!==x.example_zh_draft||
      d.original_lexical_attention_reason!==x.lexical_attention_reason)
    blockers.push('SOURCE_IDENTITY_OR_DRAFT_CHANGED');
   if(!Array.isArray(d.old_word_ids)||d.old_word_ids.length!==0||
      d.legacy_word_ids!==undefined||d.linked_old_word_id!==undefined)
    blockers.push('NEW_UNLINKED_SENSE_MUST_NOT_CLAIM_LEGACY_IDS');
   if(!part(d.selected_pos)||!zh(d.selected_meaning_zh))
    blockers.push('REVIEWED_POS_OR_CHINESE_SENSE_REQUIRED');
   if(!txt(d.selected_example_en)||!txt(d.selected_example_zh)||
      !new RegExp('(?<![a-z])'+norm(x.headword)+'(?![a-z])','iu').test(d.selected_example_en||''))
    blockers.push('NEW_SENSE_BILINGUAL_EXAMPLE_OR_TARGET_WORD_INVALID');
   if(!txt(d.phonetic_us)||!txt(d.phonetic_uk))
    blockers.push('NEW_SENSE_US_AND_RIGHTS_CLEARED_UK_IPA_REQUIRED');
   if(!txt(d.reviewer?.identity)||!date(d.reviewer?.reviewed_at)||!txt(d.reviewer?.note))
    blockers.push('REVIEWER_AUDIT_ID_DATE_AND_NOTE_REQUIRED');
   const missing=keys.filter(k=>d.checks?.[k]?.value!==true||!txt(d.checks?.[k]?.evidence));
   if(missing.length)blockers.push('NEW_SENSE_EDITORIAL_EVIDENCE_MISSING:'+missing.join(','));
   if(d.license?.allows_commercial_use!==true||!txt(d.license?.basis)||
     !txt(d.license?.reference)||!txt(d.license?.english_example_rights)||
     !txt(d.license?.chinese_example_rights))
    blockers.push('NEW_SENSE_COMMERCIAL_AND_EXAMPLE_RIGHTS_UNVERIFIED');
   if((part(d.selected_pos)!==part(x.pos_draft)||
       zh(d.selected_meaning_zh)!==zh(x.meaning_zh_draft)||
       d.selected_example_en!==x.example_en_draft||
       d.selected_example_zh!==x.example_zh_draft)&&!txt(d.revision_reason))
    blockers.push('NEW_SENSE_REVISIONS_REQUIRE_EXPLICIT_REASON');
   if(d.publisher_approved!==false||d.teaching_ready!==false||
      d.approved_sense_id!==null||d.editorial_signoff_pending!==true||
      d.commercial_release_allowed!==false||d.automatic_learning_merge!==false||
      d.active===true||d.lesson_approved===true)
    blockers.push('LOCAL_NEW_SENSE_REVIEW_CANNOT_ASSERT_AUTH_APPROVAL');
  }
  proposed.push({source_review_fingerprint_sha256:fp,
    entry_id:x.entry_id,headword:x.headword,target_tier:x.target_tier,
    source_sense_unreviewed:true,legacy_word_ids:[],
    status:blockers.length?'BLOCKED_FOR_NEW_SENSE_EDITORIAL_REVIEW':
       'READY_FOR_AUTHENTICATED_OPS_FINAL_SIGNOFF',
    blockers,provisional_sense_id:blockers.length?null:
      'gds_'+hash(x.entry_id+'\0'+part(d.selected_pos)+'\0'+zh(d.selected_meaning_zh)).slice(0,24),
    approved_sense_id:null,approved:false,active:false,
    publisher_authenticated:false,commercial_release_allowed:false,
    user_learning_migration_performed:false,d1_write_performed:false});
 }
 const collision=new Map();
 for(const p of proposed){
  if(!p.provisional_sense_id)continue;
  if(collision.has(p.provisional_sense_id)){
   const other=collision.get(p.provisional_sense_id);
   p.blockers.push('POSSIBLE_DUPLICATE_NEW_SENSE_IN_SAME_BATCH');
   other.blockers.push('POSSIBLE_DUPLICATE_NEW_SENSE_IN_SAME_BATCH');
   for(const q of [p,other]){
    q.status='BLOCKED_FOR_NEW_SENSE_EDITORIAL_REVIEW';q.provisional_sense_id=null;
   }
  }else collision.set(p.provisional_sense_id,p);
 }
 return {status:'NEW_SENSE_OFFLINE_REVIEW_ONLY_NOT_PUBLISHER_APPROVED',
  total_candidates:origins.size,decisions_supplied:dmap.size,
  proposals:proposed,
  blocked:proposed.filter(x=>x.status!=='READY_FOR_AUTHENTICATED_OPS_FINAL_SIGNOFF').length,
  pending_authenticated_publisher_signoff:proposed.filter(x=>x.status==='READY_FOR_AUTHENTICATED_OPS_FINAL_SIGNOFF').length,
  publisher_approved_senses_created:0,legacy_word_ids_linked:0,
  d1_writes:0,user_study_state_writes:0};
}