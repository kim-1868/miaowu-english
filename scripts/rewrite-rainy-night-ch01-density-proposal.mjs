// Private editorial experiment: high-density rewrite of Rainy Night chapter one.
// Never changes canonical manuscript, production D1, or member entitlement.
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {prepareRainyNightMemberCandidate} from "./prepare-rainy-night-member-candidate.mjs";
const R={
1:[["店里没有人进来过。","店里没有 [[witness]] 看见有人进来，也没有一条能够 [[confirm]] 投递时间的监控 [[record]]。"]],
2:[["没有姓名，没有地址。","没有寄件人的 [[identity]] 信息，也没有地址，仿佛刻意保留一个 [[secret]]。"],["她刚要把它收进失物盒","她刚要把这份陌生的 [[document]] 收进失物盒"],["纸张带着书店旧信笺才有的细小水印","纸张带着旧信笺才有的细小水印，像有人故意留下的一条 [[clue]]"]],
3:[["柜台最里侧的抽屉一直锁着。","柜台最里侧的抽屉一直锁着，旁边那份借阅 [[record]] 却留着一行空白。"],["书脊上有一道修补过的裂口。","书脊上有一道修补过的裂口，旁边还留着一道浅浅的 [[trace]]。"],["至今没人能解释是谁送来的。","至今没有 [[witness]] 能 [[confirm]] 是谁送来的，也没有人能 [[recognize]] 那只装书的纸袋。"]],
4:[["有人自称目击者","有人自称 [[witness]]"],["按日期一张张编号。","按日期做成 [[record]]，再一张张编号。"],["她不再相信任何突然出现的好消息","她开始 [[suspect]] 每个突然出现的好消息"]],
5:[["这些相互矛盾的细节","这些相互矛盾的 [[detail]]"],["她把证言分别写下","她把证言分别写成 [[record]]"]],
6:[["纸张也可能从仓库里被翻出来。","纸张也可能从仓库里被翻出来，无法据此 [[confirm]] 寄信人的 [[identity]]。"],["她拿出放大镜检查水印的边缘","她拿出放大镜 [[investigate]] 水印边缘的一道 [[trace]]"]],
7:[["它的封边压得很平整","它的封边压得很平整，像有人试图 [[restore]] 原来的折痕"],["和抽屉里旧借阅卡上的花纹相似","和抽屉里旧借阅 [[record]] 上的花纹相似"],["她想，也许有人不是今天才准备写这封信。","她怀疑纸张里还有尚未 [[reveal]] 的 [[secret]]。"]],
8:[["林予安的手指停在封口处。","林予安的手指停在封口处，[[hesitate]] 了片刻。"],["那行字看起来格外 [[familiar]]。","那行字的每个 [[detail]] 都让她觉得格外 [[familiar]]。"],["终于认出那微微向右倾斜的","终于 [[recognize]] 那微微向右倾斜的"],["和姐姐林予宁的一模一样。","和姐姐林予宁的一模一样，但她还不敢把它当成 [[evidence]]。"]],
9:[["警方没有找到可靠线索","警方没有找到可靠 [[clue]]，也没有 [[witness]] 能 [[confirm]] 她最后的去向"],["把它放在收银台后面最靠里的抽屉。","把它放在收银台后面最靠里的抽屉，连当年的借阅 [[record]] 都舍不得扔。"]],
10:[["第一句是：","第一句是一条 [[warning]]："],["穿灰色大衣的男人","那个 [[suspicious]] 的灰大衣男人"],["十一点四十三分。","十一点四十三分。她立刻把时间写进 [[record]]，却无法 [[confirm]] 这条消息背后的 [[secret]]。"]],
11:[["只有家人才知道的习惯","只有家人才知道的 [[secret]] 习惯"],["那个点小得恰好","那个 [[detail]] 小得恰好"],["只把台灯往近处移了移。","只把台灯往近处移了移，想再 [[investigate]] 纸张上的另一道 [[trace]]。"]],
12:[["父亲则把所有旧账册收到楼上。","父亲则把所有旧账册和 [[document]] 收到楼上，旧 [[record]] 都被封存。"],["她告诉朋友这只是习惯","她告诉朋友这只是习惯，却无法 [[confirm]] 真正的原因"]],
13:[["一道很浅的压痕。","一道很浅的 [[trace]]。"],["不是邮戳","不是 [[stamp]] 留下的印痕"],["某本厚书的页码。","某本厚书上 [[hidden]] 的页码。"]],
14:[["几乎要对着灯才能看清","几乎要对着灯才能 [[recognize]] 字迹"],["这行字的最后一个句号","这条 [[warning]] 的最后一个句号"],["姐姐小时候常用的小星星。","姐姐小时候常用的小星星，是她极为 [[familiar]] 的细小 [[detail]]。"]],
15:[["这封信不是有人故意戏弄","这封信不是某人捏造的 [[secret]] 玩笑"],["于是打开收银台旁的监控电脑","于是打开收银台旁的监控电脑，查找可以验证日期的 [[record]]"],["今天系统却说她的身份不存在。","今天系统却说她的 [[identity]] 不存在。"]],
16:[["门铃响了。","门铃响了，像一条迟到的 [[warning]]。"],["男人先看了眼墙上时钟，然后才把伞收起来。","男人没有立刻 [[approach]] 柜台，只盯着墙上时钟，像要 [[confirm]] 某个 [[urgent]] 的期限，才把伞收起来。"]],
17:[["一个陌生的管理员名称。","一个陌生管理员的 [[identity]]。"],["她决定先保存眼前的错误提示。","她决定先保存眼前的 [[warning]] 提示，并把这处 [[detail]] 写进笔记。"]],
18:[["想确认有没有人一直守在书店附近。","想 [[confirm]] 有没有人一直守在书店附近。"],["也看不清驾驶座。","也看不清驾驶座，只能记下一个模糊的 [[detail]]。"],["她不愿把每个巧合都当作 [[suspicious]] 的迹象。","她不愿把每个巧合都当作 [[suspicious]] 的 [[evidence]]。"]],
19:[["来电显示是一串看不全的旧号码。","来电显示是一串看不全的旧号码，无法确认来电者的 [[identity]]。"],["予安把它抄在纸上","予安把它抄成一条 [[record]]"],["消息就会传到不该听见的人那里。","这个 [[secret]] 就会传到不该听见的人那里。"]],
20:[["把已知事实与猜测分成两栏","把可以 [[confirm]] 的事实与猜测分成两栏"],["保留来电时间。","保留来电时间这个关键 [[detail]]。"]],
21:[["旧猫形镇纸","旧猫形镇纸，姐姐留下的 [[familiar]] 物件"],["信封内侧有一条淡淡的铅笔线。","信封内侧有一条淡淡的 [[trace]]。"],["似乎指向店里某个书架","似乎指向店里某个书架，像要 [[reveal]] 一条路径"]],
22:[["那人没有立刻走进来","那人没有立刻走进来，似乎在 [[hesitate]]"],["他的目光略过一整面书架","他的目光略过一整面书架，像在寻找某个 [[hidden]] 的东西"],["予安下意识把抽屉向里推了推。","予安 [[notice]] 到他的视线，意识到那本书有被 [[borrow]] 走的 [[risk]]，下意识把抽屉向里推了推。"]],
23:[["男人问。","男人问，显然已经知道一个 [[secret]]。"],["却不敢露出表情。","却不敢 [[reveal]] 自己的表情。"],["便没有回答。","便没有 [[respond]]，也没让对方 [[confirm]] 自己是否认得这个名字。"]],
24:[["他说","他说，声音让她觉得 [[familiar]]"],["有人告诉我，它一直在这里。","有人留下过一条 [[clue]]，说它一直在这里。"],["他念出书名时停顿了一下，像是在确认自己说对了每个字。","他念出书名时 [[hesitate]] 了一下，像要 [[confirm]] 自己说对了每个字。"]],
25:[["如果把书交出去，她可能会失去唯一的 [[clue]]；","如果把书交出去，她可能会失去唯一的 [[clue]]，也失去 [[investigate]] 线索的机会；"],["永远不知道姐姐发生了什么。","永远不知道姐姐 [[disappear]] 前发生了什么。"],["听见窗外雨声忽然变大。","听见窗外雨声忽然变大，像另一声 [[warning]]。"]],
26:[["与这条商业街的人行道很不相同。","与这条商业街的人行道很不相同，像某条 [[hidden]] 路线留下的 [[trace]]。"],["一栋已经拆除的资料馆。","一栋已经拆除的资料馆，那里或许藏着另一个 [[secret]]。"]],
27:[["姐姐曾把失踪案件的新闻剪报折在一本厚词典里","姐姐曾把一份旧 [[document]] 折在一本厚词典里，那是关于失踪案件的新闻剪报"],["她决定保留照片原样","她决定保留照片原样，按时间制作 [[record]]"]],
28:[["试探。","试探，仿佛等她 [[respond]]。"],["把信纸折好","把藏着 [[secret]] 的信纸折好"],["先弄清对方为什么知道","先 [[investigate]] 对方为什么知道"]],
29:[["有效的借阅卡。","能够核对 [[identity]] 的有效借阅卡。"],["这个细节让她 [[hesitate]]。","这个 [[detail]] 让她 [[hesitate]]。"],["曾换过版本","曾换过版本，旧 [[record]] 已经被封存"]],
30:[["男人沉默了几秒","男人 [[hesitate]] 了几秒"],["他从大衣口袋里拿出一张照片","他从大衣口袋里拿出一张可能 [[reveal]] 一些 [[detail]] 的照片"],["却没有立刻递给她。","却没有立刻递给她，像守着某个 [[secret]]。"]],
31:[["照片里的姐姐站在这家书店门前。","照片里的姐姐，那个已经 [[disappear]] 的人，站在这家书店门前。"],["男人把照片慢慢翻向灯光","男人把照片慢慢翻向灯光，想 [[confirm]] 暗影中的 [[detail]]"],["那个人背对着镜头","那个人的 [[identity]] 无从辨认，背对着镜头"]],
32:[["继续追问，或者立刻关门报警。","继续追问，或者立刻关门报警，让警方 [[investigate]]。"],["因为照片背面的日期","因为照片背面写着一个可以 [[confirm]] 的 [[detail]]：日期"]],
33:[["异常清楚。","异常清楚，像故意留下的 [[clue]]。"],["没有让男人碰到信封","没有让这个 [[suspicious]] 的男人碰到信封"],["却没听清争执内容。","却没听清争执内容，也没有留下音频 [[record]]。"]],
34:[["又问为何隔了两年才拿来。","又问为何隔了两年才拿来，想 [[investigate]] 真正来源。"],["男人沉默很久","男人 [[hesitate]] 很久"],["关键是他愿意留下什么。","关键是他愿意留下什么 [[evidence]]。"]],
35:[["准备保留一份谈话 [[record]]。","准备保留一份 [[accurate]] 的谈话 [[record]]。"],["都精准得可怕。","每个 [[detail]] 都精准得可怕。"],["谁真正知道两年前发生过什么。","谁握有足以 [[reveal]] 两年前真相的 [[evidence]]。"]],
36:[["脸色变了。","脸色变了，像刚 [[recognize]] 到一条 [[warning]]。"],["你把那封信打开了？","你把那只 [[envelope]] 打开了？"],["门外传来金属信箱轻轻合上的声音。","门外传来金属信箱轻轻合上的声音，像某个 [[hidden]] 的 [[secret]] 留下了新的 [[trace]]。"]]
};
const TOKEN=/\[\[([a-z]+)\]\]/g;
const hanCount=s=>(s.match(/\p{Script=Han}/gu)||[]).length;
export function buildHighDensityChapterOneProposal(){
 const {candidate}=prepareRainyNightMemberCandidate();
 const original=candidate.chapters[0];
 if(original.number!==1||original.paragraphs.length!==36||Object.keys(R).length!==36)
  throw Error("OPENING_SOURCE_CHANGED_REVIEW_REQUIRED");
 const wordMap=new Map(candidate.words.map(w=>[w.headword,w]));
 const paragraphs=original.paragraphs.map((p,i)=>{
  let line=p.segments.map(seg=>seg.wordId?"[["+seg.surface+"]]":seg.text).join("");
  const edits=R[i+1];
  for(const [before,after] of edits){
   if(!line.includes(before)||line.indexOf(before)!==line.lastIndexOf(before))
    throw Error("AMBIGUOUS_OR_MISSING_PHRASE_P"+(i+1)+": "+before);
   line=line.replace(before,after);
  }
  const segments=[];let pos=0;
  for(const m of line.matchAll(TOKEN)){
   if(m.index>pos)segments.push({text:line.slice(pos,m.index)});
   const word=wordMap.get(m[1]);
   if(!word)throw Error("UNKNOWN_WORD_"+m[1]);
   segments.push({wordId:word.id,surface:word.headword,gloss:word.meaningZh.split("；")[0]});
   pos=m.index+m[0].length;
  }
  if(pos<line.length)segments.push({text:line.slice(pos)});
  const words=segments.filter(x=>x.wordId).length;
  if(words<3||words>7)throw Error("PARAGRAPH_DENSITY_OUT_OF_RANGE_P"+(i+1)+"="+words);
  return {segments};
 });
 const occurrences=paragraphs.flatMap(x=>x.segments).filter(x=>x.wordId).length;
 const han=hanCount(paragraphs.map(x=>x.segments.map(y=>y.text||"").join("")).join(""));
 const perParagraph=occurrences/paragraphs.length;
 const proposed={...original,paragraphs};
 return {chapter:proposed,report:{chapter:1,originalAnchors:64,occurrences,
  addedAnchors:occurrences-64,han,per100Han:Number((occurrences/han*100).toFixed(2)),
  averagePerParagraph:Number(perParagraph.toFixed(2)),
  privateReviewRequired:true,productionD1Touched:false,sourceOriginalUnchanged:true}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const out=buildHighDensityChapterOneProposal();
  if(process.argv.includes("--write-private")){
   mkdirSync(resolve("private-output"),{recursive:true,mode:0o700});
   writeFileSync(resolve("private-output/rainy-night-ch01-high-density-DRAFT.json"),
    JSON.stringify(out,null,2)+"\n",{mode:0o600,flag:"wx"});
  }else if(!process.argv.includes("--summary"))throw Error("USAGE --summary|--write-private");
  console.log(JSON.stringify(out.report,null,2));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
