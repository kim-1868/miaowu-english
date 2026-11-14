// Transform a PRIVATE 565-word *initial* HTML workbench export to the next
// editorial decision templates; NEVER trusts an initial checkbox as approval.
import {createNewSenseEditorialDecisionTemplate} from './global-dictionary-new-sense-editorial-gate.js';
const val=x=>typeof x==='string'?x.trim():'';
export function hydrateNewSenseInitialReviewTemplates(unlinkedSources,initialRows){
 if(!Array.isArray(unlinkedSources)||!unlinkedSources.length||
    !Array.isArray(initialRows)||initialRows.length!==unlinkedSources.length)
  throw Error('INITIAL_REVIEW_COMPLETE_SOURCE_AND_EXPORT_REQUIRED');
 const source=new Map(),incoming=new Map();
 for(const s of unlinkedSources){
  const template=createNewSenseEditorialDecisionTemplate(s);
  if(source.has(s.entry_id)||!s.headword)throw Error('NEW_SENSE_SOURCE_DUPLICATED_ENTRY');
  source.set(s.entry_id,{s,template});
 }
 for(const r of initialRows){
  if(r?.schema!=='wordletter-exam-565-initial-review-v1'||
     !source.has(r.entry_id)||incoming.has(r.entry_id)||
     r.publisher_approved!==false||r.teaching_ready!==false||
     r.approved_sense_id!==null||r.signoff_pending!==true||
     r.production_publish_allowed!==false||r.lesson_approved===true||
     r.automatic_learning_merge===true||r.active===true)
   throw Error('UNTRUSTED_INITIAL_REVIEW_SOURCE_OR_FAKE_APPROVAL');
  const src=source.get(r.entry_id).s;
  if(r.headword!==src.headword||r.target_tier!==src.target_tier||
     r.source_pos!==src.pos_draft||
     !Array.isArray(r.source_meanings)||!r.source_meanings.length||
     r.source_meanings.some(x=>!val(x)))
    throw Error('INITIAL_REVIEW_SOURCE_IDENTITY_CHANGED');
  if(r.initial_reviewer_checked!==false&&r.initial_reviewer_checked!==true)
   throw Error('INITIAL_REVIEW_CHECKBOX_INVALID');
  if(r.initial_reviewer_checked===true&&(!val(r.edited_pos)||
     !val(r.edited_meaning)||!val(r.example_en_draft)||
     !val(r.example_zh_draft)||!val(r.review_notes)))
   throw Error('INITIAL_REVIEW_CHECKED_WITH_MISSING_CONTENT');
  incoming.set(r.entry_id,r);
 }
 if(incoming.size!==source.size)throw Error('INITIAL_REVIEW_SOURCE_COVERAGE_INCOMPLETE');
 const templates=[];
 for(const [entry_id,{s,template}] of source){
  const r=incoming.get(entry_id);
  template.selected_pos=val(r.edited_pos)||s.pos_draft;
  template.selected_meaning_zh=val(r.edited_meaning)||s.meaning_zh_draft;
  template.selected_example_en=val(r.example_en_draft)||s.example_en_draft;
  template.selected_example_zh=val(r.example_zh_draft)||s.example_zh_draft;
  template.initial_reviewer_checked_unverified=r.initial_reviewer_checked;
  template.initial_review_notes_unverified=val(r.review_notes);
  // An initial review is not licensed lexicography + real authenticated OPS.
  // Keep action hold, all checks false, no reviewer identity/rights approval.
  template.action='hold';
  template.reviewer.identity='';template.reviewer.reviewed_at='';
  template.reviewer.note='';template.revision_reason='';
  template.editorial_signoff_pending=true;
  templates.push(template);
 }
 return {status:'INITIAL_REVIEW_HYDRATED_FOR_NEW_SENSE_EDITORIAL_NOT_APPROVED',
   source_senses:source.size,initially_checked:templates.filter(x=>x.initial_reviewer_checked_unverified).length,
   templates, request_signoff_actions:0,publisher_approved_senses:0,
   legacy_mapping_writes:0,user_study_state_writes:0,cloudflare_d1_writes:0};
}