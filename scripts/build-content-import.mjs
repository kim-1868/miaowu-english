// S3-A editor package -> escaped, repeat-safe D1 SQL. Never commit private-output/.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePackage } from "../src/editorial-content.js";
export { validatePackage } from "../src/editorial-content.js";


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
