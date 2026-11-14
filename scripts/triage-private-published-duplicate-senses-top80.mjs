// Review prioritization of REAL encrypted published-only legacy wordcard queue.
// Never print lexical values; output must be encrypted before artifact storage.
// A lexical variant warning is NOT an editorial judgement and cannot auto-merge.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const sha = s => createHash('sha256').update(s).digest('hex');
const norm = s => String(s??'').normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
const truth = (x,label) => assert.ok(x,label);

export function prioritizePublishedDuplicateEditorialQueue(source,{maxReview=80}={}){
 truth(source?.status==='PRIVATE_PUBLISHED_EDITORIAL_CANDIDATES_UNAPPROVED','TRIAGE_INVALID_SOURCE_STATUS');
 truth(source?.all_records_private===true&&source?.created_approvals===0&&source?.production_writes===0,'TRIAGE_FORGED_APPROVAL');
 const c=source?.counts;
 for(const [k,expect] of Object.entries({
  published_books:32,published_anchor_occurrences:8444,distinct_old_word_ids:3433,
  distinct_headwords:1585,textual_sense_candidates:1981,
  duplicate_textual_sense_groups:532,duplicate_excess_old_ids:1452
 }))assert.equal(c?.[k],expect,'TRIAGE_STALE_PRIVATE_SOURCE_'+k);
 assert.ok(Array.isArray(source?.duplicate_review_queue)&&
  source.duplicate_review_queue.length===532 &&
  Array.isArray(source?.other_candidate_groups)&&
  source.other_candidate_groups.length===1449,'TRIAGE_GROUP_COUNT_MISMATCH');
 assert.ok(Number.isInteger(maxReview)&&maxReview>0&&maxReview<=100,'TRIAGE_BATCH_LIMIT');
 const distinctSensesByLemma=new Map();
 for(const g of [...source.duplicate_review_queue,...source.other_candidate_groups]){
  truth(typeof g?.headword==='string'&&norm(g.headword),'TRIAGE_INVALID_LEMMA');
  const lemma=norm(g.headword);
  const parts=distinctSensesByLemma.get(lemma)??new Set();
  parts.add(JSON.stringify([norm(g.pos),norm(g.meaning_zh)]));
  distinctSensesByLemma.set(lemma,parts);
 }
 const seenGroup=new Set(),seenOld=new Set();
 const records=[];
 for(const g of source.duplicate_review_queue){
  truth(g?.editor_decision==='HOLD'&&g?.approved_sense_id===null&&
   g?.auto_merge_allowed===false&&g?.production_writes_allowed===false,
   'TRIAGE_UNSAFE_APPROVAL_STATUS');
  truth(Array.isArray(g?.legacy_word_ids)&&g.legacy_word_ids.length>1 &&
   Array.isArray(g?.book_ids)&&g.book_ids.length>0 &&
   Array.isArray(g?.card_evidence)&&g.card_evidence.length>=g.legacy_word_ids.length &&
   Number.isInteger(g?.occurrences)&&g.occurrences>0,'TRIAGE_MALFORMED_EVIDENCE');
  const fingerprint=sha(JSON.stringify([norm(g.headword),norm(g.pos),
    norm(g.meaning_zh),[...g.legacy_word_ids].sort(),[...g.book_ids].sort()]));
  truth(!seenGroup.has(fingerprint),'TRIAGE_DUPLICATED_GROUP');
  seenGroup.add(fingerprint);
  for(const old of g.legacy_word_ids){
   truth(typeof old==='string'&&old.length>0&&!seenOld.has(old),'TRIAGE_LEGACY_ID_COLLISION');
   seenOld.add(old);
  }
  const evidOld=new Set(g.card_evidence.map(e=>e.old_word_id));
  truth(g.legacy_word_ids.every(x=>evidOld.has(x)),'TRIAGE_LEGACY_EVIDENCE_MISSING');
  const uk=new Set(g.card_evidence.map(e=>norm(e.phonetic_uk)).filter(Boolean));
  const us=new Set(g.card_evidence.map(e=>norm(e.phonetic_us)).filter(Boolean));
  const en=new Set(g.card_evidence.map(e=>norm(e.example_en)).filter(Boolean));
  const zh=new Set(g.card_evidence.map(e=>norm(e.example_zh)).filter(Boolean));
  const polysemy=(distinctSensesByLemma.get(norm(g.headword))?.size??0)>1;
  const ipaVariants=uk.size>1||us.size>1;
  const exampleVariants=en.size>1||zh.size>1;
  const crossBooks=g.book_ids.length>1;
  const extraIds=g.legacy_word_ids.length-1;
  const flags=[
   ...(polysemy?['OTHER_POS_OR_GLOSS_CANDIDATES_FOR_HEADWORD']:[]),
   ...(ipaVariants?['IPA_VARIANT_REQUIRES_EXPERT_CHECK']:[]),
   ...(exampleVariants?['BILINGUAL_EXAMPLE_VARIANT_REQUIRES_CHECK']:[]),
   ...(crossBooks?['REPEATED_BETWEEN_PUBLISHED_BOOKS']:[]),
   ...(g.risk_flags??[]).filter(x=>typeof x==='string'&&x.endsWith('_MISSING'))
  ];
  const score=extraIds*30+g.book_ids.length*25+
    Math.min(g.occurrences,150)+Number(polysemy)*90+
    Number(ipaVariants)*120+Number(exampleVariants)*45;
  records.push({
   fingerprint_sha256:fingerprint,headword:g.headword,
   pos:g.pos,meaning_zh:g.meaning_zh,
   book_ids:[...g.book_ids],old_word_ids:[...g.legacy_word_ids],
   occurrences:g.occurrences,extra_legacy_ids:extraIds,
   priority_score:score,flags,
   ipa_variant_count:{uk:uk.size,us:us.size},
   example_variant_count:{en:en.size,zh:zh.size},
   card_evidence:g.card_evidence,
   reviewer_action:'HOLD',reviewed_entry_id:null,confirmed_sense_id:null,
   pronunciation_reviewed:false,examples_reviewed:false,
   commercial_rights_reviewed:false,semantic_equivalence_reviewed:false,
   authenticated_publisher_signoff:false,
   merge_legacy_user_study_allowed:false
  });
 }
 records.sort((a,b)=>b.priority_score-a.priority_score||
  b.occurrences-a.occurrences||a.fingerprint_sha256.localeCompare(b.fingerprint_sha256));
 const rows=records.slice(0,maxReview);
 return {
  status:'PUBLISHED_32_PRIVATE_TOP80_EDITORIAL_REVIEW_ONLY',
  source_artifact_id:13911979176,
  source_duplicate_group_count:532,
  review_count:rows.length,
  safe_aggregate:{
   candidate_groups:records.length,
   flagged_other_senses:records.filter(r=>r.flags.includes('OTHER_POS_OR_GLOSS_CANDIDATES_FOR_HEADWORD')).length,
   flagged_ipa_variants:records.filter(r=>r.flags.includes('IPA_VARIANT_REQUIRES_EXPERT_CHECK')).length,
   flagged_bilingual_variants:records.filter(r=>r.flags.includes('BILINGUAL_EXAMPLE_VARIANT_REQUIRES_CHECK')).length,
   duplicated_between_books:records.filter(r=>r.flags.includes('REPEATED_BETWEEN_PUBLISHED_BOOKS')).length,
   top80_groups:rows.length,
   top80_legacy_excess_ids:rows.reduce((n,r)=>n+r.extra_legacy_ids,0),
   top80_occurrences:rows.reduce((n,r)=>n+r.occurrences,0),
   authorized_approvals:0,production_writes:0
  },
  top_editorial_queue:rows,
  reviewer_note:'All decisions remain HOLD. Text equivalence, IPA or example differences require editor and legal rights review.',
  production_writes:0,approved_sense_ids_created:0,
  user_learning_state_changed:false
 };
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,4,'TRIAGE_EXPECT_PRIVATE_SOURCE_AND_OUTPUT');
  const [inputPath,outputPath]=process.argv.slice(2);
  const result=prioritizePublishedDuplicateEditorialQueue(JSON.parse(readFileSync(inputPath,'utf8')));
  writeFileSync(outputPath,JSON.stringify(result),{mode:0o600,flag:'wx'});
  console.log('PUBLISHED_PRIVATE_TOP80_REVIEW_AGGREGATES='+JSON.stringify(result.safe_aggregate));
  console.log('PUBLISHED_PRIVATE_TOP80_REVIEW_MUST_ENCRYPT_NO_LEXICAL_ROWS_PRINTED');
 }catch(e){
  // No user provided source values, dictionary words or private IDs in error text.
  console.error('PUBLISHED_PRIVATE_TOP80_REVIEW_BLOCKED',e.message);
  process.exitCode=1;
 }
}
