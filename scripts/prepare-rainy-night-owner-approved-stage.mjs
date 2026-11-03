// Owner-approved UNCHANGED editorial candidate -> guarded D1 draft data update.
// This never publishes a book or approves it in OPS. The existing operator
// must still explicitly review and confirm via the standard OPS API.
// The owner stated on Nov 3 2026 that the 12-chapter and IPA candidate
// requires no textual changes. Never claim an external independent review.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {prepareRainyNightMemberCandidate} from "./prepare-rainy-night-member-candidate.mjs";
import {buildRainyNightFullDensityReviewDraft} from "./assemble-rainy-night-high-density-review-draft.mjs";
import {pronunciationDraft} from "./prepare-rainy-night-ipa-ai-working-copy.mjs";
const BOOK="rainy-night-archives-cet4-v1";
const requiredOwnerApproval="unchanged-2026-11-03";
const sql=v=>"'"+String(v).replaceAll("'","''")+"'";
const sha=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const content=ch=>JSON.stringify({version:1,paragraphs:ch.paragraphs.map(p=>({
 segments:p.segments.map(s=>s.wordId?{wordId:s.wordId,surface:s.surface,gloss:s.gloss}:{text:s.text})
}))});
function extract(file){
 const raw=JSON.parse(readFileSync(resolve(file),"utf8"));
 const blocks=Array.isArray(raw)?raw:[raw];
 return blocks.flatMap(x=>x.results||[]);
}
function britishIPA(word){
 const v=spawnSync("espeak",["-q","--ipa","-v","en-gb",word],
  {encoding:"utf8",maxBuffer:5000,timeout:5000});
 if(v.error||v.status!==0)throw Error("ESPEAK_NOT_AVAILABLE_"+word);
 const s=v.stdout.trim().replace(/[\u200c\u200d]/g,"").replace(/\s+/g,"");
 if(s.length<2||s.length>85)throw Error("BAD_IPA_DRAFT_"+word);
 return "/"+s+"/";
}
export function prepareDraftUpdate({productionBooks,productionChapters,productionWords,productionCounts,pronunciations}){
 if(process.env.RAINY_NIGHT_OWNER_APPROVAL!==requiredOwnerApproval)
  throw Error("EXPLICIT_OWNER_APPROVAL_REQUIRED");
 const {candidate:old}=prepareRainyNightMemberCandidate();
 const {draft,report}=buildRainyNightFullDensityReviewDraft();
 if(report.proposalAnchors!==1892||report.paragraphsBelowThree!==0||
   draft.words.length!==188||draft.chapters.length!==12||draft.chapters.some(ch=>ch.preview))
  throw Error("PROPOSED_REVIEW_CANDIDATE_CHANGED");
 if(productionBooks.length!==1||productionBooks[0].id!==BOOK||
  productionBooks[0].status!=="draft"||productionBooks[0].category_id!=="cet4")
  throw Error("D1_BOOK_NOT_EXACTLY_CET4_DRAFT");
 if(productionChapters.length!==12)throw Error("D1_CHAPTER_COUNT_CHANGED");
 if(productionWords.length!==188||productionCounts.length!==1)throw Error("D1_WORD_OR_COUNTS_CHANGED");
 const metrics=productionCounts[0];
 if(Number(metrics.anchors)!==733||Number(metrics.preview_chapters)!==0||
  Number(metrics.published_chapters)!==0||Number(metrics.approvals)!==0)
  throw Error("D1_NOT_ORIGINAL_733_UNPUBLISHED_UNAPPROVED");
 const byChapter=new Map(productionChapters.map(r=>[r.id,r]));
 if(byChapter.size!==12)throw Error("D1_CHAPTER_IDS_NOT_UNIQUE");
 for(const ch of old.chapters){
  const live=byChapter.get(ch.id);
  if(!live||live.chapter_no!==ch.number||live.title!==ch.title||
    Number(live.is_preview)!==0||live.published_at!==null||
    sha(JSON.parse(live.content_json))!==sha(JSON.parse(content(ch))))
   throw Error("D1_ORIGINAL_CHAPTER_DIFFERS_"+ch.id);
 }
 const byWord=new Map(productionWords.map(w=>[w.id,w]));
 if(byWord.size!==188||!Array.isArray(pronunciations?.rows)||
    pronunciations.rows.length!==188||pronunciations.humanApproved!==false)
  throw Error("D1_OR_PRONUNCIATION_INVENTORY_CHANGED");
 const ipaMap=new Map(pronunciations.rows.map(w=>[w.wordId,w]));
 if(ipaMap.size!==188)throw Error("IPA_DUPLICATE_WORD_ID");
 for(const w of old.words){
  const dbWord=byWord.get(w.id),ph=ipaMap.get(w.id);
  if(!dbWord||dbWord.headword!==w.headword||dbWord.part_of_speech!==w.partOfSpeech||
    dbWord.meaning_zh!==w.meaningZh||dbWord.example_en!==w.exampleEn||
    dbWord.example_zh!==w.exampleZh||
    (dbWord.phonetic_uk&&dbWord.phonetic_uk.trim())||
    (dbWord.phonetic_us&&dbWord.phonetic_us.trim())||
    !ph||ph.headword!==w.headword||ph.meaningZh!==w.meaningZh)
   throw Error("D1_WORD_METADATA_DIFFERS_"+w.id);
  for(const x of [ph.britishSuggested,ph.americanSuggested])
   if(typeof x!=="string"||!/^\/[^\/\r\n<>]{2,100}\/$/.test(x))
    throw Error("D1_IPA_INVALID_"+w.id);
 }
 const statements=[];
 // Fail closed against live changes between the read-only check and import;
 // a duplicate PK aborts the D1 SQL batch. Wrangler SQL import rolls back on error.
 statements.push("INSERT INTO books(id,category_id,title) "+
  "SELECT "+[sql(BOOK),sql("cet4"),sql("PRECONDITION_SHOULD_FAIL")].join(",")+
  " WHERE NOT EXISTS(SELECT 1 FROM books WHERE id="+sql(BOOK)+" AND status='draft' AND category_id='cet4') "+
  " OR (SELECT COUNT(*) FROM chapters WHERE book_id="+sql(BOOK)+")<>12"+
  " OR (SELECT COUNT(*) FROM chapter_words WHERE chapter_id IN"+
  " (SELECT id FROM chapters WHERE book_id="+sql(BOOK)+"))<>733"+
  " OR EXISTS(SELECT 1 FROM chapters WHERE book_id="+sql(BOOK)+
  " AND (is_preview<>0 OR published_at IS NOT NULL));");
 // Content CAS: NEVER silently clobber an independently revised chapter.
 for(const ch of draft.chapters){
  const original=old.chapters.find(c=>c.id===ch.id);
  statements.push("UPDATE chapters SET content_json="+sql(content(ch))+
   " WHERE id="+sql(ch.id)+" AND book_id="+sql(BOOK)+
   " AND content_json="+sql(content(original))+
   " AND published_at IS NULL AND is_preview=0"+
   " AND EXISTS(SELECT 1 FROM books WHERE id="+sql(BOOK)+" AND status='draft');");
 }
 // Ensure every chapter CAS succeeded before rebuilding word anchors.
 statements.push("INSERT INTO books(id,category_id,title) "+
  "SELECT "+[sql(BOOK),sql("cet4"),sql("POST_CAS_SHOULD_FAIL")].join(",")+
  " WHERE EXISTS(SELECT 1 FROM chapters WHERE book_id="+sql(BOOK)+
  " AND content_json NOT IN ("+draft.chapters.map(c=>sql(content(c))).join(",")+
  "));");
 statements.push("DELETE FROM chapter_words WHERE chapter_id IN "+
  "(SELECT id FROM chapters WHERE book_id="+sql(BOOK)+");");
 const rows=[];
 for(const ch of draft.chapters){
  for(const [pi,p] of ch.paragraphs.entries()){
   const sentence=p.segments.map(s=>s.wordId?s.surface:s.text).join("");
   for(const [si,s] of p.segments.entries()){
    if(!s.wordId)continue;
    rows.push("("+[ch.id,s.wordId,sentence,"p"+pi+":s"+si].map(sql).join(",")+")");
   }
  }
 }
 if(rows.length!==1892)throw Error("TARGET_ANCHOR_COUNT_DRIFT");
 for(let k=0;k<rows.length;k+=200)
  statements.push("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES\n"+
    rows.slice(k,k+200).join(",\n")+";");
 for(const w of old.words){
  const p=ipaMap.get(w.id);
  statements.push("UPDATE words SET phonetic_uk="+sql(p.britishSuggested)+
   ",phonetic_us="+sql(p.americanSuggested)+" WHERE id="+sql(w.id)+
   " AND COALESCE(TRIM(phonetic_uk),'')='' AND COALESCE(TRIM(phonetic_us),'')='';");
 }
 statements.push("INSERT INTO books(id,category_id,title) "+
  "SELECT "+[sql(BOOK),sql("cet4"),sql("POST_IMPORT_SHOULD_FAIL")].join(",")+
  " WHERE (SELECT COUNT(*) FROM chapter_words WHERE chapter_id IN "+
  "(SELECT id FROM chapters WHERE book_id="+sql(BOOK)+"))<>1892"+
  " OR EXISTS(SELECT 1 FROM words w WHERE w.id IN"+
  " (SELECT DISTINCT cw.word_id FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id WHERE ch.book_id="+sql(BOOK)+")"+
  " AND (COALESCE(TRIM(w.phonetic_uk),'')='' OR COALESCE(TRIM(w.phonetic_us),'')=''));");
 const sqlText=statements.join("\n")+"\n";
 if(/\bUPDATE\s+(?:users|entitlements|activation_codes|reading_progress|review_events|user_words)\b/i.test(sqlText)||
   /\bUPDATE\s+books\b/i.test(sqlText)||/\bstatus\s*=\s*'published'/i.test(sqlText))
  throw Error("SQL_SAFETY_ASSERTION_FAILED");
 return {sql:sqlText,summary:{bookId:BOOK,sourceAnchors:733,targetAnchors:1892,
  reviewAuthority:"OWNER_CONFIRMED_UNCHANGED_IN_CHAT_NOT_INDEPENDENT_CERTIFICATION",
  targetIPA:188,chapters:12,statementCount:statements.length,
  changes:["chapters.content_json","chapter_words","words.phonetic_uk","words.phonetic_us"],
  doesNotPublish:true}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [bookPath,chapterPath,wordPath,countPath]=process.argv.slice(2);
  if(!bookPath||!chapterPath||!wordPath||!countPath)
   throw Error("USAGE: node scripts/prepare-rainy-night-owner-approved-stage.mjs <books.json> <chapters.json> <words.json> <counts.json>");
  const output=prepareDraftUpdate({productionBooks:extract(bookPath),
   productionChapters:extract(chapterPath),productionWords:extract(wordPath),
   productionCounts:extract(countPath),pronunciations:pronunciationDraft({britishRead:britishIPA})});
  mkdirSync(resolve("private-output"),{recursive:true,mode:0o700});
  writeFileSync(resolve("private-output/rainy-night-owner-approved-draft-stage.sql"),
   output.sql,{mode:0o600,flag:"wx"});
  console.log("RAINY_NIGHT_OWNER_APPROVED_STAGE_PREFLIGHT "+JSON.stringify(output.summary));
 }catch(e){console.error(String(e.message||e));process.exitCode=1}
}
