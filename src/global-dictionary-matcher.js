// Cross-exam global dictionary matcher: pure, read-only and conservative.
// Important: a "matched" lemma is NOT a human-approved lesson unless its
// source dictionary entry explicitly marks teaching_ready=true.
// This module does not mutate manuscripts, existing word IDs, or user history.
const ENGLISH=/^[a-z]+(?:['-][a-z]+)*$/u;
const TOKENS=/[a-z]+(?:['’][a-z]+)*(?:-[a-z]+)*/giu;
const MAX_GROUPS=2000;
const MAX_OCCURRENCES=20000;
const normalize=value=>typeof value==='string'
  ?value.normalize('NFKC').trim().replaceAll('’',"'").toLocaleLowerCase('en-US')
  :'';
const valid=v=>ENGLISH.test(v);
export function normalizedLemma(value){
  const v=normalize(value);
  return valid(v)?v:null;
}
const stable=(a,b)=>a.localeCompare(b,'en');
const rows=x=>Array.isArray(x)?x:[];
const safeId=v=>typeof v==='string'&&/^[a-z0-9_-]{1,100}$/i.test(v);

export function buildGlobalDictionaryIndex({entries=[],forms=[]}={}){
  if(!Array.isArray(entries)||!Array.isArray(forms))throw Error('INVALID_DICTIONARY_ROWS');
  const byWord=new Map(),byForm=new Map(),entryIds=new Set();
  for(const row of entries){
    const key=normalizedLemma(row.headword);
    const id=row.entry_id??row.id;
    if(!key||!safeId(id))throw Error('INVALID_DICTIONARY_ENTRY');
    if(entryIds.has(id))throw Error('DUPLICATE_DICTIONARY_ID_'+id);
    entryIds.add(id);
    const entry={entry_id:id,headword:key,
      teaching_ready:row.teaching_ready===true,
      source:typeof row.source==='string'?row.source:null};
    if(!byWord.has(key))byWord.set(key,[]);
    byWord.get(key).push(entry);
  }
  for(const row of forms){
    const form=normalizedLemma(row.form),headword=normalizedLemma(row.headword);
    if(!form||!headword||!byWord.has(headword))
      throw Error('UNRESOLVED_INFLECTION_LEMMA');
    if(form===headword)continue;
    if(!byForm.has(form))byForm.set(form,[]);
    const verified=row.reviewed===true||row.verified===true;
    const prior=byForm.get(form).find(x=>x.headword===headword);
    if(prior)prior.reviewed&&=verified;
    else byForm.get(form).push({headword,reviewed:verified});
  }
  return {byWord,byForm,headwordCount:byWord.size,entryCount:entryIds.size,
    formCount:byForm.size};
}

export function matchDictionaryWord(surface,index){
  const key=normalizedLemma(surface);
  if(!key)return {status:'missing',reason:'NOT_A_SINGLE_ENGLISH_WORD',candidates:[]};
  const exact=index.byWord.get(key)||[];
  const forms=index.byForm.get(key)||[];
  const candidates=new Map();
  for(const entry of exact)candidates.set(entry.entry_id,{...entry,evidence:'exact',form_reviewed:true});
  for(const form of forms){
    for(const entry of index.byWord.get(form.headword)||[]){
      const prev=candidates.get(entry.entry_id);
      if(prev){prev.form_reviewed&&=form.reviewed;prev.evidence='exact_or_form';}
      else candidates.set(entry.entry_id,{...entry,
        evidence:'inflection',form_reviewed:form.reviewed});
    }
  }
  const options=[...candidates.values()].sort((a,b)=>
    stable(a.headword,b.headword)||stable(a.entry_id,b.entry_id));
  const simple=options.map(x=>({entry_id:x.entry_id,headword:x.headword,
    teaching_ready:x.teaching_ready,evidence:x.evidence,
    form_reviewed:x.form_reviewed}));
  if(!options.length)
    return {status:'missing',reason:'DICTIONARY_HEADWORD_NOT_FOUND',candidates:[]};
  if(options.length>1)
    return {status:'needs_review',reason:'AMBIGUOUS_HEADWORD_OR_INFLECTION',
      candidates:simple};
  const only=options[0];
  if(!only.form_reviewed)
    return {status:'needs_review',reason:'INFLECTION_NOT_VERIFIED',
      candidates:simple};
  return {status:only.teaching_ready?'matched':'dictionary_only',
    reason:only.teaching_ready?'UNIQUE_VERIFIED_DICTIONARY_MATCH':
      'TEACHING_CARD_NEEDS_REVIEW',
    entry_id:only.entry_id,headword:only.headword,
    matched_by:only.evidence,candidates:simple};
}

export function preflightNovelDictionaryMatches(packageData,index){
  const input=packageData?.package??packageData;
  if(!input||typeof input!=='object'||Array.isArray(input)||
      !input.book||!Array.isArray(input.chapters)||!input.chapters.length||
      input.chapters.length>60)throw Error('INVALID_NOVEL_PACKAGE');
  const category=input.book.category;
  if(typeof category!=='string'||!/^[a-z][a-z0-9-]{2,29}$/.test(category))
    throw Error('INVALID_NOVEL_CATEGORY');
  const target=new Map(),observed=new Map();
  let occurrenceCount=0,explicitCount=0,discoveryCount=0;
  const aggregate=(source,raw,chapter,context,oldWordId)=>{
    const word=normalizedLemma(raw);
    if(!word)return;
    occurrenceCount++;
    if(occurrenceCount>MAX_OCCURRENCES)throw Error('MATCH_SCAN_LIMIT_EXCEEDED');
    const groups=source==='target'?target:observed;
    if(!groups.has(word)){
      if(target.size+observed.size>=MAX_GROUPS)throw Error('MATCH_UNIQUE_LIMIT_EXCEEDED');
      groups.set(word,{surface:raw,normalized_surface:word,
        occurrences:0,chapters:new Set(),examples:[],legacy_word_ids:new Set()});
    }
    const g=groups.get(word);
    g.occurrences++;
    g.chapters.add(chapter);
    if(safeId(oldWordId))g.legacy_word_ids.add(oldWordId);
    if(g.examples.length<2&&typeof context==='string')
      g.examples.push(context.slice(0,220));
    if(source==='target')explicitCount++;else discoveryCount++;
  };
  const chapterNumbers=new Set();
  for(const chapter of input.chapters){
    if(!chapter||!Number.isInteger(chapter.number)||
        chapter.number<1||chapter.number>500||
        chapterNumbers.has(chapter.number)||
        !Array.isArray(chapter.paragraphs)||chapter.paragraphs.length>150)
      throw Error('INVALID_NOVEL_CHAPTER');
    chapterNumbers.add(chapter.number);
    for(const paragraph of chapter.paragraphs){
      if(!paragraph||!Array.isArray(paragraph.segments)||paragraph.segments.length>150)
        throw Error('INVALID_NOVEL_PARAGRAPH');
      const context=paragraph.segments.map(seg=>typeof seg?.text==='string'
        ?seg.text:typeof seg?.surface==='string'?seg.surface:'').join('').slice(0,300);
      for(const seg of paragraph.segments){
        if(!seg||typeof seg!=='object')throw Error('INVALID_NOVEL_SEGMENT');
        if(typeof seg.wordId==='string'&&typeof seg.surface==='string'){
          aggregate('target',seg.surface,chapter.number,context,seg.wordId);
        }else if(typeof seg.text==='string'){
          // These are observations, not automatic learning targets.
          // Exclude obvious web URLs and email addresses from token scanning.
          const stripped=seg.text.replace(/https?:\/\/\S+|[\w.-]+@[\w.-]+\.\w+/giu,' ');
          for(const match of stripped.matchAll(TOKENS))
            aggregate('observed',match[0],chapter.number,context,null);
        }else throw Error('INVALID_NOVEL_SEGMENT');
      }
    }
  }
  const categorize=groups=>{
    const out=[];
    for(const g of groups.values()){
      const verdict=matchDictionaryWord(g.normalized_surface,index);
      out.push({...verdict,surface:g.surface,
        normalized_surface:g.normalized_surface,
        occurrences:g.occurrences,
        chapters:[...g.chapters].sort((a,b)=>a-b),
        examples:g.examples,legacy_word_ids:[...g.legacy_word_ids].sort(stable)});
    }
    return out.sort((a,b)=>stable(a.normalized_surface,b.normalized_surface));
  };
  const targeted=categorize(target),discovered=categorize(observed);
  const counts=xs=>Object.fromEntries(['matched','dictionary_only','needs_review','missing']
    .map(s=>[s,xs.filter(x=>x.status===s).length]));
  return {
    status:'READ_ONLY_PREFLIGHT_NOT_IMPORTED',
    book_id:typeof input.book.id==='string'?input.book.id:null,category,
    dictionary_headwords:index.headwordCount,
    dictionary_entries:index.entryCount,
    summary:{
      target_unique:targeted.length,target_occurrences:explicitCount,
      target:counts(targeted),discovered_unique:discovered.length,
      discovered_occurrences:discoveryCount,discovered:counts(discovered)
    },
    targets:targeted,discovered,
    release_blocked:targeted.some(x=>x.status!=='matched'),
    warning:'Unannotated English tokens are suggestions only; no changes were made to the manuscript, D1, user_words, review_events, orders or publication status.'
  };
}
