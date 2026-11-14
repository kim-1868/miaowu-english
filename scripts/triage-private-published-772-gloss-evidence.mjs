// Private evidence-only triage for 772 encrypted Publisher gloss differences.
// Never turns any suggestion into an approved sense, nor prints lexical data.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const digest=s=>createHash('sha256').update(s).digest('hex');
const n=s=>String(s??'').normalize('NFKC').trim().replace(/\s+/gu,'');
const withoutBrackets=s=>n(s).replace(/[（(][^（）()]{1,50}[）)]/gu,'').replace(/[，、;；。.\s]/gu,'');
const hasHan=s=>/[\u3400-\u9fff]/u.test(s);
const validHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/u.test(s);
export function triagePrivatePublishedGlossQueue(source,{expectedCount=772}={}){
 assert.equal(source?.status,'PRIVATE_PUBLISHED_772_CONTEXT_GLOSS_REVIEW_HOLD');
 assert.equal(source?.published_only,true);
 assert.equal(source?.expected_real_aggregate_anchored,772);
 assert.equal(source?.editorial_approvals,0);
 assert.equal(source?.sense_links_created,0);
 assert.equal(source?.production_db_writes,0);
 const rows=source?.review_rows;
 assert.ok(Array.isArray(rows)&&rows.length===expectedCount&&
  source?.private_row_count===expectedCount,'GLOSS_TRIAGE_REAL_772_COUNT_DRIFT');
 const seen=new Set(),legacy=new Map(),term=new Map(),results=[];
 for(const row of rows){
  assert.ok(validHash(row?.review_fingerprint_sha256)&&
   typeof row?.book_id==='string'&&row.book_id&&
   typeof row?.chapter_id==='string'&&row.chapter_id&&
   typeof row?.legacy_word_id==='string'&&row.legacy_word_id&&
   /^p(?:0|[1-9]\d*):s(?:0|[1-9]\d*)$/u.test(row?.context_anchor||'')&&
   typeof row?.headword==='string'&&row.headword&&
   typeof row?.old_card_meaning_zh==='string'&&
   typeof row?.published_context_gloss_zh==='string'&&
   typeof row?.example_en==='string'&&typeof row?.example_zh==='string'&&
   typeof row?.phonetic_uk==='string'&&typeof row?.phonetic_us==='string'&&
   row.editor_action==='HOLD'&&row.context_sense_approved===false&&
   row.verified_commercial_rights===false&&
   row.approved_sense_id===null&&
   row.eligible_for_binding===false&&
   row.eligible_for_srs_write===false,
   'GLOSS_TRIAGE_UNVERIFIED_SOURCE');
  const position=JSON.stringify([row.book_id,row.chapter_id,row.context_anchor]);
  assert.ok(!seen.has(position),'GLOSS_TRIAGE_DUPLICATE_ANCHOR');
  seen.add(position);
  assert.notEqual(n(row.old_card_meaning_zh),n(row.published_context_gloss_zh),
   'GLOSS_TRIAGE_NO_DIFFERENCE');
  const old=n(row.old_card_meaning_zh),ctx=n(row.published_context_gloss_zh);
  const byLegacy=legacy.get(row.legacy_word_id)??new Set();
  byLegacy.add(ctx);legacy.set(row.legacy_word_id,byLegacy);
  const byTerm=term.get(n(row.headword).toLowerCase())??new Set();
  byTerm.add(JSON.stringify([n(row.pos),ctx]));
  term.set(n(row.headword).toLowerCase(),byTerm);
  let classHint;
  if(withoutBrackets(old)===withoutBrackets(ctx)){
   classHint='PARENTHETICAL_OR_SEPARATOR_VARIANT_REVIEW';
  }else if(old.includes(ctx)||ctx.includes(old)){
   classHint='GLOSS_CONTAINS_OTHER_REVIEW';
  }else if(hasHan(ctx)&&hasHan(old)){
   classHint='CHINESE_SENSE_DIFFERENCE_REVIEW';
  }else{
   classHint='TRANSLATION_OR_FORMAT_DIFFERENCE_REVIEW';
  }
  results.push({
   review_fingerprint_sha256:row.review_fingerprint_sha256,
   source_locator_sha256:digest(position),
   source_card_sha256:digest(JSON.stringify([row.legacy_word_id,row.headword,
    row.old_card_meaning_zh,row.example_en,row.example_zh])),
   // Private reviewer keeps original row, not sent to CI logs or public repo.
   evidence:row,
   class_hint:classHint,
   priority:classHint==='CHINESE_SENSE_DIFFERENCE_REVIEW'?1:2,
   editor_action:'HOLD',sense_approved:false,license_approved:false,
   eligible_for_binding:false
  });
 }
 let repeatedLegacy=0;
 for(const record of results){
  const id=record.evidence.legacy_word_id;
  const head=n(record.evidence.headword).toLowerCase();
  if(legacy.get(id).size>1){record.risk_multi_context_same_old_id=true;record.priority=0;repeatedLegacy++}
  if(term.get(head).size>1)record.risk_multiple_glosses_same_headword=true;
 }
 results.sort((a,b)=>a.priority-b.priority||
  a.review_fingerprint_sha256.localeCompare(b.review_fingerprint_sha256));
 const classifications={};
 for(const x of results)classifications[x.class_hint]=(classifications[x.class_hint]??0)+1;
 return {
  status:'PRIVATE_772_GLOSS_EVIDENCE_TRIAGED_HOLD_ONLY',
  source_artifact_id:13922285839,rows_reviewed:results.length,
  distinct_legacy_word_ids:legacy.size,distinct_headwords:term.size,
  rows_same_old_id_with_multiple_context_glosses:repeatedLegacy,
  rows_same_headword_multiple_context_glosses:results.filter(x=>x.risk_multiple_glosses_same_headword).length,
  hint_counts:classifications,
  private_editor_queue:results,authenticated_semantic_approvals:0,
  commercial_license_approvals:0,approved_sense_links:0,d1_writes:0,
  note:'Heuristics prioritize inspection only; no automatic equivalence, translation repair, licensing, or shared learning state.'
 };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,3,'PRIVATE_772_SOURCE_FILE_REQUIRED');
  const output=process.env.PRIVATE_772_TRIAGE_OUTPUT;
  assert.ok(typeof output==='string'&&output.startsWith('/'),
   'PRIVATE_772_TRIAGE_ABSOLUTE_OUTPUT_REQUIRED');
  const result=triagePrivatePublishedGlossQueue(JSON.parse(readFileSync(process.argv[2],'utf8')));
  writeFileSync(output,JSON.stringify(result),{flag:'wx',mode:0o600});
  const {private_editor_queue,...safe}=result;
  console.log('PRIVATE_772_TRIAGE_ANONYMOUS_SUMMARY='+JSON.stringify(safe));
 }catch(e){
  // Never print raw error values; assertions have fixed constant messages.
  console.error('PRIVATE_772_TRIAGE_BLOCKED',e.message);
  process.exitCode=1;
 }
}
