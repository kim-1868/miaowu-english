import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const optimized=readFileSync(new URL('../sql/d1_perf_anchor_validation_review_only.sql',import.meta.url),'utf8');
const original=`SELECT DISTINCT w.headword,b.id = ? AS is_replaced
 FROM books b JOIN categories c ON c.id=b.category_id
 JOIN chapters ch ON ch.book_id=b.id
 JOIN chapter_words cw ON cw.chapter_id=ch.id
 JOIN words w ON w.id=cw.word_id
 JOIN json_each(
  CASE WHEN json_valid(ch.content_json) THEN ch.content_json ELSE '{}' END,
  '$.paragraphs'
 ) p
 JOIN json_each(p.value,'$.segments') s
 WHERE b.category_id = ? AND c.is_visible = 1
 AND b.status='published' AND ch.published_at IS NOT NULL
 AND ch.published_at<=CURRENT_TIMESTAMP
 AND cw.context_anchor='p'||p.key||':s'||s.key
 AND json_extract(s.value,'$.wordId')=w.id
 AND trim(coalesce(w.meaning_zh,''))<>''
 AND trim(coalesce(w.part_of_speech,''))<>''`;

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE books(id TEXT PRIMARY KEY,category_id TEXT,status TEXT);
 CREATE TABLE categories(id TEXT PRIMARY KEY,is_visible INTEGER);
 CREATE TABLE chapters(id TEXT PRIMARY KEY,book_id TEXT,published_at TEXT,content_json TEXT);
 CREATE TABLE words(id TEXT PRIMARY KEY,headword TEXT,meaning_zh TEXT,part_of_speech TEXT);
 CREATE TABLE chapter_words(chapter_id TEXT,word_id TEXT,context_anchor TEXT,PRIMARY KEY(chapter_id,word_id,context_anchor));
 CREATE INDEX ix_chapters_book ON chapters(book_id);
 CREATE INDEX ix_chapter_words_word ON chapter_words(word_id,chapter_id);`);
 db.prepare('INSERT INTO categories VALUES (?,?)').run('cet4',1);
 db.prepare('INSERT INTO categories VALUES (?,?)').run('cet6',0);
 for(const [book,cat,status] of [['book1','cet4','published'],['book2','cet4','published'],
   ['draft','cet4','draft'],['hidden','cet6','published']]){
  db.prepare('INSERT INTO books VALUES (?,?,?)').run(book,cat,status);
 }
 for(const [id,head,gloss,pos] of [
   ['w1','record','记录','n.'],['w2','book','书','n.'],['w3','missing-pos','词',''],
   ['w4','blank-meaning','','v.']]){
  db.prepare('INSERT INTO words VALUES (?,?,?,?)').run(id,head,gloss,pos);
 }
 const paragraphs=[
  {segments:[{wordId:'w1'}, {wordId:'w2'}, {wordId:'w3'}]},
  {segments:[{wordId:'w4'}, {wordId:'w1'}]}
 ];
 for(const book of ['book1','book2','draft','hidden']){
  db.prepare('INSERT INTO chapters VALUES (?,?,?,?)')
    .run(book+'-chapter',book,'2026-01-01',JSON.stringify({paragraphs}));
  for(const [id,anchor] of [['w1','p0:s0'],['w2','p0:s1'],['w3','p0:s2'],['w4','p1:s0'],
    ['w1','p1:s1'],['w1','p99:s0'],['w1','p-1:s0'],['w1','p0:s01'],['w1','p0:s1']]){
    db.prepare('INSERT INTO chapter_words VALUES (?,?,?)')
      .run(book+'-chapter',id,anchor);
  }
 }
 db.prepare('INSERT INTO chapters VALUES (?,?,?,?)').run('corrupt','book1','2026-01-01','not JSON');
 db.prepare('INSERT INTO chapter_words VALUES (?,?,?)').run('corrupt','w1','p0:s0');
 db.prepare('INSERT INTO chapters VALUES (?,?,?,?)')
   .run('future','book1','2099-01-01',JSON.stringify({paragraphs}));
 db.prepare('INSERT INTO chapter_words VALUES (?,?,?)').run('future','w1','p0:s0');
 return db;
}
function rows(db,query,params){
 return db.prepare(query).all(...params)
  .map(r=>[r.headword,Number(r.is_replaced)])
  .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
test('D1 6.63M-read query replacement keeps canonical anchor, word, publication and replaced-book semantics',()=>{
 const db=fixture();
 try{
  for(const book of ['book1','book2','draft']){
   const params=[book,'cet4'];
   assert.deepEqual(rows(db,optimized,params),rows(db,original,params));
  }
  const actual=rows(db,optimized,['book1','cet4']);
  assert.deepEqual(actual,[['book',0],['book',1],['record',0],['record',1]]);
  assert.deepEqual(rows(db,optimized,['book1','cet6']),[]);
  assert.ok(!/\bjson_each\s*\(/i.test(optimized));
  const plan=db.prepare('EXPLAIN QUERY PLAN '+optimized).all('book1','cet4');
  assert.ok(!plan.some(p=>/SCAN [ps] VIRTUAL TABLE/i.test(p.detail)));
 }finally{db.close()}
});
