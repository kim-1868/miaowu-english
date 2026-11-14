import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {buildRealPublishedTwoBookEditorialIntake as pack}
 from '../scripts/v12-real-published-two-book-editorial-intake.mjs';
import {prepareRealTwoBookTestImportPreflight as preview}
 from '../scripts/v12-real-two-book-test-import-preflight.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function realShape(){
 const candidate={headword:'choice',pos:'n.',meaning_zh:'选择',
  fingerprint_sha256:'f'.repeat(64),source_book_count:2,occurrences:2,
  paired_cards:[]},rows=[];
 for(let i=0;i<2;i++){
  const book='paid-real-book-'+i,old='original-old-word-'+i;
  const paragraph=JSON.stringify({segments:[
   {text:'段落背景：'}, {surface:'choice',wordId:old,gloss:'选择'},
   {text:'这是一个艰难的决定。'}]});
  const c={rank:i,book_id:book,category_id:'cet4',
   book_title:'出版作品'+i,chapter_id:'chapter-'+i,chapter_no:i+1,
   chapter_title:'第'+(i+1)+'章',legacy_word_id:old,anchor:'p4:s1',
   old_headword:'choice',old_uk:'/tʃɔɪs/',old_us:'/tʃɔɪs/',
   old_pos:'n.',old_meaning:'选择',
   old_en:'She made a careful choice.',old_zh:'她做出了谨慎的选择。',
   old_collocations:'[]',paragraph_json:paragraph,
   segment_word_id:old,segment_gloss:'选择'};
  c.old_card_sha256=sha(JSON.stringify([
   old,c.old_headword,c.old_uk,c.old_us,c.old_pos,c.old_meaning,
   c.old_en,c.old_zh,c.old_collocations]));
  candidate.paired_cards.push({book_id:book,old_word_id:old,
   phonetic_uk:c.old_uk,phonetic_us:c.old_us,
   example_en:c.old_en,example_zh:c.old_zh});
  rows.push(c);
 }
 return pack({schema:'wordletter-real-production-2book-context-evidence-v1',
  status:'REAL_PUBLISHED_CONTEXT_EVIDENCE_ONLY_NOT_APPROVED',
  source_artifact_id:13911979176,editorial_candidate:candidate,
  verified_actual_published_contexts:rows,approved_sense_id:null,
  commercial_license_verified:false,authenticated_ops_signoff:false,
  bound_staging_legacy_word_ids:0,production_writes:0,
  customer_study_writes:0,staging_writes:0});
}
test('real-shaped private two-book packet produces ONLY hidden draft and strict HOLD import preview',()=>{
 const m=preview(realShape());
 assert.equal(m.status,'HOLD_PROTECTED_TEST_PREVIEW_NOT_FOR_EXECUTION');
 assert.equal(m.target_database_id,'88a817cb-23bb-4ae4-bcb8-92286c4165d4');
 assert.deepEqual(m.counts,{real_publisher_books:2,chapters:2,
  old_word_cards:2,real_context_anchors:2,distinct_senses_proven_and_approved:0});
 assert.equal(m.publisher_content_origin.declaration,
  'USER_REPORTED_NOVELS_AI_GENERATED_FOR_MIAOWU');
 assert.equal(m.publisher_content_origin.evidence_type,'user_self_report_unverified');
 assert.equal(m.publisher_content_origin.specific_book_rights_signed_off,false);
 assert.ok(m.publisher_content_origin.excludes.includes('english_example'));
 assert.equal(m.publisher_content_origin.bilingual_example_origin_claim.general_project_production,
  'CHATGPT_ASSISTED_ORIGINAL_DRAFTS');
 assert.equal(m.publisher_content_origin.bilingual_example_origin_claim.confirmed_by_user,true);
 assert.equal(m.publisher_content_origin.bilingual_example_origin_claim.each_selected_legacy_card_provenance_verified,false);
 assert.equal(m.safety.authenticated_editorial_and_license_receipt_verified,false);
 assert.equal(m.safety.can_execute,false);
 assert.equal(m.safety.executable_d1_sql_generated,false);
 assert.equal(m.safety.database_writes_performed,0);
 assert.equal(m.safety.no_entitlements_inserted,true);
 assert.ok(m.sealed_source_data.categories.every(c=>c.is_visible===0));
 assert.ok(m.sealed_source_data.books.every(b=>b.status==='draft'));
 assert.ok(m.sealed_source_data.chapters.every(c=>c.published_at===null&&c.is_preview===0));
 assert.equal(m.sealed_source_data.chapter_words[0].context_anchor,'p4:s1');
 const content=JSON.parse(m.sealed_source_data.chapters[0].content_json);
 assert.equal(content.paragraphs.length,5);
 assert.equal(content.paragraphs[0].segments[0].text,
  'TEST_IMPORTED_ANCHOR_PLACEHOLDER_0');
 assert.equal(content.paragraphs[4].segments[1].wordId,'original-old-word-0');
 assert.equal(content.paragraphs[4].segments[1].gloss,'选择');
});
test('proposed bundle passes schema foreign keys within disposable DB but NEVER exposes content as a published novel',()=>{
 const m=preview(realShape()),d=new DatabaseSync(':memory:');
 try{
  d.exec(readFileSync(new URL('../db/001_schema.sql',import.meta.url),'utf8'));
  d.exec('PRAGMA foreign_keys=ON;');
  for(const c of m.sealed_source_data.categories)
   d.prepare('INSERT INTO categories(id,slug,title,is_visible) VALUES(?,?,?,?)')
    .run(c.id,c.slug,c.title,c.is_visible);
  for(const b of m.sealed_source_data.books)
   d.prepare('INSERT INTO books(id,category_id,title,status,sort_order) VALUES(?,?,?,?,?)')
    .run(b.id,b.category_id,b.title,b.status,b.sort_order);
  for(const c of m.sealed_source_data.chapters)
   d.prepare('INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at)'+
    ' VALUES(?,?,?,?,?,?,?)').run(
     c.id,c.book_id,c.chapter_no,c.title,c.content_json,c.is_preview,c.published_at);
  for(const w of m.sealed_source_data.words)
   d.prepare('INSERT INTO words(id,headword,phonetic_uk,phonetic_us,part_of_speech,'+
    'meaning_zh,example_en,example_zh,collocations_json) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(w.id,w.headword,w.phonetic_uk,w.phonetic_us,w.part_of_speech,
     w.meaning_zh,w.example_en,w.example_zh,w.collocations_json);
  for(const c of m.sealed_source_data.chapter_words)
   d.prepare('INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor)'+
    ' VALUES(?,?,?,?)').run(c.chapter_id,c.word_id,c.context_sentence,c.context_anchor);
  assert.equal(d.prepare("SELECT count(*) n FROM books WHERE status='published'").get().n,0);
  assert.equal(d.prepare('SELECT count(*) n FROM words').get().n,2);
  assert.equal(d.prepare('SELECT count(*) n FROM chapter_words').get().n,2);
  assert.equal(d.prepare('SELECT count(*) n FROM entitlements').get().n,0);
  assert.equal(d.prepare('SELECT count(*) n FROM user_words').get().n,0);
  assert.equal(d.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{d.close()}
});
test('card SHA corruption, segment rewrites, fake approval or wrong source cannot be prepared',()=>{
 const changes=[
  p=>p.candidate.real_cards[0].old_card_sha256='0'.repeat(64),
  p=>p.candidate.real_cards[0].context_paragraph_sha256='0'.repeat(64),
  p=>p.candidate.real_cards[0].book_id='qa-fake',
  p=>p.candidate.real_cards[1].legacy_word_id=p.candidate.real_cards[0].legacy_word_id,
  p=>p.candidate.real_cards[0].context_gloss='错误',
  p=>p.review_decision.action='approved',
  p=>p.review_decision.authenticated_ops_signoff=true,
  p=>p.actual_signed_off_senses=1
 ];
 for(const change of changes){const p=realShape();change(p);
  assert.throws(()=>preview(p))}
});
test('source does not contain remote DB mutations or leak user data to output',()=>{
 const script=readFileSync(new URL('../scripts/v12-real-two-book-test-import-preflight.mjs',
  import.meta.url),'utf8');
 assert.doesNotMatch(script,/wrangler d1|CLOUDFLARE_API_TOKEN|fetch\(|d1 migrations apply/iu);
 assert.doesNotMatch(script,/new D1Database|\bINSERT\s+INTO\b/iu);
});
