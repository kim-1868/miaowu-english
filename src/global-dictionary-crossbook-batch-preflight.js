// V1.2 offline only: actionable cross-book review queue for authenticated
// CET4/CET6 publisher exports and local postgraduate draft manuscripts.
// Does NOT approve dictionary lessons, copy story prose or merge user states.
import {unpackAndVerifyExamLiveBatch} from '../scripts/audit-cet4-published-archive-offline.mjs';
import {matchDictionaryWord,normalizedLemma} from './global-dictionary-matcher.js';

const GRADES=new Set(['cet4','cet6','postgrad']);
const ENGLISH_WORDS=/[a-z]+(?:['’][a-z]+)*(?:-[a-z]+)*/giu;
const URL_OR_EMAIL=/https?:\/\/\S+|[\w.-]+@[\w.-]+\.\w+/giu;
const MAX_UNMARKED_TOKEN_OCCURRENCES=200000;
const UNIQ='\u0000';
const compact=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const pos=x=>compact(x).toLowerCase().replace(/[.。]/gu,'');
const en=x=>normalizedLemma(x);
const sort=(a,b)=>String(a).localeCompare(String(b),'en');
const wordId=x=>String(x?.id??x?.word_id??'');
const head=x=>en(x?.headword);
const sense=x=>compact(x?.meaningZh??x?.meaning_zh);
const pronunciation=x=>[x?.phoneticUk,x?.phoneticUs,x?.phonetic_uk,x?.phonetic_us]
  .some(s=>String(s??'').trim().length>0);
const example=x=>String(x?.exampleEn??x?.example_en??'').trim().length>0&&
  String(x?.exampleZh??x?.example_zh??'').trim().length>0;
const lessonPOS=x=>pos(x?.partOfSpeech??x?.part_of_speech);
const capped=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
function prepareBooks({bundles,postgradDrafts}){
 if(!Array.isArray(bundles)||!Array.isArray(postgradDrafts)||
    !bundles.length&&!postgradDrafts.length)
   throw Error('CROSSBOOK_NO_SOURCE_BOOKS');
 if(bundles.length>2||postgradDrafts.length>50)
   throw Error('CROSSBOOK_BATCH_LIMIT_EXCEEDED');
 const docs=[],categories=new Set();
 for(const bundle of bundles){
   if(!['cet4','cet6'].includes(bundle?.category)||
      categories.has(bundle.category))
     throw Error('CROSSBOOK_DUPLICATE_OR_UNSUPPORTED_EXPORT');
   categories.add(bundle.category);
   const unpacked=unpackAndVerifyExamLiveBatch(bundle,{category:bundle.category});
   for(const book of unpacked)docs.push({package:book,origin:'verified-publisher-export'});
 }
 for(const book of postgradDrafts){
   const source=book?.package??book;
   if(!source||source?.book?.category!=='postgrad'||!Array.isArray(source.words)||
      !Array.isArray(source.chapters)||!source.chapters.length)
     throw Error('CROSSBOOK_POSTGRAD_DRAFT_SHAPE_INVALID');
   docs.push({package:source,origin:'local-unpublished-draft'});
 }
 if(docs.length>110)throw Error('CROSSBOOK_TOO_MANY_BOOKS');
 return docs;
}
export function planCrossbookDictionaryPreflight({
 bundles=[],postgradDrafts=[],index=null
}={}){
 if(index!==null&&(!(index.byWord instanceof Map)||!(index.byForm instanceof Map)))
   throw Error('CROSSBOOK_INDEX_INVALID');
 const docs=prepareBooks({bundles,postgradDrafts}),books=[],groups=new Map();
 const unmarkedByHeadword=new Map();let unmarkedTotal=0;
 const spellings=new Map(),usedBookIDs=new Set(),allGrades=new Set();
 let totalOccurrences=0;
 for(const item of docs){
   const source=item.package,meta=source.book,grade=meta?.category;
   if(!GRADES.has(grade)||typeof meta.id!=='string'||!meta.id||
      typeof meta.title!=='string'||!meta.title||
      !Array.isArray(source.words)||source.words.length>12000||
      !Array.isArray(source.chapters)||!capped(source.chapters.length,80))
     throw Error('CROSSBOOK_INVALID_BOOK_SHAPE');
   const bookKey=grade+':'+meta.id;
   if(usedBookIDs.has(bookKey))throw Error('CROSSBOOK_DUPLICATE_BOOK_ID');
   usedBookIDs.add(bookKey);allGrades.add(grade);
   const byId=new Map(),used=new Set(),countById=new Map(),warnings=[];
   const unmarkedHere=new Set();let unmarkedTokenOccurrences=0;
   for(const w of source.words){
     const id=wordId(w);
     if(!id||byId.has(id)||!head(w))throw Error('CROSSBOOK_INVALID_OR_DUPLICATE_WORDCARD');
     byId.set(id,w);
   }
   const uniqueChapterNumbers=new Set();
   let paragraphs=0,paragraphsWithoutTargets=0,missingReferences=0,
     differingGlosses=0,markedOccurrences=0,unmarkedEnglishSegments=0;
   for(const chapter of source.chapters){
     if(!chapter||!Number.isInteger(chapter.number)||chapter.number<1||
        uniqueChapterNumbers.has(chapter.number)||
        !Array.isArray(chapter.paragraphs)||chapter.paragraphs.length>1000)
       throw Error('CROSSBOOK_INVALID_OR_DUPLICATE_CHAPTER');
     uniqueChapterNumbers.add(chapter.number);
     for(const paragraph of chapter.paragraphs){
       if(!Array.isArray(paragraph?.segments)||paragraph.segments.length>1000)
         throw Error('CROSSBOOK_INVALID_PARAGRAPH');
       paragraphs++;let here=0;
       for(const seg of paragraph.segments){
         if(typeof seg?.wordId==='string'){
           here++;markedOccurrences++;totalOccurrences++;
           if(totalOccurrences>250000)throw Error('CROSSBOOK_OCCURRENCE_LIMIT');
           const card=byId.get(seg.wordId);
           if(!card){missingReferences++;continue}
           used.add(seg.wordId);
           countById.set(seg.wordId,(countById.get(seg.wordId)||0)+1);
           if(typeof seg.gloss!=='string'||!compact(seg.gloss)||
              compact(seg.gloss)!==sense(card))differingGlosses++;
         }else if(typeof seg?.text==='string'){
           const visible=seg.text.replace(URL_OR_EMAIL,' ');
           let segmentHasEnglish=false;
           for(const token of visible.matchAll(ENGLISH_WORDS)){
             const lemma=en(token[0]);
             if(!lemma||lemma.length<2)continue;
             segmentHasEnglish=true;
             unmarkedTokenOccurrences++;unmarkedTotal++;
             if(unmarkedTotal>MAX_UNMARKED_TOKEN_OCCURRENCES)
               throw Error('CROSSBOOK_UNMARKED_TOKEN_SCAN_LIMIT');
             unmarkedHere.add(lemma);
             if(!unmarkedByHeadword.has(lemma))
               unmarkedByHeadword.set(lemma,{books:new Set(),grades:new Set(),occurrences:0});
             const hit=unmarkedByHeadword.get(lemma);
             hit.books.add(bookKey);hit.grades.add(grade);hit.occurrences++;
           }
           if(segmentHasEnglish)unmarkedEnglishSegments++;
         }else throw Error('CROSSBOOK_INVALID_SEGMENT');
       }
       if(here===0)paragraphsWithoutTargets++;
     }
   }
   let missingIpa=0,missingExamples=0,missingPos=0,missingMeaning=0;
   for(const id of used){
     const card=byId.get(id),h=head(card),p=lessonPOS(card),m=sense(card);
     if(!pronunciation(card))missingIpa++;
     if(!example(card))missingExamples++;
     if(!p)missingPos++;
     if(!m)missingMeaning++;
     // A blank POS / gloss can NEVER establish cross-book same-sense identity.
     const strict=Boolean(p&&m);
     const key=strict?[h,p,m].join(UNIQ):
       [bookKey,id,'UNRESOLVED'].join(UNIQ);
     if(!groups.has(key))groups.set(key,{
       headword:h,part_of_speech:p||null,meaning_zh:m||null,
       strict_sense_candidate:strict,bookIds:new Set(),grades:new Set(),
       oldWordIds:new Set(),oldCardCount:0,occurrences:0,
       missingIpaCards:0,missingExampleCards:0,missingPosCards:0,
       missingMeaningCards:0,sourceKinds:new Set()
     });
     const g=groups.get(key);
     g.bookIds.add(bookKey);g.grades.add(grade);g.oldWordIds.add(bookKey+':'+id);
     g.oldCardCount++;g.occurrences+=countById.get(id)||0;
     g.missingIpaCards+=Number(!pronunciation(card));
     g.missingExampleCards+=Number(!example(card));
     g.missingPosCards+=Number(!p);g.missingMeaningCards+=Number(!m);
     g.sourceKinds.add(item.origin);
     if(!spellings.has(h))spellings.set(h,new Set());
     if(strict)spellings.get(h).add(key);
   }
   if(missingReferences)warnings.push('MISSING_WORDCARD_REFERENCES');
   if(differingGlosses)warnings.push('CONTEXT_GLOSS_REQUIRES_EDITOR');
   if(missingIpa)warnings.push('MISSING_IPA');
   if(missingExamples)warnings.push('MISSING_BILINGUAL_EXAMPLES');
   if(missingPos)warnings.push('MISSING_POS_NEEDS_SENSE_REVIEW');
   if(missingMeaning)warnings.push('MISSING_SENSE_GLOSS');
   if(paragraphsWithoutTargets)warnings.push('PARAGRAPHS_WITHOUT_LEARNING_TARGETS');
   if(unmarkedEnglishSegments)warnings.push('UNMARKED_ENGLISH_DISCOVERY_PENDING');
   books.push({
     book_id:meta.id,title:meta.title,category:grade,source_kind:item.origin,
     chapters:source.chapters.length,paragraphs,paragraphs_without_targets:paragraphsWithoutTargets,
     unmarked_english_segments:unmarkedEnglishSegments,
     unmarked_english_occurrences:unmarkedTokenOccurrences,
     unique_unmarked_headwords:unmarkedHere.size,
     annotated_occurrences:markedOccurrences,referenced_cards:used.size,
     packaged_cards:byId.size,unused_cards:byId.size-used.size,
     missing_card_references:missingReferences,context_gloss_mismatches:differingGlosses,
     cards_missing_ipa:missingIpa,cards_missing_examples:missingExamples,
     cards_missing_part_of_speech:missingPos,cards_missing_meaning:missingMeaning,
     review_flags:warnings
   });
 }
 const unmarkedDiscovery=[...unmarkedByHeadword].map(([headword,item])=>{
   const verdict=index?matchDictionaryWord(headword,index):null;
   return {
     headword,occurrences:item.occurrences,
     source_book_ids:[...item.books].sort(sort),
     exam_categories:[...item.grades].sort(sort),
     dictionary_lookup_status:verdict?.status??'NOT_CHECKED',
     dictionary_candidate_entry_ids:verdict?.candidates?.map(x=>x.entry_id)??[],
     requires_context_sense_review:true,automatically_bound:false,
     approved_sense_id:null,automatic_publication_allowed:false
   };
 }).sort((a,b)=>b.source_book_ids.length-a.source_book_ids.length||
   b.occurrences-a.occurrences||sort(a.headword,b.headword));
 const unmarkedStatuses=['matched','dictionary_only','needs_review','missing','NOT_CHECKED'];
 const unmarkedCounts=Object.fromEntries(unmarkedStatuses.map(v=>[
   v,unmarkedDiscovery.filter(row=>row.dictionary_lookup_status===v).length
 ]));
 const report=[...groups.values()].map(g=>{
   const dictionary=index?matchDictionaryWord(g.headword,index):null;
   const issues=[];
   if(!g.strict_sense_candidate)issues.push('SENSE_IDENTITY_INCOMPLETE');
   if(g.missingIpaCards)issues.push('IPA_REVIEW_NEEDED');
   if(g.missingExampleCards)issues.push('EXAMPLE_REVIEW_NEEDED');
   if((spellings.get(g.headword)?.size||0)>1)issues.push('SAME_SPELLING_DIFFERENT_SENSES');
   if(dictionary&&dictionary.status!=='matched')
     issues.push('DICTIONARY_'+dictionary.status.toUpperCase());
   const reviewPriority=20*g.bookIds.size+g.occurrences+
      6*g.grades.size+12*Number(issues.length>0);
   return {
     headword:g.headword,part_of_speech:g.part_of_speech,
     meaning_zh:g.meaning_zh,strict_sense_candidate:g.strict_sense_candidate,
     source_book_ids:[...g.bookIds].sort(sort),exam_categories:[...g.grades].sort(sort),
     source_kind:[...g.sourceKinds].sort(sort),historical_card_ids:[...g.oldWordIds].sort(sort),
     historical_card_count:g.oldCardCount,occurrences:g.occurrences,
     other_sense_candidates_same_spelling:Math.max(0,(spellings.get(g.headword)?.size||0)-1),
     dictionary_lookup_status:dictionary?.status??'NOT_CHECKED',
     dictionary_candidate_ids:dictionary?.candidates?.map(x=>x.entry_id)??[],
     review_priority:reviewPriority,review_flags:issues,
     approved_sense_id:null,commercially_approved:false,
     cross_book_mastery_merge_allowed:false
   };
 }).sort((a,b)=>b.review_priority-a.review_priority||
   sort(a.headword,b.headword)||sort(a.part_of_speech,b.part_of_speech)||
   sort(a.meaning_zh,b.meaning_zh));
 const exactShared=report.filter(x=>x.strict_sense_candidate&&x.source_book_ids.length>1);
 const polysemous=[...spellings].filter(([,ids])=>ids.size>1).map(([headword,ids])=>({
   headword,strict_sense_candidate_count:ids.size
 })).sort((a,b)=>sort(a.headword,b.headword));
 return {
   status:'PRIVATE_BATCH_CROSSBOOK_SENSE_CANDIDATES_ONLY',
   summary:{
     books:books.length,grades:[...allGrades].sort(sort),
     publisher_exported_books:books.filter(x=>x.source_kind==='verified-publisher-export').length,
     local_postgrad_drafts:books.filter(x=>x.source_kind==='local-unpublished-draft').length,
     annotated_occurrences:books.reduce((v,x)=>v+x.annotated_occurrences,0),
     referenced_historical_cards:books.reduce((v,x)=>v+x.referenced_cards,0),
     distinct_headwords:spellings.size,
     strict_text_sense_candidate_groups:report.filter(x=>x.strict_sense_candidate).length,
     incomplete_sense_identity_candidates:report.filter(x=>!x.strict_sense_candidate).length,
     exact_text_sense_shared_across_books:exactShared.length,
     same_spelling_different_sense_headwords:polysemous.length,
     paragraphs_without_targets:books.reduce((v,x)=>v+x.paragraphs_without_targets,0),
     missing_card_references:books.reduce((v,x)=>v+x.missing_card_references,0),
     cards_missing_ipa:books.reduce((v,x)=>v+x.cards_missing_ipa,0),
     cards_missing_examples:books.reduce((v,x)=>v+x.cards_missing_examples,0),
     context_gloss_mismatches:books.reduce((v,x)=>v+x.context_gloss_mismatches,0),
     unmarked_english_occurrences:unmarkedTotal,
     unmarked_unique_headwords:unmarkedDiscovery.length,
     unmarked_dictionary_lookup_status:unmarkedCounts,
     approved_senses_created:0,user_study_rows_written:0,remote_d1_writes:0
   },
   books:books.sort((a,b)=>sort(a.category,b.category)||sort(a.book_id,b.book_id)),
   shared_exact_sense_candidates:exactShared.map(x=>({
     headword:x.headword,part_of_speech:x.part_of_speech,meaning_zh:x.meaning_zh,
     book_count:x.source_book_ids.length,exam_categories:x.exam_categories,
     approved_sense_id:null,study_merge_permitted:false
   })),
   polysemous_spelling_review:polysemous,
   unmarked_discovery_queue:unmarkedDiscovery,
   review_queue:report,
   release_blocked:true,all_candidates_unapproved:true,
   paid_story_sentences_in_report:false,
   user_data_read:false,cloudflare_accessed:false,
   warning:'Unmarked English may contain ordinary prose or words used in other senses. These are discovery suggestions, NOT automatic chapter anchors or approved commercial wordcards.'
 };
}
