// B1.5: PRIVATE-DATA editorial signoff gate. Produces only a review proposal.
// A local file, AI suggestion, or reviewer's unchecked box is NEVER proof that
// a commercial teaching sense was authenticated and signed in OPS.
import {createHash} from 'node:crypto';
const id=/^[a-f0-9]{64}$/u;
const lemma=x=>String(x??'').normalize('NFKC').trim().toLowerCase().replaceAll('’',"'");
const meaning=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const pos=x=>lemma(x).replace(/[.。]/gu,'');
const trim=x=>String(x??'').trim();
const validDate=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(x)&&
 !Number.isNaN(Date.parse(x));
const sha=x=>createHash('sha256').update(x).digest('hex');
const empty=()=>({value:false,evidence:''});
export function createSenseReviewDecisionTemplate(candidate){
 if(!candidate||!id.test(candidate.candidate_hash_sha256||'')||
 !/^gdict_[a-f0-9]{24}$/u.test(candidate.entry_id||'')||
 !candidate.headword||!candidate.meaning_zh||!Array.isArray(candidate.old_word_ids))
  throw Error('REVIEW_SOURCE_CANDIDATE_INVALID');
 return {
  schema:'wordletter-sense-review-decision-v1',
  source_candidate_sha256:candidate.candidate_hash_sha256,
  entry_id:candidate.entry_id,
  headword:candidate.headword,
  original_pos:candidate.part_of_speech,
  original_meaning_zh:candidate.meaning_zh,
  original_old_word_ids:[...candidate.old_word_ids],
  action:'hold',
  selected_pos:'',selected_meaning_zh:'',
  phonetic_uk:'',phonetic_us:'',
  example_en:'',example_zh:'',
  reviewer:{identity:'',reviewed_at:'',note:''},
  checks:{
   word_sense:empty(),part_of_speech:empty(),uk_ipa:empty(),us_ipa:empty(),
   english_example:empty(),chinese_example:empty(),
   provenance_rights:empty(),legacy_mapping:empty()
  },
  license:{basis:'',reference:'',allows_commercial_use:false,
   english_example_rights:'',chinese_example_rights:''},
  editorial_signoff_pending:true,approved_sense_id:null,
  teaching_ready:false,automatic_learning_merge:false
 };
}
export function validatePrivateSenseReviewDecisions(candidates,decisions){
 if(!Array.isArray(candidates)||!candidates.length||!Array.isArray(decisions))
  throw Error('REVIEW_CANDIDATES_AND_DECISIONS_REQUIRED');
 const source=new Map(),old=new Set(),report=[];
 for(const row of candidates){
  const key=row?.candidate_hash_sha256;
  if(!id.test(key||'')||source.has(key)||
    !/^gdict_[a-f0-9]{24}$/u.test(row?.entry_id||'')||
    row.lesson_approved===true||row.approved_sense_id!=null||
    !Array.isArray(row.old_word_ids)||!row.old_word_ids.length)
   throw Error('REVIEW_CANDIDATE_IDENTITY_CORRUPTED');
  for(const previous of row.old_word_ids){
   if(old.has(previous)||typeof previous!=='string'||!previous)
    throw Error('REVIEW_LEGACY_WORD_ID_COLLISION');
   old.add(previous);
  }
  source.set(key,row);
 }
 const supplied=new Map();
 for(const decision of decisions){
  if(decision?.schema!=='wordletter-sense-review-decision-v1'||
    !source.has(decision.source_candidate_sha256)||
    supplied.has(decision.source_candidate_sha256))
   throw Error('REVIEW_DECISION_UNKNOWN_DUPLICATE_OR_WRONG_SCHEMA');
  supplied.set(decision.source_candidate_sha256,decision);
 }
 const checks=['word_sense','part_of_speech','uk_ipa','us_ipa',
  'english_example','chinese_example','provenance_rights','legacy_mapping'];
 for(const [key,row] of source){
  const d=supplied.get(key);
  const blockers=[];
  if(!d){blockers.push('REVIEW_DECISION_MISSING');}
  else if(d.action!=='request_signoff'){
   blockers.push('REVIEWER_HOLD_OR_REJECT');
  }else{
   if(d.entry_id!==row.entry_id||
    lemma(d.headword)!==lemma(row.headword)||
    meaning(d.original_meaning_zh)!==meaning(row.meaning_zh)||
    pos(d.original_pos)!==pos(row.part_of_speech)||
    JSON.stringify(d.original_old_word_ids)!==JSON.stringify(row.old_word_ids))
    blockers.push('SOURCE_IDENTITY_OR_LEGACY_IDS_CHANGED');
   if(!trim(d.selected_pos)||!meaning(d.selected_meaning_zh))
    blockers.push('REVIEWED_SENSE_DESCRIPTION_MISSING');
   if(!trim(d.phonetic_uk)||!trim(d.phonetic_us))
    blockers.push('REVIEWED_UK_OR_US_IPA_MISSING');
   if(!trim(d.example_en)||!trim(d.example_zh))
    blockers.push('REVIEWED_BILINGUAL_EXAMPLE_MISSING');
   if(!trim(d.reviewer?.identity)||!validDate(d.reviewer?.reviewed_at))
    blockers.push('AUDIT_REVIEWER_IDENTITY_OR_TIMESTAMP_MISSING');
   const missing=checks.filter(name=>d.checks?.[name]?.value!==true||
    !trim(d.checks[name].evidence));
   if(missing.length)blockers.push('UNVERIFIED_EDITORIAL_CHECKS:'+missing.join(','));
   if(d.license?.allows_commercial_use!==true||
    !trim(d.license?.basis)||!trim(d.license?.reference)||
    !trim(d.license?.english_example_rights)||
    !trim(d.license?.chinese_example_rights))
    blockers.push('COMMERCIAL_USAGE_AND_EXAMPLE_RIGHTS_UNVERIFIED');
   if(meaning(d.selected_meaning_zh)!==meaning(row.meaning_zh)||
    pos(d.selected_pos)!==pos(row.part_of_speech))
    blockers.push('LEGACY_SENSE_IDENTITY_CHANGED_REQUIRES_SEPARATE_MAPPING_REVIEW');
   if(d.approved_sense_id!=null||d.teaching_ready===true||
    d.editorial_signoff_pending===false||d.automatic_learning_merge===true)
    blockers.push('LOCAL_REVIEW_MUST_NOT_ASSERT_APPROVAL_OR_LEARNING_MIGRATION');
  }
  const proposal={source_candidate_sha256:key,entry_id:row.entry_id,
   legacy_word_ids:[...row.old_word_ids],source_headword:row.headword,
   status:blockers.length?'BLOCKED_FOR_EDITORIAL_REVIEW':'READY_FOR_AUTHENTICATED_OPS_FINAL_SIGNOFF',
   blockers,
   provisional_sense_id:'gds_'+sha(key+'\0'+row.entry_id).slice(0,24),
   // Never emit approved rows or bind legacy users from locally editable files.
   approved_sense_id:null,approved:false,active:false,
   teaching_ready:false,publisher_authenticated:false,
   database_write_performed:false,legacy_user_state_changed:false};
  report.push(proposal);
 }
 const statusCounts=Object.fromEntries(
  [...new Set(report.map(x=>x.status))].sort().map(x=>[x,report.filter(y=>y.status===x).length]));
 return {status:'OFFLINE_PROPOSALS_NOT_PUBLISHER_APPROVED',
  total_source_candidates:source.size,received_decisions:supplied.size,
  status_counts:statusCounts,proposals:report,
  publisher_signoff_required:true,final_approved_senses_created:0,
  cloudflare_database_writes:0,user_study_state_writes:0};
}
