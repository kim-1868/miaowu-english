// Deterministic, PRIVATE-INPUT reviewer batches for the old published lesson drafts.
// No D1 access, no GitHub upload of owner card content, no teaching approvals.
// The exam tier is owner-supplied source metadata, not official exam verification.
export const COHORTS=Object.freeze([
 {name:'A_历史跨书高复用',quota:45},
 {name:'B_四级新增义项',quota:35},
 {name:'C_六级新增义项',quota:25},
 {name:'D_考研雅思及词表缺项',quota:15}
]);
const compare=(a,b)=>a.localeCompare(b,'en');
const sortRepeated=(a,b)=>
 b.old_word_id_count-a.old_word_id_count||
 b.books_count-a.books_count||
 b.candidate_priority_score-a.candidate_priority_score||
 compare(a.headword,b.headword)||
 compare(a.candidate_hash_sha256,b.candidate_hash_sha256);
const sortTier=(a,b)=>
 b.old_word_id_count-a.old_word_id_count||
 b.books_count-a.books_count||
 (a.curriculum_source_rank??Infinity)-(b.curriculum_source_rank??Infinity)||
 compare(a.headword,b.headword)||
 compare(a.candidate_hash_sha256,b.candidate_hash_sha256);
const validHash=x=>/^[0-9a-f]{64}$/.test(x||'');
const clean=x=>String(x??'').trim();
export function ownerExamTierIndex(rows){
 if(!Array.isArray(rows)||!rows.length)throw Error('EXAM_SOURCE_REQUIRED');
 const out=new Map();
 for(const raw of rows){
  const h=clean(raw['单词']).toLowerCase(),tier=clean(raw['首现层级']);
  if(!h||!tier||out.has(h))throw Error('OWNER_EXAM_SOURCE_DUPLICATE_OR_EMPTY_HEADWORD');
  out.set(h,{tier,tags:clean(raw['涉及考试']),
   rank:/^[1-9]\d*$/.test(clean(raw['全局排名']))?Number(raw['全局排名']):null});
 }
 return out;
}
function tierRecord(row,exam){
 const ref=exam.get(clean(row.headword).toLowerCase());
 return {...row,curriculum_first_tier:ref?.tier??'词表未命中',
  curriculum_exam_tags:ref?.tags??'',
  curriculum_source_rank:ref?.rank??null};
}
export function selectPrivateEditorialBatch(rows,{examIndex,excludeHashes=[],
 quotas=COHORTS,batchSize=120}={}){
 if(!Array.isArray(rows)||!rows.length||
    !(examIndex instanceof Map)||!Number.isInteger(batchSize)||batchSize<1||
    !Array.isArray(quotas)||quotas.some(q=>!Number.isInteger(q.quota)||q.quota<0))
  throw Error('INVALID_PRIVATE_EDITORIAL_BATCH_INPUT');
 const previously=new Set(excludeHashes),ids=new Set();
 const candidates=[];
 for(const row of rows){
  const hash=row?.candidate_hash_sha256,head=clean(row?.headword);
  if(!validHash(hash)||ids.has(hash)||!head||!clean(row?.meaning_zh)||
   !Number.isInteger(row?.old_word_id_count)||row.old_word_id_count<1||
   !Number.isInteger(row?.books_count)||row.books_count<1||
   !Array.isArray(row?.old_word_ids)||
   row.old_word_ids.length!==row.old_word_id_count||
   !Array.isArray(row?.example_candidates)||
   !Array.isArray(row?.phonetic_uk_variants)||
   !Array.isArray(row?.phonetic_us_variants))
    throw Error('INVALID_OR_DUPLICATE_LEGACY_SENSE_CANDIDATE');
  ids.add(hash);
  if(previously.has(hash))continue;
  if(row.reviewed===true||row.lesson_approved===true||
    row.approved_sense_id!=null||row.auto_publish_allowed===true)
   throw Error('APPROVED_SENSE_MUST_NOT_ENTER_UNAPPROVED_REVIEW_QUEUE');
  candidates.push(tierRecord(row,examIndex));
 }
 const assigned=new Set(),output=[],selectedByCohort=[];
 const choose=(name,quota,filter,sorting)=>{
  const available=candidates.filter(x=>!assigned.has(x.candidate_hash_sha256)&&filter(x))
   .sort(sorting).slice(0,Math.min(quota,batchSize-output.length));
  for(const x of available){assigned.add(x.candidate_hash_sha256);
   output.push({...x,review_sequence:output.length+1,
    review_cohort:name,review_status:'待审核',reviewed_at:null,
    reviewed_by:null,license_reviewed:false,lesson_approved:false,
    approved_sense_id:null,auto_publish_allowed:false,
    legacy_study_state_migrated:false,editor_note:''});
  }
  selectedByCohort.push({name,requested:quota,selected:available.length});
 };
 const quota=(index)=>quotas[index]?.quota??0;
 choose('A_历史跨书高复用',quota(0),x=>x.old_word_id_count>=2,sortRepeated);
 choose('B_四级新增义项',quota(1),x=>x.curriculum_first_tier==='四级',sortTier);
 choose('C_六级新增义项',quota(2),x=>x.curriculum_first_tier==='六级',sortTier);
 choose('D_考研雅思及词表缺项',quota(3),
  x=>['考研','雅思','词表未命中'].includes(x.curriculum_first_tier),sortTier);
 if(output.length<batchSize)
  choose('E_剩余高优先义项补足',batchSize-output.length,()=>true,sortRepeated);
 const stats={status:'PRIVATE_EDITORIAL_BATCH_UNREVIEWED',
  source_candidate_rows:rows.length,excluded_prior_hashes:previously.size,
  selected:output.length,remaining:candidates.length-output.length,
  distinct_headwords:new Set(output.map(x=>x.headword)).size,
  selected_old_word_id_occurrences:output.reduce((n,x)=>n+x.old_word_id_count,0),
  selected_ipa_conflict_groups:output.filter(x=>
   x.editorial_flags?.includes('INCONSISTENT_IPA_ACROSS_HISTORICAL_CARDS')).length,
  selected_multi_sense_groups:output.filter(x=>
   x.editorial_flags?.includes('HEADWORD_HAS_MULTIPLE_SENSES')).length,
  first_tier_distribution:Object.fromEntries([...new Set(output.map(x=>x.curriculum_first_tier))]
   .sort(compare).map(k=>[k,output.filter(x=>x.curriculum_first_tier===k).length])),
  cohorts:selectedByCohort,
  approved_lessons_created:0,
  live_database_modified:false,learning_states_merged:false,
  exam_tier_officially_verified:false};
 return {status:stats.status,summary:stats,candidates:output};
}
