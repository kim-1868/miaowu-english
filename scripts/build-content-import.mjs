// S3-A editor package -> escaped, repeat-safe D1 SQL. Never commit private-output/.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const ID = /^[a-z][a-z0-9_-]{2,79}$/;
const CATEGORIES = new Set(["cet4", "cet6", "postgrad", "ielts"]);
const fail = message => { throw new Error("Content validation: " + message); };
function string(value, where, min = 1, max = 4000) {
  if (typeof value !== "string" || value.trim().length < min || value.length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(where + " must be valid text (" + min + "-" + max + ")");
  return value;
}
function optional(value, where, max = 4000) {
  return value == null || value === "" ? null : string(value, where, 1, max);
}
function id(value, where) {
  if (typeof value !== "string" || !ID.test(value)) fail(where + " must match " + ID);
  return value;
}
function array(value, where, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(where + " must contain " + min + "-" + max + " items");
  return value;
}
function safeSql(value) {
  if (value == null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("SQL number is not a safe integer");
    return String(value);
  }
  return "'" + String(value).replace(/'/g, "''") + "'";
}
function insert(table, columns, values) {
  return "INSERT OR IGNORE INTO " + table + "(" + columns.join(",") + ") VALUES(" +
    values.map(safeSql).join(",") + ");";
}
export function validatePackage(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || input.version !== 1) fail("version must be 1");
  if (!input.book || typeof input.book !== "object") fail("book is required");
  const book=input.book;
  id(book.id,"book.id");
  string(book.title,"book.title",1,120);
  if (!CATEGORIES.has(book.category)) fail("book.category must be cet4/cet6/postgrad/ielts");
  optional(book.description,"book.description",2000);
  optional(book.coverKey,"book.coverKey",200);
  const chapters=array(input.chapters,"chapters",1,60);
  const words=array(input.words,"words",1,1500);
  const wordIds=new Set(), chapterIds=new Set(), chapterNumbers=new Set();
  for (const [i,w] of words.entries()) {
    id(w.id,"words["+i+"].id");
    if (wordIds.has(w.id)) fail("duplicate word id: "+w.id);
    wordIds.add(w.id);
    string(w.headword,"word headword",1,70);
    string(w.meaningZh,"word Chinese meaning",1,300);
    optional(w.phoneticUk,"phoneticUk",120);
    optional(w.phoneticUs,"phoneticUs",120);
    optional(w.partOfSpeech,"partOfSpeech",60);
    optional(w.exampleEn,"exampleEn",700);
    optional(w.exampleZh,"exampleZh",700);
    const cs=array(w.collocations || [],"collocations",0,8);
    cs.forEach((pair,j)=>{
      if (!pair || typeof pair !== "object") fail("invalid collocation "+i+":"+j);
      string(pair.en,"collocation.en",1,200);
      string(pair.zh,"collocation.zh",1,200);
    });
  }
  let mentionCount=0;
  for(const [i,ch] of chapters.entries()){
    id(ch.id,"chapters["+i+"].id");
    if(chapterIds.has(ch.id))fail("duplicate chapter id "+ch.id);
    chapterIds.add(ch.id);
    if(!Number.isInteger(ch.number) || ch.number<1 || ch.number>500)fail("invalid chapter number");
    if(chapterNumbers.has(ch.number))fail("duplicate chapter number "+ch.number);
    chapterNumbers.add(ch.number);
    string(ch.title,"chapter title",1,120);
    if(typeof ch.preview!=="boolean")fail("chapter.preview must be true/false");
    array(ch.paragraphs,"chapter paragraphs",1,150).forEach((paragraph,p)=>{
      if(!paragraph || typeof paragraph!=="object" || !Array.isArray(paragraph.segments))fail("paragraph must have segments");
      const segments=array(paragraph.segments,"paragraph segments",1,100);
      let length=0;
      segments.forEach((seg,k)=>{
        if(!seg || typeof seg!=="object")fail("bad segment");
        const text=seg.text, wordId=seg.wordId;
        if(typeof text==="string" && wordId===undefined){
          string(text,"paragraph text",1,5000);length+=text.length;
        }else if(typeof wordId==="string" && text===undefined){
          id(wordId,"word segment wordId");
          if(!wordIds.has(wordId))fail("unknown wordId "+wordId+" in chapter "+ch.id);
          const surface=string(seg.surface,"word surface",1,80);
          string(seg.gloss,"word gloss",1,200);
          length+=surface.length;mentionCount++;
        } else fail("segment requires either text or wordId/surface/gloss");
        if(length>6000)fail("paragraph exceeds 6000 characters");
      });
    });
  }
  const label=optional(input.sourceLabel,"sourceLabel",120) || "original-editorial";
  return { book, chapters, words, label, mentionCount };
}
export function generateSql(source) {
  const {book,chapters,words,label,mentionCount}=validatePackage(source);
  const digest=createHash("sha256").update(JSON.stringify(source)).digest("hex");
  const packageId="pkg-"+digest.slice(0,28);
  const out=[
    "-- S3-A draft import; no account, order, or entitlement changes.",
    "-- Do not run against production. Does NOT publish book or chapters.",
    "-- Package SHA-256: "+digest,
    "-- Reimport is idempotent; changing existing drafts requires later revision tooling."
  ];
  out.push(insert("books",["id","category_id","title","description","cover_key","status","sort_order"],
    [book.id,book.category,book.title,book.description||"",book.coverKey||null,"draft",0]));
  for(const w of words){
    out.push(insert("words",
      ["id","headword","phonetic_uk","phonetic_us","part_of_speech","meaning_zh","example_en","example_zh","collocations_json"],
      [w.id,w.headword,w.phoneticUk||null,w.phoneticUs||null,w.partOfSpeech||null,
        w.meaningZh,w.exampleEn||null,w.exampleZh||null,JSON.stringify(w.collocations||[])]));
    out.push(insert("word_categories",["word_id","category_id","proficiency_note"],[w.id,book.category,""]));
  }
  for(const ch of chapters){
    const paragraphs=ch.paragraphs.map(p=>({segments:p.segments.map(seg=>seg.wordId
      ?{wordId:seg.wordId,surface:seg.surface,gloss:seg.gloss}:{text:seg.text})}));
    const json=JSON.stringify({version:1,paragraphs});
    // Only insert new chapters while the owning book remains unpublished draft.
    const vals=[ch.id,book.id,ch.number,ch.title,json,ch.preview?1:0].map(safeSql);
    out.push("INSERT OR IGNORE INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at) "+
      "SELECT "+vals.join(",")+",NULL FROM books WHERE id="+safeSql(book.id)+" AND status='draft';");
    for(const [p,paragraph] of ch.paragraphs.entries()){
      const context=paragraph.segments.map(seg=>seg.wordId?seg.surface:seg.text).join("");
      for(const [k,segment] of paragraph.segments.entries()){
        if(!segment.wordId)continue;
        const anchor="p"+p+":s"+k;
        // Avoid changing published chapter word annotations.
        out.push("INSERT OR IGNORE INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) "+
          "SELECT "+[ch.id,segment.wordId,context,anchor].map(safeSql).join(",")+" "+
          "FROM chapters ch JOIN books b ON b.id=ch.book_id WHERE ch.id="+safeSql(ch.id)+
          " AND ch.published_at IS NULL AND b.status='draft';");
      }
    }
  }
  out.push("INSERT OR IGNORE INTO content_packages(id,book_id,source_digest,source_label) "+
    "SELECT "+[packageId,book.id,digest,label].map(safeSql).join(",")+
    " FROM books WHERE id="+safeSql(book.id)+" AND status='draft';");
  return { sql:out.join("\n")+"\n",
    summary:{book:book.id,category:book.category,chapters:chapters.length,
      words:words.length,wordOccurrences:mentionCount,digest,publication:"draft-only"} };
}
async function main(){
  const args=process.argv.slice(2);
  const input=args.find(x=>!x.startsWith("--"));
  if(!input)throw new Error("Usage: node scripts/build-content-import.mjs path/to/package.json [--check]");
  const absolute=resolve(input);
  const stat=readFileSync(absolute);
  if(stat.length>2_000_000)fail("package JSON exceeds 2 MB");
  const contents=JSON.parse(stat.toString("utf8"));
  const result=generateSql(contents);
  if(args.includes("--check")){process.stdout.write(JSON.stringify(result.summary,null,2)+"\n");return;}
  const outDir=resolve("private-output");
  mkdirSync(outDir,{recursive:true,mode:0o700});
  const file=join(outDir,"content-"+result.summary.book+"-"+result.summary.digest.slice(0,12)+".sql");
  writeFileSync(file,result.sql,{encoding:"utf8",mode:0o600});
  process.stdout.write("Generated private draft import SQL: "+basename(file)+"\n"+
    JSON.stringify(result.summary,null,2)+"\n");
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error=>{process.stderr.write(error.message+"\n");process.exitCode=1;});
}
