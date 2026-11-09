// Editorial audit for *draft* smart word cards.
// Structural lint does not replace bilingual meaning / naturalness human review.
// Never set reviewed=1 in code as a side effect of passing lint.
const ALLOWED_LEVELS=new Set(['cet4','cet6','postgrad','ielts']);
const SOURCES=new Set(['COCA','BNC','POSTGRAD_EXAM','UNRANKED']);
const string=v=>typeof v==='string'?v.trim():'';
const cjk=/[\u3400-\u9fff]/u;
const placeholder=/\b(?:todo|tbd|lorem ipsum|placeholder|example here|translation here)\b|待补充|暂无|例句待|示例待|\[\[|\]\]/iu;
const technical=/\[(?:计|经|法|医|化|数|工|生|物|机|电|航|网|办|建|汽|农|地|天|语|体|音|摄)\]/u;
const supportedPOS=/^(?:(?:n|v|vt|vi|adj|adv|prep|pron|conj|art|num|interj|aux|phr|abbr)\.?|n\.?\/v\.?|v\.?\/n\.?)$/i;
const sentenceWords=s=>(s.match(/[a-z]+(?:'[a-z]+)?/gi)||[]).length;

export function auditSmartWordCard(card={}){
  const errors=[],warnings=[];
  const put=(code)=>errors.push(code);
  const word=string(card.headword),meaning=string(card.meaning_zh);
  const phonetic=string(card.phonetic_us)||string(card.phonetic_uk);
  const pos=string(card.part_of_speech);
  const example=string(card.example_en),translation=string(card.example_zh);
  const rank=card.frequency_rank;
  const source=string(card.frequency_source).toUpperCase();
  if(!/^(?:[a-z][a-z\s'-]{0,64}|(?:[a-z]\.){2,5})$/i.test(word))put('INVALID_HEADWORD');
  if(!/^[a-z0-9_-]{1,80}$/i.test(string(card.word_id)))put('INVALID_WORD_ID');
  if(!ALLOWED_LEVELS.has(string(card.category_slug)))put('INVALID_EXAM_LEVEL');
  if(!SOURCES.has(source))put('INVALID_FREQUENCY_SOURCE');
  if(source==='UNRANKED'){
    if(rank!==null&&rank!==undefined&&rank!=='')put('UNRANKED_MUST_NOT_HAVE_FREQUENCY');
    if(card.frequency_available===true||card.frequency_available===1)
      put('UNRANKED_MUST_NOT_BE_VERIFIED');
  }else{
    if(!Number.isSafeInteger(rank)||rank<=0)put('INVALID_FREQUENCY_RANK');
    if(card.frequency_available===false||card.frequency_available===0)
      put('UNVERIFIED_FREQUENCY');
  }
  if(source==='POSTGRAD_EXAM'&&
    card.frequency_available!==true&&card.frequency_available!==1)
    put('UNVERIFIED_EXAM_FREQUENCY');
  if(!pos||!supportedPOS.test(pos))put('POS_NEEDS_REVIEW');
  if(!meaning||!cjk.test(meaning))put('MISSING_CHINESE_MEANING');
  if(meaning.length>120)put('OVERLONG_MEANING');
  if(technical.test(meaning)||placeholder.test(meaning))put('DICTIONARY_ARTIFACT');
  if(!phonetic||/^(?:[-–—/?.]+|unknown|n\/a)$/i.test(phonetic)||
    phonetic.length>90)put('PHONETIC_NEEDS_REVIEW');
  // Normalized /IPA/ or [IPA] is strongly preferred. ECDICT ASCII
  // transcriptions without delimiters require a phonetics check.
  else if(!/^\/.+\/$/.test(phonetic)&&!/^\[.+\]$/.test(phonetic))
    warnings.push('IPA_FORMAT_REVIEW');
  if(sentenceWords(example)<3||sentenceWords(example)>35||placeholder.test(example)||
    /<[^>]+>|https?:\/\//i.test(example))put('ENGLISH_EXAMPLE_NEEDS_REWRITE');
  if(!cjk.test(translation)||translation.length<3||translation.length>160||
    placeholder.test(translation))put('EXAMPLE_TRANSLATION_NEEDS_REVIEW');
  if(example&&!/[.!?]$/.test(example))warnings.push('ENGLISH_SENTENCE_PUNCTUATION');
  // English inflection and irregular verbs may not match the headword
  // literally; this is an editorial reminder, not an automatic rejection.
  const needle=word.toLowerCase();
  if(needle&&!example.toLowerCase().includes(needle))
    warnings.push('EXAMPLE_TARGET_FORM_REVIEW');
  if(string(card.meaning_zh).includes('；'))
    warnings.push('MULTIPLE_SENSES_REVIEW');
  // Collocations are OPTIONAL. Show only genuinely curated pairs, never an
  // empty placeholder row. Invalid supplied pairs are publication blockers.
  if(card.collocations!==undefined&&card.collocations!==null){
    if(!Array.isArray(card.collocations)||card.collocations.length>5)
      put('COLLOCATION_FORMAT_NEEDS_REVIEW');
    else{
      const used=new Set();
      for(const entry of card.collocations){
        const en=string(entry?.en),zh=string(entry?.zh);
        if(en.length<3||en.length>100||!/\p{Letter}/u.test(en)||
          !cjk.test(zh)||zh.length>75||placeholder.test(en)||placeholder.test(zh))
          put('COLLOCATION_NEEDS_REVIEW');
        const token=en.toLocaleLowerCase('en-US');
        if(used.has(token))warnings.push('DUPLICATE_COLLOCATION_REVIEW');
        used.add(token);
      }
    }
  }
  return {
    word_id:string(card.word_id),headword:word,
    category_slug:string(card.category_slug),
    errors:[...new Set(errors)],warnings:[...new Set(warnings)],
    structurallyReady:errors.length===0,
    // Passing the lint NEVER flips or substitutes manual review.
    commerciallyApproved:errors.length===0&&card.reviewed===true
  };
}

export function summarizeSmartCardAudit(cards=[]){
  const results=cards.map(c=>auditSmartWordCard(c));
  const counts=(type)=>{
    const map=new Map();
    for(const row of results)for(const code of row[type]||[]){
      map.set(code,(map.get(code)||0)+1);
    }
    return Object.fromEntries([...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])));
  };
  return {
    total:results.length,
    structurallyReady:results.filter(r=>r.structurallyReady).length,
    commerciallyApproved:results.filter(r=>r.commerciallyApproved).length,
    errors:counts('errors'),warnings:counts('warnings'),
    results
  };
}
