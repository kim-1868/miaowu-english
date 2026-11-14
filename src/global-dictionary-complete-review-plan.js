// Schedule ALL unreviewed historical senses, preserving an existing first batch.
// Pure, private-input planner. Never publishes cards or merges study states.
import {selectPrivateEditorialBatch} from './global-dictionary-review-batches.js';
const sha=x=>/^[a-f0-9]{64}$/u.test(x||'');
const notApproved=x=>x?.approved_sense_id==null&&x?.lesson_approved!==true&&
 x?.auto_publish_allowed!==true&&x?.reviewed!==true;
export function planAllPrivateEditorialBatches(rows,{
 examIndex,firstBatch=[],batchSize=120,maxBatches=100
}={}){
 if(!Array.isArray(rows)||!rows.length||!(examIndex instanceof Map)||
  !Array.isArray(firstBatch)||!Number.isInteger(batchSize)||batchSize<1||
  batchSize>500||!Number.isInteger(maxBatches)||maxBatches<1||maxBatches>1000)
  throw Error('INVALID_COMPLETE_REVIEW_BATCH_INPUT');
 const canonical=new Map();
 for(const row of rows){
  if(!sha(row?.candidate_hash_sha256)||canonical.has(row.candidate_hash_sha256)||
    !notApproved(row))throw Error('SOURCE_HASH_DUPLICATE_OR_REVIEWED');
  canonical.set(row.candidate_hash_sha256,row);
 }
 if(firstBatch.length>batchSize)throw Error('SEED_BATCH_OVER_CAPACITY');
 const used=new Set(),batches=[];
 if(firstBatch.length){
  batches.push(firstBatch.map((entry,index)=>{
   const id=entry?.candidate_hash_sha256;
   if(!canonical.has(id)||used.has(id)||!notApproved(entry))
    throw Error('FIRST_BATCH_IDENTITY_INVALID_OR_DUPLICATE');
   used.add(id);
   return {...canonical.get(id),...entry,review_batch:1,
    review_sequence:index+1,review_cohort:entry.review_cohort||'A_第一批已确认',
    reviewed_by:null,reviewed_at:null,lesson_approved:false,
    approved_sense_id:null,license_reviewed:false,auto_publish_allowed:false,
    legacy_study_state_migrated:false};
  }));
 }
 while(used.size<rows.length){
  if(batches.length>=maxBatches)throw Error('MAX_REVIEW_BATCHES_REACHED');
  const proposal=selectPrivateEditorialBatch(rows,{
   examIndex,excludeHashes:[...used],batchSize
  });
  if(!proposal.candidates.length)throw Error('EXHAUSTIVE_BATCH_SELECTION_STALLED');
  const current=proposal.candidates.map((item,index)=>({...item,
   review_batch:batches.length+1,review_sequence:index+1,
   reviewed_by:null,reviewed_at:null,approved_sense_id:null,
   lesson_approved:false,license_reviewed:false,auto_publish_allowed:false,
   legacy_study_state_migrated:false}));
  for(const item of current){
   if(used.has(item.candidate_hash_sha256))
    throw Error('CROSS_BATCH_REVIEW_CANDIDATE_REPEAT');
   used.add(item.candidate_hash_sha256);
  }
  batches.push(current);
 }
 if(used.size!==rows.length)throw Error('PRIVATE_REVIEW_SOURCE_NOT_FULLY_COVERED');
 const scheduled=batches.flat();
 return {status:'ALL_PRIVATE_SENSES_SCHEDULED_NOT_APPROVED',
  summary:{source_sense_candidates:rows.length,
   scheduled_sense_candidates:scheduled.length,batch_count:batches.length,
   total_legacy_card_references:scheduled.reduce((n,x)=>n+x.old_word_id_count,0),
   first_batch_preserved:firstBatch.length>0,
   no_repeated_candidate_hash:true,
   teaching_senses_approved:0,historical_user_progress_writes:0,
   production_d1_writes:0,exam_tier_officially_verified:false},batches};
}
