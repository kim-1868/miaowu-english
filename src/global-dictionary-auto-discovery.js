// Read-only discovery of English words in unmarked V2 story text.
// Never creates words[], publication, user progress, or verified sense IDs.
// Suggested lessons require an editor to confirm meaning IN THIS CONTEXT.
import {normalizedLemma,matchDictionaryWord} from './global-dictionary-matcher.js';
import {auditDictionaryLesson} from './global-dictionary-novel-v2.js';
import {planApprovedNovelSenseAnchors} from './global-dictionary-sense-anchor.js';

const TOKEN=/[a-z]+(?:['’][a-z]+)*(?:-[a-z]+)*/giu;
const MAX_TOKENS=12000,MAX_UNIQUE=1800,MAX_TEXT_CHARS=1_800_000;
const validText=s=>typeof s==='string'&&s.length<=20000;
const position=x=>[x.chapter_number,x.paragraph_index,x.segment_index,x.start_offset].join(':');
const normZh=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const normPos=x=>String(x??'').toLowerCase().replace(/[.。\s]/gu,'');

export function extractUnmarkedV2EnglishTokens(source){
 const novel=source?.package??source;
 if(!novel||novel.version!==2||!novel.book||
    typeof novel.book.id!=='string'||!novel.book.id||
    !['cet4','cet6','postgrad','ielts'].includes(novel.book.category)||
    novel.words!==undefined||!Array.isArray(novel.chapters)||
    novel.chapters.length<1||novel.chapters.length>60)
   throw Error('INVALID_AUTO_DISCOVERY_V2_PACKAGE');
 const tokens=[],spellings=new Set(),chapters=new Set();
 let chars=0;
 for(const ch of novel.chapters){
   if(!ch||!Number.isInteger(ch.number)||ch.number<1||
      chapters.has(ch.number)||!Array.isArray(ch.paragraphs)||
      ch.paragraphs.length>600)throw Error('INVALID_AUTO_DISCOVERY_CHAPTER');
   chapters.add(ch.number);
   for(const [pi,p] of ch.paragraphs.entries()){
     if(!p||!Array.isArray(p.segments)||p.segments.length>1000)
       throw Error('INVALID_AUTO_DISCOVERY_PARAGRAPH');
     for(const [si,s] of p.segments.entries()){
       if(!s||typeof s!=='object'||Array.isArray(s))
         throw Error('INVALID_AUTO_DISCOVERY_SEGMENT');
       if(typeof s.surface==='string'&&typeof s.gloss==='string'&&
          s.text===undefined&&s.wordId===undefined)continue;
       if(!validText(s.text)||s.surface!==undefined||s.gloss!==undefined||
          s.wordId!==undefined)
         throw Error('INVALID_AUTO_DISCOVERY_SEGMENT');
       chars+=s.text.length;
       if(chars>MAX_TEXT_CHARS)throw Error('AUTO_DISCOVERY_TEXT_TOO_LARGE');
       for(const found of s.text.matchAll(TOKEN)){
         const normalized=normalizedLemma(found[0]);
         if(!normalized)continue;
         if(tokens.length>=MAX_TOKENS)throw Error('AUTO_DISCOVERY_TOKEN_LIMIT');
         spellings.add(normalized);
         if(spellings.size>MAX_UNIQUE)throw Error('AUTO_DISCOVERY_UNIQUE_WORD_LIMIT');
         tokens.push({chapter_number:ch.number,paragraph_index:pi,
           segment_index:si,start_offset:found.index,
           end_offset:found.index+found[0].length,
           surface:found[0],normalized_surface:normalized,
           // No full paid-story text is copied into this candidate plan.
           context_length:s.text.length});
       }
     }
   }
 }
 return {status:'READ_ONLY_UNMARKED_ENGLISH_TOKENS',
   book_id:novel.book.id,category:novel.book.category,
   tokens,unique_spellings:[...spellings].sort(),novel_unchanged:true};
}

export function planApprovedNovelAutoDiscovery(extracted,index,{
 lessons=new Map(),senses=[]
}={}){
 if(extracted?.status!=='READ_ONLY_UNMARKED_ENGLISH_TOKENS'||
    !Array.isArray(extracted.tokens)||!Array.isArray(senses)||
    !index?.byWord||!index?.byForm)
   throw Error('INVALID_AUTO_DISCOVERY_INDEX_OR_SOURCE');
 const bySense=new Map();
 for(const s of senses){
   if(!s||typeof s.entry_id!=='string'||typeof s.sense_id!=='string')
     throw Error('INVALID_AUTO_DISCOVERY_SENSE_ROW');
   if(!bySense.has(s.entry_id))bySense.set(s.entry_id,[]);
   bySense.get(s.entry_id).push(s);
 }
 const reviewed=[],manual=[],byWord=new Map();
 for(const token of extracted.tokens){
   const key=position(token);
   const matched=matchDictionaryWord(token.surface,index);
   const candidates=[];
   // Ambiguous dictionary entries may have only one fully approved active
   // sense; an editor must still confirm meaning in the story.
   for(const c of matched.candidates){
     if(!c.teaching_ready||!c.form_reviewed)continue;
     const lesson=lessons instanceof Map?lessons.get(c.entry_id):lessons?.[c.entry_id];
     const audited=auditDictionaryLesson(lesson);
     if(!audited.valid||audited.lesson.headword!==c.headword)continue;
     for(const sense of audited.senses){
       if(!normPos(sense.pos)||!normZh(sense.meaningZh))continue;
       const matches=(bySense.get(c.entry_id)||[]).filter(s=>
         (s.active===1||s.active===true)&&
         (s.approved===1||s.approved===true)&&
         s.reviewed_by&&s.reviewed_at&&
         normPos(s.pos)===normPos(sense.pos)&&
         normZh(s.meaning_zh)===normZh(sense.meaningZh));
       for(const s of matches){
         const check=planApprovedNovelSenseAnchors([{
           ...token,entry_id:c.entry_id,headword:c.headword,gloss:sense.meaningZh
         }],{lessons:new Map([[c.entry_id,lesson]]),senses:[s]});
         if(check.ready_for_sense_study)
           candidates.push({entry_id:c.entry_id,headword:c.headword,
             sense_id:s.sense_id,part_of_speech:s.pos,gloss:sense.meaningZh});
       }
     }
   }
   // Deduplicate an approved sense if it occurs in multiple lesson entries.
   const choices=[...new Map(candidates.map(c=>[c.sense_id,c])).values()];
   const record={...token,position_key:key};
   if(choices.length===1){
     reviewed.push({...record,...choices[0],
       action:'PROPOSE_ONLY_REQUIRES_CONTEXT_EDITOR_CONFIRMATION',
       automatic_publication_allowed:false});
   }else{
     manual.push({...record,
       reason:choices.length>1?'MULTIPLE_APPROVED_SENSES_REQUIRE_CONTEXT':
        matched.status==='missing'?'HEADWORD_NOT_IN_DICTIONARY':
        matched.status==='dictionary_only'?'CANDIDATE_HEADWORD_UNREVIEWED':
        'NO_UNIQUE_APPROVED_CONTEXT_SENSE',
       approved_options:choices.length});
   }
   if(!byWord.has(token.normalized_surface))
     byWord.set(token.normalized_surface,{token_count:0,
       approved_suggestions:0,manual_review_count:0});
   const stat=byWord.get(token.normalized_surface);
   stat.token_count++;
   if(choices.length===1)stat.approved_suggestions++;else stat.manual_review_count++;
 }
 return {status:'AUTO_DISCOVERY_DRAFT_SUGGESTIONS_REQUIRING_EDITOR_CONFIRMATION',
   book_id:extracted.book_id,category:extracted.category,
   scanned_unmarked_tokens:extracted.tokens.length,
   distinct_unmarked_headwords:byWord.size,
   proposed_occurrences:reviewed.length,needs_review_occurrences:manual.length,
   suggestions:reviewed,review_queue:manual,
   headword_counts:[...byWord.entries()].map(([headword,counts])=>({headword,...counts})),
   requires_context_editor_confirmation:true,
   did_not_infer_unapproved_gloss:true,
   books_or_chapters_modified:false,words_created:0,
   publisher_signed_off:false,production_d1_writes:0,user_state_writes:0};
}
