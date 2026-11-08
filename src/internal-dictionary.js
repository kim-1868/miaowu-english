// V1.1 internal dictionary. It exists solely as a last-resort explanation
// for words in an authorized example sentence; it is NOT a learning word card.
// Missing table is tolerated while testing staged migrations.
const sql=(db,q,...args)=>db.prepare(q).bind(...args);
const normal=s=>String(s||"").normalize("NFKC").toLocaleLowerCase("en-US").trim();
export function isExampleToken(example,token){
 if(typeof example!=="string"||example.length>3000)return false;
 const clean=normal(token);
 if(!/^[a-z](?:[a-z'-]{0,30}[a-z])?$/.test(clean))return false;
 return (example.match(/[a-z]+(?:['-][a-z]+)*/gi)||[]).some(w=>normal(w)===clean);
}
export async function getAuthorizedExample(env,userId,originWordId){
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(originWordId||""))return null;
 const source=await sql(env.DB,
  "SELECT w.id,w.example_en FROM words w WHERE w.id=? "+
  "AND w.example_en IS NOT NULL AND EXISTS ("+
  "SELECT 1 FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id "+
  "JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id "+
  "WHERE cw.word_id=w.id AND b.status='published' AND c.is_visible=1 "+
  "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
  "AND (ch.is_preview=1 OR EXISTS ("+
  "SELECT 1 FROM entitlements e WHERE e.user_id=? AND e.category_id=b.category_id "+
  "AND e.revoked_at IS NULL AND NOT EXISTS("+
  "SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status='revoked'))))",
  originWordId,userId).first();
 return source||null;
}
export async function internalDictionaryLookup(env,{word,originWordId,userId}){
 const example=await getAuthorizedExample(env,userId,originWordId);
 // Caller-supplied word is never trusted on its own: membership in a
 // legitimately readable example is a mandatory requirement.
 if(!example||!isExampleToken(example.example_en,word))return null;
 try{
  const row=await sql(env.DB,
   "SELECT word,phonetic,pos,translation_zh,source FROM supplemental_dictionary "+
   "WHERE word=? COLLATE NOCASE LIMIT 1",word).first();
  if(!row||!row.translation_zh)return null;
  return {headword:row.word,phonetic:row.phonetic||"",partOfSpeech:row.pos||"",
   meaning:row.translation_zh,source:row.source,referenceOnly:true};
 }catch{
  // A missing supplemental table or unseeded item must not break published cards.
  return null;
 }
}
