// PRIVATE-input, pure offline planner: owner CET4/CET6/Postgrad targets,
// historical candidate senses, and original bilingual *draft suggestions*.
// Never infer publisher approval, sense identity or production book coverage.
const HASH=/^[0-9a-f]{64}$/u;
const ENTRY=/^gdict_[0-9a-f]{24}$/u;
const WORD=/^[a-z]+(?:['-][a-z]+)*$/u;
const ABBR=/^[a-z]+(?:\.[a-z]+)*\.$/u;
const TIERS=['基础','四级新增','六级新增','考研新增'];
const LANES=['跨书高复用·优先人工确认','低冲突·快速初审',
  '多义音标等·专项审查','非本期目标·暂存'];
const norm=x=>String(x??'').normalize('NFKC').trim().replaceAll('’',"'").toLowerCase();
const forbiddenApproval=x=>x?.teaching_sense_approved===true||x?.publisher_approved===true||
 x?.reviewer_approved===true||x?.lesson_approved===true||x?.teaching_ready===true||
 x?.auto_publish_allowed===true||x?.publication_ready===true||x?.approved_sense_id!=null;
export function planExamFirstPrivateEditorialQueue({
 targets=[],historicalSenses=[],draftSuggestions=[],batchSize=100
}={}){
 if(!Array.isArray(targets)||!targets.length||!Array.isArray(historicalSenses)||
    !Array.isArray(draftSuggestions)||!Number.isInteger(batchSize)||
    batchSize<1||batchSize>200)throw Error('INVALID_EXAM_FIRST_PLAN_INPUT');
 const words=new Map(),tierCounts=Object.fromEntries(TIERS.map(t=>[t,0]));
 for(const row of targets){
   const head=norm(row?.headword);
   if(!TIERS.includes(row?.target_tier)||!head||words.has(head)||
      row.priority_order!==words.size+1||!(WORD.test(head)||ABBR.test(head))||
      forbiddenApproval(row))throw Error('INVALID_EXAM_FIRST_TARGET');
   const exact=row.status==='exact_unreviewed_candidate';
   if(exact&&(!ENTRY.test(row.entry_id||'')||
      !Array.isArray(row.upstream_exam_tags)||!row.upstream_exam_tags.length))
     throw Error('TARGET_SOURCE_INDEX_UNVERIFIED');
   if(!exact&&(row.status!=='missing_abbreviation_or_token'||row.entry_id!=null||
      !ABBR.test(head)))throw Error('TARGET_ABBREVIATION_REQUIRES_REVIEW');
   words.set(head,{headword:head,entry_id:exact?row.entry_id:null,
     tier:row.target_tier,rank:row.priority_order,exact,
     historical:[],drafts:[]});
   tierCounts[row.target_tier]++;
 }
 const seenHashes=new Set(),oldIds=new Set(),outside=[];
 for(const row of historicalSenses){
   const key=row?.candidate_hash_sha256,head=norm(row?.headword);
   if(!HASH.test(key||'')||seenHashes.has(key)||!head||
      !Array.isArray(row.old_word_ids)||!row.old_word_ids.length||
      row.old_word_id_count!==row.old_word_ids.length||
      !LANES.includes(row.review_priority_lane)||!Number.isInteger(row.review_priority_rank)||
      row.review_priority_rank<1||forbiddenApproval(row))
     throw Error('INVALID_UNREVIEWED_HISTORICAL_SENSE');
   seenHashes.add(key);
   for(const oldId of row.old_word_ids){
     if(typeof oldId!=='string'||!oldId||oldIds.has(oldId))
       throw Error('DUPLICATE_LEGACY_WORD_ID');
     oldIds.add(oldId);
   }
   const target=words.get(head);
   if(!target){
     if(row.first_phase_target!==false)throw Error('HISTORICAL_SCOPE_MISMATCH');
     outside.push(row);continue;
   }
   if(row.first_phase_target!==true||row.entry_id!==target.entry_id||
      row.target_tier_from_owner_list!==target.tier)
     throw Error('HISTORICAL_TARGET_IDENTITY_MISMATCH');
   target.historical.push(row);
 }
 const seenDrafts=new Set();
 for(const d of draftSuggestions){
   const hash=d?.candidate_hash_sha256;
   if(!seenHashes.has(hash)||seenDrafts.has(hash)||forbiddenApproval(d)||
      d.status!=='DRAFT_EDITORIAL_SUGGESTION_ONLY'||
      typeof d.original_example_en_draft!=='string'||!d.original_example_en_draft.trim()||
      typeof d.original_example_zh_draft!=='string'||!d.original_example_zh_draft.trim())
     throw Error('DRAFT_NOT_SAFE_OR_MISMATCHED');
   const target=words.get(norm(d.headword));
   if(!target||target.entry_id!==d.entry_id||
      !target.historical.some(s=>s.candidate_hash_sha256===hash))
     throw Error('DRAFT_CANDIDATE_IDENTITY_MISMATCH');
   seenDrafts.add(hash);
   target.drafts.push(hash);
 }
 const list=[...words.values()];
 const selected=list.flatMap(x=>x.historical).sort((a,b)=>
   a.review_priority_rank-b.review_priority_rank||
   a.candidate_hash_sha256.localeCompare(b.candidate_hash_sha256,'en'));
 const batches=[];
 for(let i=0;i<selected.length;i+=batchSize){
   const group=selected.slice(i,i+batchSize);
   batches.push({batch:batches.length+1,size:group.length,
      candidate_hashes:group.map(x=>x.candidate_hash_sha256),
      editorial_approval_required:true});
 }
 const lanes=Object.fromEntries(LANES.map(name=>[name,
    selected.filter(x=>x.review_priority_lane===name).length]));
 return {
   status:'PRIVATE_EXAM_FIRST_REVIEW_PLAN_NOT_APPROVED',
   summary:{
     target_headwords:list.length,tiers:tierCounts,
     index_candidate_matches:list.filter(x=>x.exact).length,
     abbreviation_gaps:list.filter(x=>!x.exact).length,
     historical_candidate_senses:historicalSenses.length,
     in_scope_candidate_senses:selected.length,
     deferred_candidate_senses:outside.length,
     historical_old_ids_preserved:oldIds.size,
     headwords_with_historical_senses:list.filter(x=>x.historical.length).length,
     headwords_without_historical_senses:list.filter(x=>!x.historical.length).length,
     multi_sense_headwords:list.filter(x=>x.historical.length>1).length,
     editorial_drafts_unreviewed:seenDrafts.size,
     priority_batches:batches.length,review_lanes:lanes,
     publisher_approved_senses:0
   },
   review_queue:selected.map(row=>({
     candidate_hash_sha256:row.candidate_hash_sha256,
     entry_id:row.entry_id,headword:row.headword,
     target_tier:row.target_tier_from_owner_list,
     priority_rank:row.review_priority_rank,
     lane:row.review_priority_lane,
     books_count:row.books_count,
     legacy_ids_count:row.old_word_id_count,
     multiple_historical_senses:words.get(norm(row.headword)).historical.length>1,
     new_bilingual_draft_available:seenDrafts.has(row.candidate_hash_sha256),
     publisher_approved:false,approved_sense_id:null
   })),
   missing_content_queue:list.filter(x=>!x.historical.length).map(x=>({
     headword:x.headword,entry_id:x.entry_id,target_tier:x.tier,
     reason:x.exact?'NO_HISTORICAL_SENSE_DRAFT':'ABBREVIATION_PENDING_MANUAL_REVIEW'
   })),
   batches,
   source_is_historical_not_live_published_export:true,
   customer_records_read:false,learning_states_merged:false,
   remote_d1_writes:0,production_deployed:false
 };
}
