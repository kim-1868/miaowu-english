// V1.2 phase 4: editor-confirmed conversion of UNMARKED V2 English tokens
// into existing V2 {surface,gloss} learning targets. Never writes D1, changes
// user studies, publishes a novel, or authorizes a Publisher sign-off.
import {extractUnmarkedV2EnglishTokens} from './global-dictionary-auto-discovery.js';
import {planHeadwordReaderClicks} from './global-dictionary-headword-click-plan.js';
import {convertDictionaryNovelV2,normalizeDictionaryNovelV2} from './global-dictionary-novel-v2.js';
import {planApprovedNovelSenseAnchors} from './global-dictionary-sense-anchor.js';

const SHA=/^[a-f0-9]{64}$/u;
const ENTRY=/^gdict_[a-f0-9]{24}$/u;
const SENSE=/^gds_[a-f0-9]{24}$/u;
const LIMIT=10000;
const id=x=>`${x.chapter_number}:${x.paragraph_index}:${x.segment_index}:${x.start_offset}`;
const hash=async x=>{
  const data=new TextEncoder().encode(JSON.stringify(x));
  const digest=await crypto.subtle.digest('SHA-256',data);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
};
const plain=(x)=>x&&typeof x==='object'&&!Array.isArray(x);
const owner=source=>source?.package??source;

// Must be run on the trusted review backend, NOT using a client-supplied
// proposals/cards object. It recomputes all approved lesson/sense candidates.
export async function previewUnmarkedEditorTargets(source,index,{lessons=new Map(),senses=[]}={}){
  const manuscript=owner(source);
  const extracted=extractUnmarkedV2EnglishTokens(manuscript);
  const plan=planHeadwordReaderClicks(extracted,index,{lessons,senses});
  const [sourceSha256,planSha256]=await Promise.all([
    hash(manuscript),hash({book_id:plan.book_id,anchors:plan.anchors,cards:plan.cards})
  ]);
  return {
    status:'EDITOR_CONTEXT_SELECTION_REQUIRED',book_id:extracted.book_id,
    source_sha256:sourceSha256,plan_sha256:planSha256,
    total_detected:extracted.tokens.length,
    approved_word_candidates:plan.anchors.length,
    unavailable_or_unreviewed:plan.review_queue.length,
    // No paid full paragraphs are copied into the review event itself.
    anchors:plan.anchors,review_queue:plan.review_queue,
    approved_cards:plan.cards,
    publication_allowed:false,write_count:0
  };
}

// Explicit, human-reviewed context decisions are required for EVERY
// converted token even if there is only one approved card for its lemma.
// This emits a V2 manuscript DRAFT, which must then pass the unchanged
// V2 importer, separate OPS authorization, Publisher review and staging gate.
export async function materializeEditorConfirmedUnmarkedV2(
  source,index,{lessons=new Map(),senses=[]}={},request={}){
  const manuscript=owner(source);
  if(!plain(request)||!SHA.test(request.source_sha256||'')||
      !SHA.test(request.plan_sha256||'')||!Array.isArray(request.decisions)||
      !request.decisions.length||request.decisions.length>LIMIT||
      Object.hasOwn(request,'publisher_approved')||
      Object.hasOwn(request,'production_publish_allowed'))
    throw Error('INVALID_EDITOR_CONTEXT_CONFIRMATION');
  const extracted=extractUnmarkedV2EnglishTokens(manuscript);
  const plan=planHeadwordReaderClicks(extracted,index,{lessons,senses});
  if(await hash(manuscript)!==request.source_sha256||
     await hash({book_id:plan.book_id,anchors:plan.anchors,cards:plan.cards})!==
     request.plan_sha256)throw Error('STALE_NOVEL_OR_APPROVED_DICTIONARY_REVIEW');
  const options=new Map(),byCard=new Map();
  for(const card of plan.cards){
    if(!ENTRY.test(card.entry_id||'')||byCard.has(card.entry_id)||
       !Array.isArray(card.senses)||!card.senses.length)
      throw Error('INVALID_APPROVED_MAIN_CARD');
    byCard.set(card.entry_id,card);
  }
  for(const a of plan.anchors){
    const card=byCard.get(a.entry_id);
    if(!card||options.has(id(a))||!Array.isArray(a.approved_sense_options))
      throw Error('INVALID_APPROVED_ANCHOR_PROPOSAL');
    options.set(id(a),{anchor:a,card});
  }
  const chosen=new Map(),selected=[];
  for(const d of request.decisions){
    if(!plain(d)||d.confirmed!==true||!ENTRY.test(d.entry_id||'')||
       !SENSE.test(d.sense_id||'')||
       !Number.isInteger(d.chapter_number)||!Number.isInteger(d.paragraph_index)||
       !Number.isInteger(d.segment_index)||!Number.isInteger(d.start_offset)||
       Object.hasOwn(d,'approved')||Object.hasOwn(d,'publisher_approved'))
      throw Error('INVALID_EDITOR_CONTEXT_DECISION');
    const key=id(d),match=options.get(key);
    if(chosen.has(key))throw Error('DUPLICATE_EDITOR_CONTEXT_DECISION');
    if(!match||match.anchor.entry_id!==d.entry_id||
      !match.anchor.approved_sense_options.includes(d.sense_id))
      throw Error('UNREVIEWED_OR_CHANGED_CONTEXT_SENSE');
    const sense=match.card.senses.find(s=>s.sense_id===d.sense_id);
    if(!sense||!sense.meaningZh||!sense.pos)throw Error('UNREVIEWED_CONTEXT_SENSE');
    const row={...match.anchor,entry_id:d.entry_id,
      headword:match.card.headword,sense_id:d.sense_id,
      gloss:sense.meaningZh,pos:sense.pos};
    chosen.set(key,row);selected.push(row);
  }
  const perSegment=new Map();
  for(const row of selected){
    const key=`${row.chapter_number}:${row.paragraph_index}:${row.segment_index}`;
    if(!perSegment.has(key))perSegment.set(key,[]);
    perSegment.get(key).push(row);
  }
  const newChapters=manuscript.chapters.map(ch=>({...ch,paragraphs:ch.paragraphs.map((p,pi)=>({
    ...p,segments:p.segments.flatMap((seg,si)=>{
      if(typeof seg.text!=='string')return [{...seg}];
      const key=`${ch.number}:${pi}:${si}`;
      const rows=(perSegment.get(key)||[]).sort((a,b)=>a.start_offset-b.start_offset);
      if(!rows.length)return [{...seg}];
      const out=[];let offset=0;
      for(const r of rows){
        if(r.start_offset<offset||r.end_offset>seg.text.length||
           seg.text.slice(r.start_offset,r.end_offset)!==r.surface)
          throw Error('EDITOR_TOKEN_SPAN_CHANGED');
        if(r.start_offset>offset)out.push({text:seg.text.slice(offset,r.start_offset)});
        out.push({surface:r.surface,gloss:r.gloss});
        offset=r.end_offset;
      }
      if(offset<seg.text.length)out.push({text:seg.text.slice(offset)});
      // Exact original text is retained; this only inserts target boundaries.
      if(out.map(s=>s.text??s.surface).join('')!==seg.text)
        throw Error('EDITOR_SEGMENT_RECONSTRUCTION_DRIFT');
      return out;
    })
  }))}));
  const marked={...manuscript,chapters:newChapters};
  if(marked.words!==undefined)throw Error('V2_WORDS_ARRAY_FORBIDDEN');
  // Original explicitly marked learning targets are untouched; the existing
  // converter checks and preserves them as well as all new editor choices.
  const existingTargets=manuscript.chapters.reduce((total,ch)=>total+
    ch.paragraphs.reduce((n,p)=>n+p.segments.filter(s=>
      typeof s.surface==='string'&&typeof s.gloss==='string').length,0),0);
  normalizeDictionaryNovelV2(marked);
  const converted=convertDictionaryNovelV2(marked,index,lessons);
  if(!converted.ready_to_convert||converted.approved_occurrences!==
     selected.length+existingTargets)throw Error('EDITOR_CONTEXT_V2_CONVERSION_NOT_READY');
  // Require the *same* independently approved sense ID (not just Chinese
  // gloss). This blocks identical Chinese translations across n./v. senses.
  const reviewed=planApprovedNovelSenseAnchors(converted.resolved,{lessons,senses});
  if(!reviewed.ready_for_sense_study||reviewed.reviewed_anchor_candidates.length!==
     selected.length+existingTargets)throw Error('EDITOR_CONTEXT_STABLE_SENSE_REVIEW_REQUIRED');
  for(const r of reviewed.reviewed_anchor_candidates){
    const found=selected.find(s=>s.chapter_number===r.chapter_number&&
      s.paragraph_index===r.paragraph_index&&
      // Segment offsets shift after the split, so compare against
      // the generated V2 learning segment's immutable exact location.
      s.entry_id===r.entry_id&&s.sense_id===r.sense_id&&s.gloss===r.meaning_zh);
    if(!found)throw Error('EDITOR_CONTEXT_SENSE_ID_DRIFT');
  }
  return {status:'EDITOR_CONFIRMED_V2_DRAFT_NOT_PUBLISHED',
    book_id:manuscript.book.id,source_sha256:request.source_sha256,
    selected_occurrences:selected.length,
    still_unmarked:extracted.tokens.length-selected.length,
    // Stable IDs are retained for the separately authorized attach workflow.
    selected_senses:selected.map(s=>({
      entry_id:s.entry_id,sense_id:s.sense_id,
      chapter_number:s.chapter_number,
      paragraph_index:s.paragraph_index,
      source_segment_index:s.segment_index,start_offset:s.start_offset
    })),
    marked_v2_package:marked,verified_v1_package:converted.converted_package,
    publication_allowed:false,ready_for_staging_editorial_preflight:true,
    publisher_approved:false,d1_writes:0,user_study_changes:0};
}