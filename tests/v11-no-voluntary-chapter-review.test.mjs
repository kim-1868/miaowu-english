import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const get=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
function readerVocabularyFixture(){
 const nodes=new Map();
 function el(id){
  const node={id,hidden:false,innerHTML:"",textContent:"",onclick:null,scrollTop:0,
   classList:{contains:()=>false,remove(){},toggle(){}},
   setAttribute(){},
   querySelectorAll:()=>[]};
  nodes.set(id,node);return node;
 }
 for(const id of ["chapterVocabBody","chapterVocabCount","chapterVocabTitle",
  "chapterVocabToggle","mobileVocabOpen","mobileVocabClose","readerLayout",
  "mobileChapterOpen"])el(id);
 const window={};
 const document={getElementById:id=>nodes.get(id)||null};
 runInNewContext(get("public/chapter-words.js"),{window,document});
 window.MiaowuChapterWords.configure({
  showWord(){},speak(){},user:()=>({}),request(){},refresh(){},toast(){},login(){}
 });
 return {reader:window.MiaowuChapterWords,nodes};
}
test("V1.1 owner-approved reader: learned words show in ordinary vocabulary only, never voluntary quick review",()=>{
 const {reader,nodes}=readerVocabularyFixture();
 reader.openChapter("ch-one");
 reader.setWords([{word_id:"old-1",headword:"promise",meaning_zh:"承诺",
  study_seen:true,study_status:"mastered"}]);
 const html=nodes.get("chapterVocabBody").innerHTML;
 assert.match(html,/promise/);
 assert.match(html,/已学/);
 assert.match(html,/data-vocab-index/);
 assert.match(html,/data-vocab-say/);
 assert.doesNotMatch(html,/startLearnedReview|自愿复习已学词/);
 assert.doesNotMatch(html,/id="startQuickReview"/);
 assert.equal(nodes.get("chapterVocabTitle").textContent,"本章词汇");
 assert.equal(nodes.get("chapterVocabCount").textContent,"1 词");
});
test("V1.1 owner-approved reader: new chapter words still get normal study action",()=>{
 const {reader,nodes}=readerVocabularyFixture();
 reader.openChapter("ch-two");
 reader.setWords([
  {word_id:"old-1",headword:"promise",meaning_zh:"承诺",study_seen:true},
  {word_id:"new-1",headword:"challenge",meaning_zh:"挑战",study_seen:false}
 ]);
 const html=nodes.get("chapterVocabBody").innerHTML;
 assert.match(html,/id="startQuickReview"/);
 assert.match(html,/学习本章新词（1）/);
 assert.match(html,/promise/);
 assert.match(html,/challenge/);
 assert.doesNotMatch(html,/startLearnedReview|自愿复习已学词/);
});
test("V1.1 owner-approved reader: source no longer contains learned-word review code path",()=>{
 const js=get("public/chapter-words.js");
 const html=get("public/index.html");
 assert.doesNotMatch(js,/startLearnedReview|自愿复习已学词|const voluntarily/);
 assert.match(js,/学习本章新词/);
 assert.match(js,/api\.showWord\(word\.word_id\)/);
 assert.match(js,/api\.speak\(words\[/);
 assert.match(html,/chapter-words\.js\?v=20261108-v11-no-voluntary-review-r3/);
});
