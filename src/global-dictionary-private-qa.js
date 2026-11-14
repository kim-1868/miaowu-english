// Offline-only QA: unreviewed source words and examples, no auto approval.
const word=x=>String(x??'').normalize('NFKC').trim().toLowerCase();
const quote=s=>String(s).replace(/[|\\{}()[\]^$+*?.]/g,'\\$&');
const present=(text,term)=>new RegExp('(^|[^A-Za-z])'+quote(term)+'(?=$|[^A-Za-z])','iu').test(text||'');
const accepted=new Set(['s','p','d','i','3','r','t']);
export function sourceForms(exchange,headword){
 const forms=new Set([word(headword)]);
 for(const item of String(exchange||'').split('/')){
  const index=item.indexOf(':');
  if(index<0)continue;
  const tag=item.slice(0,index),s=word(item.slice(index+1));
  if(accepted.has(tag)&&/^[a-z]+$/u.test(s))forms.add(s);
 }
 return [...forms];
}
export function inferredForms(lemma){
 const s=word(lemma),out=new Set([s+'s',s+'ed',s+'ing',s+'es']);
 if(s.endsWith('e')){out.add(s+'d');out.add(s.slice(0,-1)+'ing');}
 if(s.length>2&&s.endsWith('y')&&!/[aeiou]/u.test(s.at(-2))){
  out.add(s.slice(0,-1)+'ies');out.add(s.slice(0,-1)+'ied');
 }
 return [...out];
}
export function auditPrivateTeachingSense(row,sourceExchange=''){
 if(!row||!row.headword||!row.meaning_zh||
  !Array.isArray(row.example_candidates)||!row.example_candidates.length||
  !Array.isArray(row.phonetic_uk_variants)||!Array.isArray(row.phonetic_us_variants))
  throw Error('PRIVATE_CARD_FIELDS_INVALID');
 const lemma=word(row.headword),examples=row.example_candidates.map(x=>String(x.example_en||''));
 const hasOriginal=examples.some(x=>present(x,lemma));
 const source=sourceForms(sourceExchange,lemma);
 const hasSource=examples.some(x=>source.some(f=>present(x,f)));
 const inferred=inferredForms(lemma);
 const hasInference=examples.some(x=>inferred.some(f=>present(x,f)));
 const flags=[...new Set(row.editorial_flags||[])];
 if(!hasSource)flags.push(hasInference?'EXAMPLE_ONLY_INFERRED_INFLECTION_NOT_SOURCE_VERIFIED':
  'EXAMPLE_WORD_NOT_FOUND_AMONG_LEMMA_OR_LISTED_FORMS');
 if(!new Set(['n.','v.','adj.','adv.']).has(row.part_of_speech))
  flags.push('NON_STANDARD_OR_COMBINED_PART_OF_SPEECH');
 if(!row.phonetic_uk_variants.length||!row.phonetic_us_variants.length)
  flags.push('MISSING_IPA_VARIANTS');
 if(row.example_candidates.some(x=>!x.example_en||!x.example_zh))
  flags.push('MISSING_BILINGUAL_EXAMPLE');
 return {candidate_hash_sha256:row.candidate_hash_sha256,
  headword:lemma,source_forms:source,
  exact_headword_found:hasOriginal,source_form_found:hasSource,
  inferred_regular_form_found:hasInference,qa_flags:flags,
  reviewed:false,lesson_approved:false,approved_sense_id:null,
  auto_publish_allowed:false,cloudflare_writes:0};
}
export function auditPrivateTeachingSenses(rows,exchanges=new Map()){
 if(!Array.isArray(rows)||!rows.length||!(exchanges instanceof Map))
  throw Error('PRIVATE_CANDIDATE_LIST_REQUIRED');
 const ids=new Set(),result=[],counts={};
 for(const w of rows){
  const id=w?.candidate_hash_sha256;
  if(!/^[a-f0-9]{64}$/u.test(id||'')||ids.has(id)||
   w.approved_sense_id!=null||w.lesson_approved===true)
   throw Error('PRIVATE_SENSE_ID_OR_APPROVAL_INVALID');
  ids.add(id);
  const qa=auditPrivateTeachingSense(w,exchanges.get(word(w.headword))||'');
  for(const f of qa.qa_flags)counts[f]=(counts[f]||0)+1;
  result.push(qa);
 }
 return {status:'UNREVIEWED_OFFLINE_QUALITY_TRIAGE',
  summary:{sense_candidates:result.length,flag_counts:counts,
   exact_headword_in_examples:result.filter(x=>x.exact_headword_found).length,
   owner_source_form_match:result.filter(x=>x.source_form_found).length,
   commercial_senses_approved:0,learning_state_writes:0,cloudflare_writes:0},
  candidates:result};
}
