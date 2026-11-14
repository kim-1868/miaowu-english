// V1.2 novel import: automatically discover English and plan verified
// dictionary target patches. Never mutate the original novel or auto-publish.
// Only a UNIQUE, licensed, reviewed dictionary sense is a provisional target;
// contextual correctness is NOT proven by lexical uniqueness.
import {matchDictionaryWord,normalizedLemma} from './global-dictionary-matcher.js';
import {auditDictionaryLesson} from './global-dictionary-novel-v2.js';

const TOKENS=/[a-z]+(?:['’][a-z]+)*(?:-[a-z]+)*/giu;
const MASK=/https?:\/\/\S+|[\w.-]+@[\w.-]+\.\w+|\b(?:www\.)[\w.-]+\.[a-z]{2,}\S*/giu;
const SENSE=/^gds_[0-9a-f]{24}$/u;
const PO=/^[a-z][a-z0-9-]{2,29}$/u;
const n=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const pos=x=>n(x).toLowerCase().replace(/[.。]/gu,'');
const YES=x=>x===true||x===1;
const max=(n,hi)=>Number.isSafeInteger(n)&&n>0&&n<=hi;

function prepareSenses(rows){
 if(!Array.isArray(rows)||rows.length>30000)throw Error('AUTO_NOVEL_INVALID_SENSE_ROWS');
 const byEntry=new Map(),seen=new Set();
 for(const r of rows){
  if(!r||!SENSE.test(r.sense_id||'')||typeof r.entry_id!=='string'||
   !r.entry_id||seen.has(r.sense_id))throw Error('AUTO_NOVEL_INVALID_OR_DUPLICATE_SENSE');
  seen.add(r.sense_id);
  if(!byEntry.has(r.entry_id))byEntry.set(r.entry_id,[]);
  byEntry.get(r.entry_id).push(r);
 }
 return byEntry;
}
function reviewedUniqueSense(candidate,lessons,rows){
 if(!candidate?.teaching_ready||!candidate.form_reviewed)return null;
 const lesson=lessons instanceof Map?lessons.get(candidate.entry_id):
  lessons?.[candidate.entry_id];
 const checked=auditDictionaryLesson(lesson);
 if(!checked.valid||checked.lesson.headword!==candidate.headword)return null;
 const allowed=(rows.get(candidate.entry_id)||[]).filter(s=>
  YES(s.approved)&&YES(s.active)&&s.reviewed_by&&s.reviewed_at&&
  YES(s.source_license_reviewed)&&
  checked.senses.filter(one=>pos(one.pos)===pos(s.pos)&&
   n(one.meaningZh)===n(s.meaning_zh)&&
   one.exampleEn.trim()===String(s.example_en??'').trim()&&
   one.exampleZh.trim()===String(s.example_zh??'').trim()).length===1);
 return allowed.length===1 && (rows.get(candidate.entry_id)||[]).filter(s=>
  YES(s.approved)&&YES(s.active)).length===1?allowed[0]:null;
}
export function planDraftNovelAutomaticTargets(source,index,lessons,{
 approvedSenses=[],minWordLength=3,maxSuggestions=5000,maxCandidates=3000
}={}){
 if(source?.version!==2||source.words!==undefined||
  !source.book||!PO.test(source.book.category||'')||
  !Array.isArray(source.chapters)||!source.chapters.length||
  source.chapters.length>60||!index?.byWord||!index?.byForm||
  !max(minWordLength,20)||!max(maxSuggestions,10000)||!max(maxCandidates,10000))
  throw Error('AUTO_NOVEL_INVALID_V2_DRAFT_OR_CONFIGURATION');
 const approved=prepareSenses(approvedSenses);
 const suggested=[],pending=new Map();
 const chapterNos=new Set();
 let visibleEnglish=0,alreadyMarked=0,untouchedParagraphs=0,autoLimitReached=false;
 const addPending=(lemma,reason,chapterNo)=>{
  const key=lemma+'\0'+reason;
  if(pending.has(key)){pending.get(key).count++;return}
  if(pending.size>=maxCandidates)return;
  pending.set(key,{headword:lemma,reason,chapter_numbers:[chapterNo],count:1});
 };
 for(const ch of source.chapters){
  if(!Number.isInteger(ch?.number)||ch.number<1||
   chapterNos.has(ch.number)||!Array.isArray(ch.paragraphs)||ch.paragraphs.length>150)
   throw Error('AUTO_NOVEL_INVALID_CHAPTER');
  chapterNos.add(ch.number);
  for(const [pi,p] of ch.paragraphs.entries()){
   if(!Array.isArray(p?.segments)||p.segments.length>150)
    throw Error('AUTO_NOVEL_INVALID_PARAGRAPH');
   let found=0;
   for(const [si,s] of p.segments.entries()){
    if(typeof s?.surface==='string'&&typeof s?.gloss==='string'&&
     s.wordId===undefined){alreadyMarked++;continue}
    if(typeof s?.text!=='string'||s.wordId!==undefined||
     s.surface!==undefined||s.gloss!==undefined)
     throw Error('AUTO_NOVEL_INVALID_SEGMENT');
    const original=s.text;
    // Mask URL/email spans without changing offsets.
    const masked=original.replace(MASK,m=>' '.repeat(m.length));
    for(const tok of masked.matchAll(TOKENS)){
     const surface=original.slice(tok.index,tok.index+tok[0].length);
     const lemma=normalizedLemma(surface);
     if(!lemma||lemma.length<minWordLength)continue;
     visibleEnglish++;found++;
     const matched=matchDictionaryWord(surface,index);
     if(matched.status!=='matched'){
      addPending(lemma,matched.reason,ch.number);continue;
     }
     const candidate=matched.candidates.find(c=>c.entry_id===matched.entry_id);
     const verified=reviewedUniqueSense(candidate,lessons,approved);
     if(!verified){
      addPending(lemma,'UNIQUE_APPROVED_LICENSED_SENSE_NOT_PROVEN',ch.number);continue;
     }
     if(suggested.length>=maxSuggestions){
      autoLimitReached=true;
      addPending(lemma,'MAX_SUGGESTIONS_REACHED',ch.number);continue;
     }
     suggested.push({
      chapter_number:ch.number,paragraph_index:pi,segment_index:si,
      offset_start:tok.index,offset_end:tok.index+tok[0].length,
      surface,entry_id:candidate.entry_id,sense_id:verified.sense_id,
      context_gloss_candidate:verified.meaning_zh,
      status:'PROVISIONAL_UNVERIFIED_CONTEXT',
      patch_applied:false,publisher_approved:false,
      user_study_enabled:false
     });
    }
   }
   if(!found)untouchedParagraphs++;
  }
 }
 return {status:'AUTO_NOVEL_TARGET_PATCH_PROPOSAL_ONLY',
  book_id:source.book.id??null,category:source.book.category,
  visible_english_tokens_scanned:visibleEnglish,
  existing_explicit_study_targets:alreadyMarked,
  proposals:suggested,
  pending:[...pending.values()].sort((a,b)=>b.count-a.count||
   a.headword.localeCompare(b.headword,'en')),
  summary:{provisional_unique_reviewed_sense_positions:suggested.length,
   pending_unique_word_reason_pairs:pending.size,
   untouched_paragraphs:untouchedParagraphs,auto_limit_reached:autoLimitReached},
  source_manuscript_modified:false,converted_package_generated:false,
  publisher_release_allowed:false,novel_upload_committed:false,
  approved_context_bindings_created:0,
  warning:'A single licensed dictionary sense does NOT prove meaning in this story context. Proposals are not applied or published.'};
}
