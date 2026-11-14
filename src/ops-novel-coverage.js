import {coverageWordlists,coverageWordlistVersion} from "./novel-coverage-wordlists.js";

const normalize=value=>String(value??"").trim().toLowerCase().replace(/\s+/g," ");
const sorted=values=>[...values].sort();
const percentage=(numerator,denominator)=>denominator?
 Math.round(10000*numerator/denominator)/100:null;

export async function reviewNovelCoverage(db,{book,chapters,words}){
 const category=await db.prepare("SELECT id FROM categories WHERE slug=?").bind(book.category).first();
 if(!category)return null;
 const targets=Object.hasOwn(coverageWordlists,book.category)?coverageWordlists[book.category]:null;
 const {results}=await db.prepare(`
  SELECT DISTINCT w.headword,b.id=? AS is_replaced
  FROM books b
  JOIN categories c ON c.id=b.category_id
  JOIN chapters ch ON ch.book_id=b.id
  JOIN chapter_words cw ON cw.chapter_id=ch.id
  JOIN words w ON w.id=cw.word_id
  JOIN json_each(CASE WHEN json_valid(ch.content_json) THEN ch.content_json ELSE '{}' END,'$.paragraphs') p
  JOIN json_each(p.value,'$.segments') s
  WHERE b.category_id=? AND c.is_visible=1 AND b.status='published'
    AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP
    AND cw.context_anchor='p'||p.key||':s'||s.key
    AND json_extract(s.value,'$.wordId')=w.id
    AND trim(coalesce(w.meaning_zh,''))<>'' AND trim(coalesce(w.part_of_speech,''))<>''
 `).bind(book.id,category.id).all();
 const inScope=head=>head&&(!targets||targets.has(head));
 const current=new Set(), otherBooks=new Set();
 for(const row of results){
  const head=normalize(row.headword);
  if(!inScope(head))continue;
  current.add(head);
  if(!row.is_replaced)otherBooks.add(head);
 }
 const cards=new Map(words.map(word=>[word.id,word]));
 const counts=new Map(), outside=new Set();
 let mentions=0, incompleteMentions=0;
 for(const chapter of chapters)for(const paragraph of chapter.paragraphs)for(const segment of paragraph.segments){
  if(!segment.wordId)continue;
  const card=cards.get(segment.wordId);
  const head=normalize(card?.headword);
  if(!head||!card?.partOfSpeech?.trim()||!card.meaningZh?.trim()){
   incompleteMentions++;
   continue;
  }
  if(!inScope(head)){
   outside.add(head);
   continue;
  }
  mentions++;
  counts.set(head,(counts.get(head)||0)+1);
 }
 const overlapWords=sorted([...counts.keys()].filter(head=>otherBooks.has(head)));
 const addedWords=sorted([...counts.keys()].filter(head=>!current.has(head)));
 const lostWords=sorted([...current].filter(head=>!otherBooks.has(head)&&!counts.has(head)));
 const projected=new Set([...otherBooks,...counts.keys()]);
 const total=targets?.size??null;
 return {
  category:book.category,wordlistVersion:targets?coverageWordlistVersion:null,total,
  checkedAt:new Date().toISOString(),currentCovered:current.size,projectedCovered:projected.size,
  currentCoverageRate:percentage(current.size,total),projectedCoverageRate:percentage(projected.size,total),
  remaining:targets?total-projected.size:null,bookHeadwords:counts.size,mentions,
  crossBookRate:percentage(overlapWords.length,counts.size),
  withinBookRate:percentage(mentions-counts.size,mentions),netGain:addedWords.length-lostWords.length,
  addedWords,lostWords,overlapWords,incompleteMentions,outsideWords:sorted(outside),
  repeatedWords:[...counts].filter(([,count])=>count>1).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])),
  missingWords:targets?sorted([...targets].filter(head=>!projected.has(head))):null
 };
}
