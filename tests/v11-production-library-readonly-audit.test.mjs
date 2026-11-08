import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("V1.1 production library metadata query is aggregate-only and has no write statements",()=>{
 const sql=read("docs/v11-p5-production-library-readonly-audit.sql");
 const stripped=sql.replace(/--[^\n]*/g,"").trim();
 assert.match(stripped,/^WITH published_words AS \(/);
 assert.doesNotMatch(stripped,/\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE|ATTACH|DETACH|PRAGMA)\b/i);
 assert.doesNotMatch(stripped,/\b(?:users|activation_codes|entitlements|sessions|password_hash|code_hash)\b/i);
 const db=new DatabaseSync(":memory:");
 try{
  db.exec(read("db/001_schema.sql"));
  db.exec(read("db/003_public_categories.sql"));
  db.exec("INSERT INTO books(id,category_id,title,status) VALUES"+
   "('b1','cet4','Pub','published'),('b2','cet6','Draft','draft')");
  db.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES"+
   "('c1','b1',1,'One','{}','2026-01-01 00:00:00'),"+
   "('c2','b2',1,'One','{}','2026-01-01 00:00:00')");
  db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh,phonetic_uk,phonetic_us,example_en,example_zh,collocations_json) VALUES"+
   "('w1','word','n.','词','/wɜːd/','/wɜːrd/','The word appears.','这个词出现了。','[]'),"+
   "('w2','blank','adj.','空','','','',NULL,'INVALID'),"+
   "('w3','hidden','n.','保密','','','','','[]')");
  db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES"+
   "('c1','w1','A word.','a'),('c1','w2','A blank.','b'),('c2','w3','Hidden.','a')");
  const before=db.prepare("SELECT COUNT(*) AS n FROM words").get().n;
  const rows=db.prepare(stripped).all();
  assert.equal(rows.length,1);
  assert.equal(rows[0].book_id,"b1");
  assert.equal(rows[0].distinct_word_cards,2);
  assert.equal(rows[0].missing_uk_ipa,1);
  assert.equal(rows[0].missing_us_ipa,1);
  assert.equal(rows[0].missing_example_en,1);
  assert.equal(rows[0].missing_example_zh,1);
  assert.equal(rows[0].malformed_collocations,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM words").get().n,before);
 }finally{db.close()}
});
