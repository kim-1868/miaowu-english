// Browser/Node pure text-to-licensed-vocabulary import format.
// A story file never silently invents an IPA, translation or word definition.
// Inline [[word|meaning]] is explicit; ordinary English tokens are matched
// against approved existing word cards and left literal when ambiguous.
const ID=/^[a-z][a-z0-9_-]{2,79}$/;
const heading=/^(?:\s*#{2,3}\s+(.+)|\s*第\s*([0-9零一二三四五六七八九十百]+)\s*章\s*[：:、·.\s-]*(.*)|\s*Chapter\s+([0-9]+)\s*[：:.\s-]*(.*))$/i;
const token=/\[\[([a-z][a-z'-]{0,69})(?:\|([^\]\r\n]{1,200}))?\]\]|[a-z][a-z'-]*/gi;
const category=/^[a-z][a-z0-9-]{2,29}$/;
const texts=x=>typeof x==="string"?x.trim():"";
const groupWord=name=>texts(name).toLowerCase();
const safeName=w=>({id:w.id,headword:w.headword,meaningZh:w.meaningZh,
 phoneticUk:w.phoneticUk||"",phoneticUs:w.phoneticUs||"",
 partOfSpeech:w.partOfSpeech||"",exampleEn:w.exampleEn||"",
 exampleZh:w.exampleZh||"",collocations:w.collocations||[]});
const addPlain=(segments,t)=>{
 if(!t)return;
 const last=segments[segments.length-1];
 if(last&&"text" in last)last.text+=t;
 else segments.push({text:t});
};
function splitChapters(text){
 const lines=text.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n").split("\n");
 const chapters=[];let current=null,para=[];
 const flushParagraph=()=>{
  if(!current||!para.length)return;
  const joined=para.join("").trim();if(joined)current.paragraphs.push(joined);
  para=[];
 };
 const flushChapter=()=>{if(!current)return;flushParagraph();if(current.paragraphs.length)chapters.push(current);current=null};
 for(const line of lines){
  const match=line.match(heading);
  if(match){
   flushChapter();
   const title=match[1]||match[3]||match[5]||"未命名章节";
   current={title:title.trim(),paragraphs:[]};continue;
  }
  if(!current){if(!line.trim()||/^\s*#\s+/.test(line))continue;current={title:"正文",paragraphs:[]};}
  if(!line.trim()){flushParagraph();continue;}
  // Novel formatting: single-line paragraphs (each natural newline).
  flushParagraph();para.push(line.trim());flushParagraph();
 }
 flushChapter();
 return chapters;
}
export function parseNovelTextFile(source,opts={}){
 const {bookId,title,description="",coverKey=null,category:kind="cet4",
  previewChapters=0,words=[]}=opts;
 if(!ID.test(bookId||""))throw Error("BOOK_ID_INVALID");
 if(!texts(title)||texts(title).length>120)throw Error("BOOK_TITLE_INVALID");
 if(typeof kind!=="string"||!category.test(kind))throw Error("BOOK_CATEGORY_INVALID");
 if(!Number.isInteger(previewChapters)||previewChapters<0)throw Error("PREVIEW_COUNT_INVALID");
 if(typeof source!=="string"||!source.trim())throw Error("STORY_FILE_EMPTY");
 const list=splitChapters(source);
 if(list.length<1||list.length>60)throw Error("CHAPTER_COUNT_INVALID");
 if(previewChapters>=list.length)throw Error("REQUIRES_AT_LEAST_ONE_PAID_CHAPTER");
 const map=new Map();
 for(const card of words){
  if(!card||typeof card!=="object"||!card.id||!card.headword)continue;
  const key=groupWord(card.headword),arr=map.get(key)||[];
  arr.push(card);map.set(key,arr);
 }
 const used=new Map(),issues=[],unresolved=[],chapters=[],chapterDensity=[];
 for(const [ci,ch] of list.entries()){
  const paragraphs=[];
  for(const [pi,paragraph] of ch.paragraphs.entries()){
   const segments=[];let last=0,anchors=0;
   for(const match of paragraph.matchAll(token)){
    const explicit=match[0].startsWith("[[");
    const word=explicit?match[1]:match[0];
    const gloss=explicit?texts(match[2]):"";
    addPlain(segments,paragraph.slice(last,match.index));
    const candidates=map.get(groupWord(word))||[];
    const matching=gloss?candidates.filter(c=>texts(c.meaningZh)===gloss):candidates;
    if(matching.length===1){
     const card=matching[0];
     segments.push({wordId:card.id,surface:word,gloss:gloss||card.meaningZh});
     used.set(card.id,safeName(card));anchors++;
     if(!card.phoneticUk||!card.phoneticUs||!card.partOfSpeech||
        !card.exampleEn||!card.exampleZh)issues.push({
        kind:"INCOMPLETE_WORD_CARD",chapter:ci+1,paragraph:pi+1,word
       });
    }else{
     addPlain(segments,word);
     if(explicit)unresolved.push({chapter:ci+1,paragraph:pi+1,word,
      reason:matching.length>1?"AMBIGUOUS_WORD_CARD":"NO_MATCHING_WORD_CARD"});
     else if(!candidates.length)issues.push({
      kind:"UNTRACKED_ENGLISH",chapter:ci+1,paragraph:pi+1,word
     });
     else issues.push({kind:"AMBIGUOUS_WORD_CARD",chapter:ci+1,paragraph:pi+1,word});
    }
    last=match.index+match[0].length;
   }
   addPlain(segments,paragraph.slice(last));
   if(segments.length)paragraphs.push({segments});
   if(anchors<3)issues.push({kind:"LOW_DENSITY_PARAGRAPH",
    chapter:ci+1,paragraph:pi+1,count:anchors});
   if(segments.length>100)throw Error("TOO_MANY_SEGMENTS_IN_PARAGRAPH");
  }
  if(paragraphs.length<1||paragraphs.length>150)throw Error("CHAPTER_PARAGRAPH_LIMIT");
  chapterDensity.push(paragraphs.reduce((sum,p)=>sum+p.segments.filter(s=>s.wordId).length,0));
  chapters.push({id:bookId+"-ch"+(ci+1),number:ci+1,title:ch.title,
    preview:ci<previewChapters,paragraphs});
 }
 if(unresolved.length)throw Object.assign(Error("EXPLICIT_WORD_CARD_UNRESOLVED"),{details:unresolved});
 if(!used.size)throw Error("NO_LEARNING_VOCABULARY_MATCHED");
 if(used.size>500)throw Error("TOO_MANY_WORDS_IN_ONE_BOOK");
 const result={version:1,sourceLabel:"self-service-upload",book:{
  id:bookId,title:title.trim(),category:kind,description,coverKey},
  chapters,words:[...used.values()]};
 const all=chapterDensity.reduce((a,b)=>a+b,0);
 return {package:result,report:{
  chapters:chapters.length,wordCards:used.size,anchors:all,
  avgPerParagraph:Number((all/chapters.reduce((n,c)=>n+c.paragraphs.length,0)).toFixed(2)),
  warnings:issues,unresolved,previewChapters,
  allWordCardsComplete:![...used.values()].some(w=>!w.phoneticUk||!w.phoneticUs||
   !w.partOfSpeech||!w.exampleEn||!w.exampleZh)
 }};
}

// Local, transparent, conservative keyword suggestions. No external AI or API fees.
// They are proposals only: operators review or deselect before any write.
const RULES=[
 ["双男主","#455a78",/双男主|双男主人公|男男|BL故事|BL小说|两位男主/iu],
 ["穿书","#713848",/穿书|穿成.{0,10}女配|穿越进.{0,8}小说|进入小说世界|剧情里的.{0,5}角色/iu],
 ["重生","#713848",/重生|上辈子|前世|回到.{0,16}(那天|那年|过去)|再活一次/iu],
 ["悬疑","#455a78",/悬疑|谜案|失踪案|调查.{0,12}真相|查明.{0,10}真相|隐秘档案|神秘失踪|案件|凶手|证词|失踪|破案/iu],
 ["失踪谜案","#455a78",/失踪.{0,15}(案|线索|调查|寻找|追查|姐姐)|失踪案|离奇失踪/iu],
 ["职场逆袭","#507e9a",/职场逆袭|被开除.{0,15}(反击|打脸|买下|新机会)|事业逆袭|职场.{0,12}(打脸|翻身)|工作室.{0,12}逆袭/iu],
 ["豪门逆袭","#9f753e",/豪门逆袭|被赶出豪门|被逐出豪门|真少爷.{0,12}(退群|回家|翻身)|假千金.{0,12}(退场|反击|离开)/iu],
 ["真假千金","#9f753e",/真假千金|真千金|假千金|亲生女儿|被抱错的女儿/iu],
 ["白月光","#8d5262",/白月光|错认.{0,10}(初恋|救命恩人|恋人)/iu],
 ["追妻火葬场","#a34a52",/追妻火葬场|追悔莫及.{0,10}挽回|离婚后.{0,15}求复合/iu],
 ["契约婚姻","#8d5262",/契约婚姻|契约结婚|婚姻契约|婚姻协议|假结婚|假婚|协议结婚|只领证不恋爱/iu],
 ["先婚后爱","#af6078",/先婚后爱|闪婚|婚后.{0,12}(心动|爱上|相爱|追求)|领证.{0,12}(恋爱|心动|求亲)/iu],
 ["霸总","#9f753e",/霸总|总裁|太子爷|霸道总裁|首席执行官/iu],
 ["甜宠","#af6078",/甜宠|高甜|宠爱|求亲亲|疯狂追求|宠妻|天天求|偷偷学做饭.{0,6}追/iu],
 ["虐恋","#8d5262",/虐恋|虐心|错过.{0,12}爱情|婚礼前夕.{0,12}取消|被辜负.{0,12}爱情/iu],
 ["合租日常","#7d8a5b",/合租|室友|同居生活/iu],
 ["双向暗恋","#af6078",/双向暗恋|双向奔赴|互相暗恋/iu],
 ["暗恋","#af6078",/暗恋|未寄出的情书|藏了.{0,6}年的喜欢/iu],
 ["死对头","#455a78",/死对头|宿敌|针锋相对的.{0,8}(同学|同事|对手)/iu],
 ["退婚","#713848",/退婚|取消婚礼|撕毁婚约|撕了婚约/iu],
 ["离婚","#713848",/离婚|前夫|离婚协议/iu],
 ["替嫁","#9f753e",/替嫁|代嫁|代替.{0,8}(姐姐|妹妹).{0,6}出嫁/iu],
 ["豪门","#9f753e",/豪门|豪宅|千亿继承人|家族继承|京圈|财阀|少爷/iu],
 ["职场","#507e9a",/职场|工作室|方案竞标|求职|创业|公司.{0,7}客户/iu],
 ["女主觉醒","#a34a52",/女主觉醒|不再讨好|拒绝.{0,12}(替嫁|签字|安排|婚约)|不再做.{0,8}(配角|女配|牺牲品)/iu],
 ["女性成长","#526e68",/女性成长|自我成长|自主选择|事业独立|自己的事业|找回自我|女性独立/iu],
 ["反套路","#713848",/反套路|不按剧情|不演了|拒绝剧本|改写.{0,5}命运/iu],
 ["身份反转","#713848",/身份反转|原来是.{0,8}继承人|隐藏身份|千亿继承人|真少爷|真千金|继承人身份/iu],
 ["打脸","#a34a52",/打脸|反击|翻车|逆风翻盘|全网嘲|前任求复合/iu],
 ["爽文","#9f753e",/爽文|连环打脸|一路逆袭|爽感|轻松打脸/iu],
 ["家庭反击","#a34a52",/家庭反击|拒绝.{0,15}家人|家族索取|家人逼迫|父母.{0,8}偏心/iu],
 ["秘密揭晓","#455a78",/秘密揭晓|秘密.{0,12}真相|七封.{0,6}信|录音.{0,8}真相|旧信.{0,12}秘密/iu],
 ["亲情","#7d8a5b",/亲情|母女|父女|母亲|家人.{0,9}理解|家庭关系/iu],
 ["治愈","#7d8a5b",/治愈|温暖|和解|告别.{0,9}过去|慢慢释怀/iu]
];
const cut=v=>String(v||"").normalize("NFKC").slice(0,12000);
export function suggestStoryTags(data={}){
 const title=cut(data.title||data.book?.title).slice(0,200);
 const synopsis=cut(data.description||data.book?.description).slice(0,2400);
 const chapters=Array.isArray(data.chapters)?
   data.chapters.map(c=>typeof c==="string"?c:c?.title||"").join(" / ").slice(0,3500):
   cut(data.chapter_titles||data.chapterTitles).slice(0,3500);
 // Body can support a candidate, but cannot alone establish a definitive tag.
 const body=cut(data.body||data.excerpt).slice(0,4500);
 const found=[];
 for(const [label,color,pattern] of RULES){
   const areas=[];
   if(pattern.test(title))areas.push("书名");
   if(pattern.test(synopsis))areas.push("简介");
   if(pattern.test(chapters))areas.push("章节标题");
   if(pattern.test(body))areas.push("正文");
   const score=areas.reduce((n,v)=>n+({书名:5,简介:4,章节标题:3,正文:1}[v]),0);
   if(score<3)continue;
   found.push({label,color,score,basis:areas.join("、")});
 }
 found.sort((a,b)=>b.score-a.score||RULES.findIndex(x=>x[0]===a.label)-RULES.findIndex(x=>x[0]===b.label));
 return found.slice(0,5);
}
