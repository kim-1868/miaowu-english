// Queue ordering only: never treat low-complexity candidates as reviewed,
// correct, commercial-use licensed, or ready for production D1.
const SIMPLE_POS=new Set(['n.','v.','adj.','adv.']);
const CONFLICTS=new Set([
 'INCONSISTENT_IPA_ACROSS_HISTORICAL_CARDS',
 'HEADWORD_HAS_MULTIPLE_SENSES',
 'CANDIDATE_DUPLICATE_OLD_IDS_REQUIRES_SENSE_CONFIRMATION'
]);
const H=/^[a-f0-9]{64}$/u;
export function triagePrivateSenseReviewComplexity(rows){
 if(!Array.isArray(rows)||!rows.length)throw Error('TRIAGE_SOURCE_REQUIRED');
 const seen=new Set(),fast=[],focused=[];
 for(const candidate of rows){
  if(!H.test(candidate?.candidate_hash_sha256||'')||
    seen.has(candidate.candidate_hash_sha256)||
    candidate.approved_sense_id!=null||candidate.lesson_approved===true)
   throw Error('TRIAGE_ID_DUPLICATE_OR_ALREADY_APPROVED');
  seen.add(candidate.candidate_hash_sha256);
  const issues=[];
  if(candidate?.phonetic_uk_variants?.length!==1||
     candidate?.phonetic_us_variants?.length!==1)issues.push('IPA_CONFLICT_OR_ABSENCE');
  if(!SIMPLE_POS.has(candidate.part_of_speech))
   issues.push('COMBINED_OR_NONSTANDARD_POS');
  if((candidate.editorial_flags||[]).some(x=>CONFLICTS.has(x)))
   issues.push('LEGACY_DUPLICATE_OR_DIFFERENT_SENSES');
  if(candidate.qa_source_form_found!==true)
   issues.push('EXAMPLE_INFLECTION_NOT_IN_OWNER_SOURCE');
  if(!Array.isArray(candidate.example_candidates)||
    !candidate.example_candidates.some(x=>String(x?.example_en||'').trim()&&
      String(x?.example_zh||'').trim()))
   issues.push('BILINGUAL_EXAMPLE_MISSING');
  const row={source_candidate_sha256:candidate.candidate_hash_sha256,
   headword:candidate.headword,entry_id:candidate.entry_id,
   original_word_ids_count:(candidate.old_word_ids||[]).length,
   review_batch:candidate.review_batch,
   risk_reasons:issues,
   triage:issues.length?'FOCUSED_EDITORIAL_REVIEW':'FASTER_EDITORIAL_REVIEW',
   teaching_ready:false,editorial_verified:false,
   licensed_for_commercial_use:false,approved_sense_id:null};
  (issues.length?focused:fast).push(row);
 }
 return {status:'PRIVATE_REVIEW_PRIORITY_ONLY_NO_TEACHING_SIGNOFF',
  summary:{total:rows.length,faster_editorial_review:fast.length,
   focused_editorial_review:focused.length,
   covered_unique_candidate_hashes:seen.size,
   approved_senses:0,
   cloudflare_writes:0,old_progress_merges:0},
  faster_review:fast,focused_review:focused};
}
