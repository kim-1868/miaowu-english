import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const candidate=readFileSync(
  new URL('../sql/d1_perf_published_word_occurrence_review_only.sql',import.meta.url),'utf8');
const original=`
SELECT c.slug,b.id AS book_id,lower(trim(w.headword)) AS headword,COUNT(*) AS occurrences
FROM chapters ch JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id
JOIN json_each(ch.content_json,'$.paragraphs') p
JOIN json_each(p.value,'$.segments') s
JOIN chapter_words cw ON cw.chapter_id=ch.id
AND cw.context_anchor='p'||p.key||':s'||s.key
AND cw.word_id=json_extract(s.value,'$.wordId')
JOIN words w ON w.id=cw.word_id
WHERE c.is_visible=1 AND b.status='published'
AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP
AND trim(w.meaning_zh)<>'' AND trim(w.part_of_speech)<>''
GROUP BY c.slug,b.id,lower(trim(w.headword))`;

function fixture({stress=false}={}) {
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE categories(id TEXT PRIMARY KEY,slug TEXT,is_visible INTEGER);
 CREATE TABLE books(id TEXT PRIMARY KEY,category_id TEXT,status TEXT);
 CREATE TABLE chapters(id TEXT PRIMARY KEY,book_id TEXT,published_at TEXT,content_json TEXT);
 CREATE TABLE words(id TEXT PRIMARY KEY,headword TEXT,meaning_zh TEXT,part_of_speech TEXT);
 CREATE TABLE chapter_words(chapter_id TEXT,word_id TEXT,context_anchor TEXT,
   PRIMARY KEY(chapter_id,word_id,context_anchor));
 CREATE INDEX ix_chapters_book ON chapters(book_id);
 CREATE INDEX ix_chapter_words_word ON chapter_words(word_id,chapter_id);`);
 for(const [id,slug,visible] of [['c4','cet4',1],['c6','cet6',1],['cX','hidden',0]]){
  db.prepare('INSERT INTO categories VALUES (?,?,?)').run(id,slug,visible);
 }
 for(const [id,cat,status] of [
   ['bk1','c4','published'],['bk2','c4','published'],['bk3','c6','published'],
   ['bk4','c4','draft'],['bk5','cX','published']
 ]){
  db.prepare('INSERT INTO books VALUES (?,?,?)').run(id,cat,status);
 }
 for(const [id,head,meaning,pos] of [
  ['w1',' Apple ','苹果','n.'],['w2','apple','苹果','n.'],
  ['w3','record','记录','n.'],['w4','blank','','n.'],
  ['w5','no-pos','意思',''],['w6','spacepos','意思','  ']
 ]){
  db.prepare('INSERT INTO words VALUES (?,?,?,?)').run(id,head,meaning,pos);
 }
 const paras=[
  {segments:[{wordId:'w1'},{wordId:'w2'},{wordId:'w3'},{wordId:null}]},
  {segments:[{wordId:'w1'},{wordId:'w4'},{wordId:'w5'},{wordId:'w6'}]}
 ];
 const insCh=db.prepare('INSERT INTO chapters VALUES (?,?,?,?)');
 const insCW=db.prepare('INSERT INTO chapter_words VALUES (?,?,?)');
 for(const bk of ['bk1','bk2','bk3','bk4','bk5']){
  const ch=bk+'-ch';
  insCh.run(ch,bk,'2026-01-01',JSON.stringify({paragraphs:paras}));
  for(const [word,anchor] of [
   ['w1','p0:s0'],['w2','p0:s1'],['w3','p0:s2'],['w1','p1:s0'],
   ['w4','p1:s1'],['w5','p1:s2'],['w6','p1:s3'],['w1','p0:s1'],
   ['w1','p90:s0'],['w1','p0:s00'],['w1','p0:s-1'],['w1','p-1:s0'],['w1','p0:s0junk']
  ]) insCW.run(ch,word,anchor);
 }
 insCh.run('future','bk1','2099-01-01',JSON.stringify({paragraphs:paras}));
 insCW.run('future','w1','p0:s0');
 insCh.run('unpublished','bk1',null,JSON.stringify({paragraphs:paras}));
 insCW.run('unpublished','w1','p0:s0');
 if(stress){
  const segs=Array.from({length:32},(_,i)=>({wordId:i%2===0?'w1':'w3'}));
  const paragraphs=Array.from({length:50},()=>({segments:segs}));
  insCh.run('stress','bk1','2026-01-01',JSON.stringify({paragraphs}));
  for(let p=0;p<50;p+=5)for(let s=0;s<32;s+=4)
   insCW.run('stress','w1',`p${p}:s${s}`);
 }
 return db;
}
const normalized=(db,sql)=>db.prepare(sql).all()
 .map(({slug,book_id,headword,occurrences})=>({slug,book_id,headword,occurrences}))
 .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));

test('D1 1.31M hot SQL direct-anchor aggregate preserves original grouped counts',()=>{
 const db=fixture();
 try{
  assert.deepEqual(normalized(db,candidate),normalized(db,original));
  const result=normalized(db,candidate);
  assert.equal(result.length,6);
  for(const book of ['bk1','bk2','bk3']){
   assert.equal(result.find(r=>r.book_id===book&&r.headword==='apple')?.occurrences,3);
   assert.equal(result.find(r=>r.book_id===book&&r.headword==='record')?.occurrences,1);
  }
  assert.doesNotMatch(candidate,/json_each\s*\(/i);
  const plan=db.prepare('EXPLAIN QUERY PLAN '+candidate).all();
  assert.ok(!plan.some(p=>/VIRTUAL TABLE INDEX/.test(p.detail)));
 }finally{db.close();}
});
test('D1 direct-anchor aggregate preserves repeated occurrence counts with many segments',()=>{
 const db=fixture({stress:true});
 try{
  const expected=normalized(db,original);
  const actual=normalized(db,candidate);
  assert.deepEqual(actual,expected);
  assert.equal(actual.find(r=>r.book_id==='bk1'&&r.headword==='apple')?.occurrences,83);
 }finally{db.close();}
});
