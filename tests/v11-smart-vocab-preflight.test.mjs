import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectSmartNewWords,previouslyLearnedKeys} from '../src/smart-vocab-preflight.js';

const base={category_slug:'cet4',frequency_source:'COCA',phonetic_uk:'/x/',
  example_en:'A neutral, independent dictionary example.',
  example_zh:'一条例句。'};
const w=(id,word,pos,meaning,rank,category='cet4')=>({
  ...base,word_id:id,headword:word,part_of_speech:pos,
  meaning_zh:meaning,frequency_rank:rank,category_slug:category
});
const select=(options={})=>selectSmartNewWords({
  category:'cet4',activeEntitlements:['cet4'],catalogVerified:true,
  rankedWords:[],...options
});

test('smart selector refuses unpurchased categories even if candidate rows contain them',()=>{
  const result=select({category:'cet6',rankedWords:[w('six','rare','adj.','罕见的',1,'cet6')]});
  assert.deepEqual(result,{available:false,reason:'CATEGORY_NOT_ENTITLED',words:[]});
  assert.equal(select({activeEntitlements:[]}).available,false);
  assert.equal(select({activeEntitlements:['cet4'],category:'postgrad'}).available,false);
});

test('unverified corpus is never mislabeled a full exam vocabulary or a frequency recommendation',()=>{
  const result=select({catalogVerified:false,rankedWords:[w('one','basic','adj.','基础的',1)]});
  assert.equal(result.reason,'CATALOG_NOT_VERIFIED');
  assert.equal(result.words.length,0);
});

test('new words sort by source frequency and ignore wrong category, missing rank, unknown rank origin',()=>{
  const result=select({rankedWords:[
    w('b','plausible','adj.','貌似合理的',200),
    w('a','crucial','adj.','关键的',10),
    w('unknown','guess','v.','猜测',0),
    {...w('source','noise','n.','噪音',1),frequency_source:'GUESS'},
    w('wrong','strange','adj.','奇怪的',1,'cet6'),
    w('c','notion','n.','概念',30)
  ]});
  assert.deepEqual(result.words.map(x=>x.word_id),['a','c','b']);
  assert.equal(result.remaining,0);
});

test('study status includes unbookmarked novel words and prevents duplicate new-word teaching',()=>{
  const learned=[{word_id:'novel-a',headword:'crucial',
    part_of_speech:'adj.',meaning_zh:'关键的；重要的',
    status:'learning',bookmarked:0,last_seen_at:'2026-11-09'}];
  const result=select({studyRows:learned,rankedWords:[
    w('lex-c','crucial','adj','关键的；极其重要的',1),
    w('lex-n','crucial','n.','关键部分',2),
    w('lex-p','purpose','n.','目的',3)
  ]});
  assert.deepEqual(result.words.map(x=>x.word_id),['lex-n','lex-p']);
  assert.equal(previouslyLearnedKeys(learned).size,1);
});

test('different sense and POS must not merge, aliases of one sense must collapse',()=>{
  const result=select({rankedWords:[
    w('a','address','n.','地址；住址',3),
    w('b','address','n','地址；邮寄地址',5),
    w('c','address','v.','处理；应对',4)
  ]});
  assert.deepEqual(result.words.map(x=>x.word_id),['a','c']);
});

test('no POS is treated as a distinct legacy ID, never blindly conflated',()=>{
  const result=select({studyRows:[{
    word_id:'novel-old',headword:'match',part_of_speech:'',
    meaning_zh:'比赛',status:'mastered',bookmarked:0
  }],rankedWords:[w('lex-new','match','','比赛',1)]});
  assert.deepEqual(result.words.map(x=>x.word_id),['lex-new']);
});

test('only genuinely learned state excludes new recommendations; unused placeholders do not',()=>{
  const result=select({studyRows:[{
    word_id:'old',headword:'retain',part_of_speech:'v.',
    meaning_zh:'保留',status:'new',last_seen_at:null
  }],rankedWords:[w('new','retain','v.','保留',1)]});
  assert.equal(result.words.length,1);
});

test('batch limit is bounded and remaining count represents unserved distinct senses',()=>{
  const rankedWords=Array.from({length:24},(_,i)=>w('id-'+i,'headword'+i,'n.','编号'+i,i+1));
  const result=select({rankedWords});
  assert.equal(result.words.length,20);
  assert.equal(result.remaining,4);
  assert.equal(select({rankedWords,limit:21}).reason,'INVALID_BATCH_SIZE');
});

test('selection never edits input rows and never exposes novel passage fields',()=>{
  const item={...w('a','release','v.','释放',1),book_title:'Novel X',
    chapter_id:'private-chapter',context_sentence:'Unpublished story'};
  const before=JSON.stringify(item);
  const result=select({rankedWords:[item]});
  assert.equal(JSON.stringify(item),before);
  for(const key of ['book_title','chapter_id','context_sentence'])
    assert.equal(Object.hasOwn(result.words[0],key),false);
});
