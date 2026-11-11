// Offline, deterministic four-tier QA reconciliation for PRIVATE owner data.
// This is NOT a lesson-approval engine. No database, user, or network calls.
const TIERS=Object.freeze(['基础','四级新增','六级新增','考研新增']);
const norm=s=>String(s??'').normalize('NFKC').trim().toLowerCase();
const valid=row=>row&&typeof row==='object'&&!Array.isArray(row);
const key=id=>/^[a-z0-9_-]+$/i.test(id||'');
export function reconcileOwnerExamCardDrafts({targetHeadwords,historySenses,originalExamples}={}){
 if(!Array.isArray(targetHeadwords)||!targetHeadwords.length||
   !Array.isArray(historySenses)||!Array.isArray(originalExamples))
  throw Error('EXAM_REVIEW_INPUT_REQUIRED');
 if(targetHeadwords.length>30000||historySenses.length>50000||
   originalExamples.length>50000)throw Error('EXAM_REVIEW_TOO_MANY_ROWS');
 const target=new Map(),hByWord=new Map(),draft=new Map();
 for(const item of targetHeadwords){
  const head=norm(item?.headword);
  if(!valid(item)||!head||!TIERS.includes(item.target_tier)||
     target.has(head)||item.teaching_sense_approved===true||
     item.publication_ready===true)throw Error('EXAM_REVIEW_TARGET_DUPLICATE_OR_ALREADY_APPROVED');
  target.set(head,item);
 }
 for(const item of historySenses){
  const head=norm(item?.headword);
  if(!valid(item)||!head||item.approved_sense_id!=null||
     item.auto_publish_allowed===true)throw Error('EXAM_REVIEW_HISTORY_INVALID_OR_APPROVED');
  hByWord.set(head,[...(hByWord.get(head)||[]),item]);
 }
 for(const item of originalExamples){
  const head=norm(item?.headword);
  if(!valid(item)||!head||!target.has(head)||draft.has(head)||
     !String(item.example_en_draft||'').trim()||
     !String(item.example_zh_draft||'').trim()||
     item.publisher_approved===true||item.teaching_ready===true||
     item.approved_sense_id!=null||item.commercial_release_allowed===true||
     !key(item.entry_id)||item.entry_id!==target.get(head).entry_id)
   throw Error('EXAM_REVIEW_DRAFT_IDENTITY_OR_APPROVAL_INVALID');
  draft.set(head,item);
 }
 const counts=Object.fromEntries(TIERS.map(t=>[t,{
   total:0,original_example_drafts:0,historical_sense_without_new_draft:0,
   new_sense_without_draft:0,abbreviation_or_missing_source:0,
   publisher_approved:0,history_candidate_headwords:0
 }]));
 const rows=[];
 for(const [head,item] of target){
  const histories=hByWord.get(head)||[],d=draft.get(head);
  const tier=item.target_tier,grade=counts[tier];grade.total++;
  if(histories.length)grade.history_candidate_headwords++;
  let lane='NEW_SENSE_WITHOUT_DRAFT';
  if(d)lane='ORIGINAL_DRAFT_EDITOR_REVIEW';
  else if(histories.length)lane='HISTORICAL_SENSE_EDITOR_REVIEW';
  else if(!item.entry_id)lane='SPECIAL_ABBREVIATION_REVIEW';
  const slot=lane==='ORIGINAL_DRAFT_EDITOR_REVIEW'?'original_example_drafts':
    lane==='HISTORICAL_SENSE_EDITOR_REVIEW'?'historical_sense_without_new_draft':
    lane==='SPECIAL_ABBREVIATION_REVIEW'?'abbreviation_or_missing_source':'new_sense_without_draft';
  grade[slot]++;
  rows.push({headword:head,tier,lane,
   history_sense_candidate_count:histories.length,
   draft_source_batch:d?.batch||null,
   approved_sense_id:null,license_reviewed:false,publish_allowed:false});
 }
 const summary={
   total_target_headwords:rows.length,
   distinct_historical_candidate_senses:historySenses.length,
   original_example_drafts:draft.size,
   matched_historical_target_headwords:[...hByWord.keys()].filter(k=>target.has(k)).length,
   publisher_approved:0,database_writes:0,
   source_is_live_publisher_snapshot:false,by_tier:counts
 };
 if(Object.values(counts).reduce((n,v)=>n+v.total,0)!==target.size||
   Object.values(counts).reduce((n,v)=>n+v.original_example_drafts,0)!==draft.size)
  throw Error('EXAM_REVIEW_RECONCILIATION_NOT_EXHAUSTIVE');
 return {status:'OWNER_EXAM_CARD_DRAFTS_UNAPPROVED_READ_ONLY',summary,rows,
   all_candidates_require_editor_signoff:true,
   warning:'Historical text senses, owner-source phonetics and original examples are only drafts, not commercial approvals.'};
}
