// V1.1: approved, access-scoped dictionary lookup for example words.
// Never returns paid chapter context or any word outside a published authorized chapter.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 "content-type":"application/json; charset=utf-8",
 "cache-control":"private, no-store","x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer"
}});
export async function handleExampleWordLookup(request,env,user){
 if(request.method!=="GET")return json({error:"METHOD_NOT_ALLOWED"},405);
 const token=new URL(request.url).searchParams.get("word");
 if(typeof token!=="string"||token.length>60)return json({error:"INVALID_WORD"},400);
 const word=token.normalize("NFKC").trim().toLowerCase();
 if(!/^[a-z](?:[a-z'-]{0,30}[a-z])?$/.test(word))return json({error:"INVALID_WORD"},400);
 const uid=user?.id||null;
 const data=await env.DB.prepare(
  "SELECT w.id AS word_id,w.headword,w.phonetic_uk,w.phonetic_us,w.part_of_speech,w.meaning_zh,"+
  "uw.bookmarked AS bookmarked,uw.status AS status FROM words w "+
  "LEFT JOIN user_words uw ON uw.word_id=w.id AND uw.user_id=? "+
  "WHERE w.headword=? COLLATE NOCASE AND EXISTS ("+
  "SELECT 1 FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id "+
  "JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id "+
  "WHERE cw.word_id=w.id AND b.status='published' AND c.is_visible=1 "+
  "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
  "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e "+
  "WHERE e.user_id=? AND e.category_id=b.category_id AND e.revoked_at IS NULL "+
  "AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status='revoked')))) "+
  "ORDER BY w.part_of_speech,w.id LIMIT 6"
 ).bind(uid,word,uid).all();
 return json({word,entries:(data.results||[]).map(x=>({
  wordId:x.word_id,headword:x.headword,phonetic:x.phonetic_us||x.phonetic_uk||"",
  partOfSpeech:x.part_of_speech||"",meaning:x.meaning_zh||"",
  bookmarked:Boolean(x.bookmarked),status:x.status||null
 }))});
}
