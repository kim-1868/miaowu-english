// REVIEW-ONLY candidate for chapters 2–12. No production writes or auto approval.
// Replace Chinese words ONLY when a corresponding existing English word card
// has the same meaning and part of speech. Retain all original word anchors.
// Conservative substitutions are traceable; do not invent new plot events.
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {prepareRainyNightMemberCandidate} from "./prepare-rainy-night-member-candidate.mjs";
import {auditChapterDensity} from "./audit-cet4-word-density.mjs";

// Ordered: specific, grounded phrases first. No inference or text generation.
const RULES=[
 ["旧档案","旧 [[archive]]"],["档案馆","[[archive]] 馆"],["图书管理员","[[librarian]]"],
 ["目击证人","[[witness]]"],["目击者","[[witness]]"],["一份证词","一份 [[testimony]]"],
 ["证人证言","[[testimony]]"],["证言","[[testimony]]"],
 ["临时安置点","临时 [[shelter]]"],["社区居民","[[community]] 的 [[resident]]"],
 ["居民","[[resident]]"],["社区","[[community]]"],["物资清单","物资 [[inventory]]"],
 ["物资供应","[[supply]]"],["物资","[[supply]]"],
 ["借阅记录","借阅 [[record]]"],["登记记录","登记 [[record]]"],["通话记录","通话 [[record]]"],
 ["一条记录","一条 [[record]]"],["旧记录","旧 [[record]]"],
 ["记录表","[[record]] 表"],["原始记录","原始 [[record]]"],
 ["调拨记录","调拨 [[record]]"],["移交记录","移交 [[record]]"],
 ["文字记录","[[transcript]]"],["访谈记录","访谈 [[transcript]]"],
 ["录音笔","[[recording]] 设备"],["录音文件","[[recording]] 文件"],
 ["这段录音","这段 [[recording]]"],["一段录音","一段 [[recording]]"],
 ["录音","[[recording]]"],["笔录","[[transcript]]"],
 ["身份证明","[[identity]] 证明"],["身份信息","[[identity]] 信息"],
 ["个人身份","个人 [[identity]]"],["真实身份","真实 [[identity]]"],
 ["身份","[[identity]]"],["使用权限","[[access]]"],
 ["访问权限","[[access]]"],["权限","[[permission]]"],
 ["调查报告","调查 [[document]]"],["书面文件","书面 [[document]]"],
 ["原始文件","原始 [[document]]"],["一份文件","一份 [[document]]"],["文件","[[document]]"],
 ["原始照片","原始 [[photograph]]"],["一张照片","一张 [[photograph]]"],
 ["照片","[[photograph]]"],["书脊","[[spine]]"],
 ["封条","[[seal]]"],["印章","[[stamp]]"],["邮戳","[[stamp]]"],
 ["签名","[[signature]]"],["水印","[[watermark]]"],["信封","[[envelope]]"],
 ["笔迹","[[handwriting]]"],["便条上的日期","便条上的 [[date]]"],
 ["签署日期","签署 [[date]]"],["日期","[[date]]"],
 ["一条线索","一条 [[clue]]"],["这条线索","这条 [[clue]]"],["线索","[[clue]]"],
 ["可靠的证据","可靠的 [[evidence]]"],["相关证据","相关 [[evidence]]"],
 ["证据","[[evidence]]"],["可靠的证明","可靠的 [[proof]]"],
 ["证明材料","[[proof]] 材料"],
 ["细节","[[detail]]"],["痕迹","[[trace]]"],["资料来源","资料 [[source]]"],
 ["信息来源","信息 [[source]]"],["来源","[[source]]"],
 ["责任","[[responsibility]]"],["承诺","[[promise]]"],
 ["隐私","[[privacy]]"],["秘密","[[secret]]"],
 ["错误记录","错误 [[record]]"],["错误","[[mistake]]"],
 ["差异","[[discrepancy]]"],["问题的后果","问题的 [[consequence]]"],
 ["后果","[[consequence]]"],
 ["书面请求","书面 [[request]]"],
 ["提出申请","提出 [[request]]"],["收到请求","收到 [[request]]"],
 ["一份申请","一份 [[request]]"],["正式申请","正式 [[request]]"],
 ["回执","[[receipt]]"],["收据","[[receipt]]"],
 ["更正","[[correction]]"],["备份","[[backup]]"],
 ["登记簿","[[register]]"],["一条证词","一条 [[testimony]]"],
 ["标签","[[label]]"],["位置","[[position]]"],["轮廓","[[outline]]"],
 ["顺序","[[sequence]]"],["规律","[[pattern]]"],["时间表","[[schedule]]"],
 ["值班表","值班 [[schedule]]"],["计划表","[[schedule]]"],
 ["设备","[[device]]"],["装置","[[device]]"],
 ["风险","[[risk]]"],["警告","[[warning]]"],
 ["做出决定","做出 [[decision]]"],["作出决定","作出 [[decision]]"],
 ["一项选择","一项 [[choice]]"],["另一种选择","另一种 [[choice]]"],
 ["底片","[[negative]]"],["署名","[[signature]]"],
 ["声音","[[voice]]"],["地址","[[address]]"],
 ["技术问题","技术 [[problem]]"], // skipped unless headword exists
 ["认可","[[approve]]"],["批准","[[approve]]"],
 ["核对","[[verify]]"],["核实","[[verify]]"],["查证","[[verify]]"],
 ["确认","[[confirm]]"],["识别","[[identify]]"],["认出","[[recognize]]"],
 ["放大","[[enlarge]]"],["保存","[[preserve]]"],["保留","[[retain]]"],
 ["恢复","[[restore]]"],["修复","[[repair]]"],["修补","[[repair]]"],
 ["删除","[[remove]]"],["移除","[[remove]]"],
 ["解释","[[explain]]"],["承认","[[admit]]"],["回应","[[respond]]"],
 ["答复","[[respond]]"],["否认","[[deny]]"],
 ["保护","[[protect]]"],["保持","[[maintain]]"],
 ["比较","[[compare]]"],["收集","[[collect]]"],["整理收集","整理 [[collect]]"],
 ["调查清楚","[[investigate]] 清楚"],["调查","[[investigate]]"],
 ["搜索","[[locate]]"],["找到","[[locate]]"],
 ["发现","[[notice]]"],["注意到","[[notice]]"],

 ["紧急情况","[[emergency]]"],["紧急","[[urgent]]"],
 ["模糊的","[[blurred]] 的"],["匿名的","[[anonymous]]"],
 ["熟悉的","[[familiar]] 的"],["独立的","[[independent]]"],
 ["原始的","[[original]] 的"],["官方的","[[official]]"],
 ["数字化的","[[digital]]"],["自动的","[[automatic]]"],
 ["安全的","[[secure]]"],["合法的","[[legal]]"],
 ["公开透明的","[[transparent]]"],["最近的","[[recent]]"],
 ["可疑的","[[suspicious]]"],["失踪的","[[missing]]"],
 ["隐藏的","[[hidden]]"],["以前的","[[former]]"],
 ["承认错误","[[admit]] 这一 [[mistake]]"],["签署申请","签署 [[request]]"],
 ["一封道歉信","一封 [[apology]] 信"],
 ["误会","[[confuse]]"], // skipped if unnatural; audit required
 ["个人信息","个人 [[detail]]"], // skipped if semantically imprecise via excluded below
];
// Chapter-scoped substantive edits: only exact original phrases may match.
// Each replacement must preserve surrounding story facts and original anchors.
const EXTRA={
 2:{
  1:[["予安没有动。","予安没有动。男人的 [[identity]] 仍是个谜，她不愿把信箱的一声轻响当成 [[evidence]]。"],["“先别碰那只箱子。”他说。","“先别碰那只箱子。”他说，语气像一句 [[warning]]。"]],
  6:[["予安不打算凭一张旧证件相信他。","予安不打算仅凭一张旧证件就确认他的 [[identity]]，还需要独立的 [[proof]]。"]],
  7:[["借阅日期","借阅 [[date]]"],["予安发现他的字不像信上那样右倾","予安发现他的 [[handwriting]] 不像信上那样右倾"],["她暗暗松了口气","这个 [[detail]] 让她暗暗松了口气"]],
  10:[["借阅档案","借阅 [[archive]]"],["而是更早的一个冬天","而是更早的一个冬天，这段时间差可能是新的 [[clue]]"]],
  14:[["每张背面都盖有日期","每张背面都写着 [[date]]"],["第47号卡的正面记录完好","第47号卡的正面是一份完整的借阅 [[record]]"]],
  15:[["“你一直知道这里有问题？”她问。","“你一直知道这里有问题？”她问，想追查这处 [[discrepancy]] 的 [[source]]。"]],
  21:[["“这个表是谁填的？”予安问。","“这份 [[record]] 是谁填的？”予安问。"],["所有日期都对得上","所有 [[date]] 都对得上"]],
  36:[["第二封信的封面","第二只 [[envelope]] 上"],["周砚看见这行字，缓缓后退。","周砚看见这行字，缓缓后退。予安觉得他的反应是一条新的 [[clue]]。"]],
  38:[["她正想问个明白，书店灯突然熄灭。","她正想弄清这条 [[clue]]，书店却再次发生 [[outage]]，灯突然熄灭。"],["那张归还单编号的前半段","那份 [[record]] 上编号的前半段"]],
 },
 3:{
  1:[["灯熄灭的瞬间","突然 [[outage]] 的瞬间"],["归还单编号的前半段","归还 [[record]] 上编号的前半段"]],
  2:[["统一使用的数字前缀","统一使用的编号 [[pattern]]"],["他只说得出前缀，不能说出整张单据的内容。","他只说得出前缀，不能 [[confirm]] 整张单据的其他 [[detail]]。"]],
  19:[["一片可活动的隔板","一片可活动的隔板，这处 [[detail]] 提示信箱还有旧 [[mechanism]]"],["还不知道隔板何时会松开","还无法 [[predict]] 隔板何时会松开"]],
  21:[["上面把每天二十三点四十七分标为旧馆门禁切换时间","上面标着旧馆门禁的 [[timing]]：每天二十三点四十七分"],["匿名信中那句","那封 [[anonymous]] 信里那句"]],
  26:[["有人知道箱子会在那时掉下一封信","有人知道信箱的 [[mechanism]] 会在那时掉下一封信"],["分清巧合和经过安排的事情","分清巧合与刻意安排的 [[pattern]]"]],
  35:[["信中的笔迹比第一封更凌乱","信中的 [[handwriting]] 比第一封更凌乱"],["墨迹尚未完全干透","墨迹尚未完全干透，这个 [[detail]] 让她心头一紧"],["它警告她，下一次停电不会是意外","那条 [[warning]] 提醒她，下一次 [[outage]] 可能不是意外"]],
 },
 4:{
  2:[["备用电源会保留系统时间","备用电源能够 [[retain]] 系统时间"],["那部分访问记录","那部分访问 [[record]]"]],
  8:[["两个日期接近的事件","两个 [[date]] 接近的事件"],["予安决定先去申请查看可以公开的历史维护说明","予安准备提交一份 [[request]]，查阅可以公开的历史维护说明"]],
  20:[["家属关系、申请目的和所需时间段","家属 [[identity]]、申请目的和需要查阅的 [[date]] 范围"],["带受理编号的小票","带受理编号的 [[receipt]]"]],
  21:[["她决定先通过公开联系方式留下请求，得到同意后再谈","她决定通过 [[official]] 联系方式提出 [[request]]，得到对方的 [[consent]] 后再谈"]],
  22:[["予安把小票放进书包","予安把那张 [[receipt]] 放进书包"],["拒绝也应该有理由","正式的 [[decision]] 也应该有理由"],["我知道自己问的是什么问题","我能 [[confirm]] 自己问了什么问题"]],
  30:[["那份申请批下来","那份 [[request]] 获得批准"],["仍在街区生活的人","仍在街区生活的 [[resident]]"]],
  35:[["可公开复印件","可公开的 [[document]] 副本"],["一条陌生短信","一条来自未知 [[source]] 的短信"]],
  36:[["一张监控屏幕照片","一张监控屏幕的 [[photograph]]"],["一叠资料装进纸箱","一叠 [[document]] 装进纸箱"],["帽檐压得很低","帽檐压得很低，难以辨认他的 [[identity]]"]],
 },
 5:{
  1:[["陌生短信里的照片","陌生短信里的 [[photograph]]"],["没有证明周砚说谎","还不足以成为周砚说谎的 [[evidence]]"],["只有在灯光斜照时才看得见","这个 [[detail]] 只有在灯光斜照时才看得见"]],
  11:[["她渐渐学会了不把愿意帮助自己的人置于麻烦之中。","她逐渐 [[recognize]] 到打探 [[privacy]] 的界限，不愿让好心人惹上麻烦。"]],
  16:[["失踪前姐姐把一本旧词典托付给自己保管","姐姐 [[disappear]] 前，曾把一本旧词典托付给她保管"],["普通嘱咐","普通的 [[warning]]"]],
  27:[["整理证据","整理 [[evidence]]"],["那张合影","那张 [[photograph]]"]],
  28:[["第47号借书卡","第47号借书 [[record]]"],["她终于想明白","这条 [[clue]] 让她想到"]],
  29:[["她把相同的信息分别写在两张卡上","她把同一条 [[record]] 分别写在两张卡上"],["把这个发现告诉所有人","向所有人 [[reveal]] 这个发现"],["证据只留在自己手中","[[evidence]] 只留在自己手中"]],
  36:[["书脊与封面之间","[[spine]] 与封面之间"],["里面确实藏着一层额外的纸","里面确实有一层 [[hidden]] 的额外纸页"],["纸上写着一个名字，恰好是她童年老师的姓","纸上写着一个名字，这个 [[detail]] 恰好是她童年老师的姓"]],
 },
 6:{
  1:[["她不敢自行剪断","她想 [[preserve]] 原貌，因此不敢自行剪断"],["封面与破损处的照片","封面与破损处的 [[photograph]]"]],
  10:[["第三人手上却是浅色布手套","第三人的 [[identity]] 仍无法核实，手上却是浅色布手套"],["予安想起童年时曾有一位老师","这个 [[detail]] 让予安想起童年时的一位老师"]],
  18:[["邱老师总能记住每个学生喜欢的书","邱老师的 [[memory]] 很好，总能记住每个学生喜欢的书"],["第三人的身形让予安想起","第三人那 [[familiar]] 的身形让予安想起"]],
  22:[["那个名字和邱老师的名字太像了","那个名字和邱老师的名字太像了，这处 [[detail]] 让她警觉"],["签名不应该混为一谈","[[signature]] 不应该混为一谈"]],
  29:[["与借阅卡编号再次重合","与借阅 [[record]] 的编号再次重合"],["又怕有人正等着她行动","但这个 [[detail]] 也让她担心有人正等着她行动"]],
  30:[["照片中的轮廓","[[photograph]] 中的轮廓"],["旧箱的存放记录","旧箱的存放 [[record]]"]],
  32:[["姐姐在学生时代的合影","姐姐在学生时代的 [[photograph]]"]],
  37:[["既然明天能当面核对","既然明天能当面 [[verify]]"],["把对方这句话原样记下","把对方这句话存为一条 [[record]]"]],
 },
 7:{
  1:[["她害怕自己会在见到邱老师时忘记要问什么","她怕自己的 [[memory]] 不可靠，见到邱老师就忘了要问什么"]],
  20:[["他曾想把这件事交给成年人处理，却没想到拖延本身也会造成伤害","他以为交给成年人就能 [[protect]] 学生家庭，却没想到自己的 [[delay]] 也让人受了伤"]],
  26:[["比任何一张照片都复杂","比任何一张 [[photograph]] 都复杂"],["负责发放的人接连换班","负责 [[distribute]] 物资的人接连换班"]],
  35:[["不保证对方一定回复","也不能 [[confirm]] 对方一定会 [[respond]]"]],
 },
 8:{
  2:[["维护记录","维护 [[record]]"],["延迟槽里的纸件","延迟 [[storage]] 槽里的纸件"],["旧信箱每晚二十三点四十七分会释放","旧信箱按照 [[schedule]]，每晚二十三点四十七分会释放"]],
  6:[["旧馆下班时间","旧馆当年的 [[schedule]]"],["整条时间线","整条事件 [[sequence]]"]],
  10:[["旧箱说明书","旧 [[device]] 的说明书"],["没有打开线路，也没有擅自拆掉信箱","没有擅自 [[remove]] 线路，也没有拆掉信箱"]],
  11:[["收纸本归还单","收纸本归还 [[record]]"],["在固定时间松开","按预设 [[schedule]] 松开"]],
  12:[["第一封信不是预知了灰大衣男人的到来","第一封信不可能 [[predict]] 灰大衣男人何时到来"],["把时钟写进了警告","把时钟写进了 [[warning]]"]],
  17:[["检查记录","检查 [[record]]"],["那条维修记录","那份维修 [[document]]"]],
  24:[["登记延迟","登记 [[delay]]"],["原始纸件","[[original]] 纸件"]],
  30:[["一句道歉","一句 [[apology]]"],["实质性的纠错","有实际效果的 [[correction]]"]],
  38:[["姐姐留给她的短句","姐姐留给她的 [[warning]]"],["那些一直没有拿到物资的人","那些一直没有拿到 [[supply]] 的人"],["信箱的规律","信箱的 [[pattern]]"]],
 },
 9:{
  2:[["名单显示他们已经领取","系统 [[record]] 显示他们已经领取"],["签收单却一片空白","[[receipt]] 却一片空白"]],
  8:[["苏阿姨在录音前","苏阿姨在 [[recording]] 前"],["只希望准确写下","只希望留下 [[accurate]] 的 [[record]]"]],
  20:[["没人留下完整的交接说明","没人留下完整的交接 [[record]]"],["但公开日志中至少保留了搬运车辆的到达时间","但那份公开 [[document]] 至少记载了搬运车辆的到达时间"]],
  26:[["清单上记录着","[[inventory]] 上列着"],["最紧张的是干净饮水","最担心的是饮水 [[shortage]]，连干净的水都难找"]],
  35:[["姐姐的话顿了一下","姐姐的 [[voice]] 停顿了一下"],["这些人不能再被当成表格里的空格","这些 [[resident]] 不能再被当成表格里的空格"]],
 },
 10:{
  6:[["而不是逼自己选择一种","而不是逼自己只做一种 [[choice]]"]],
  10:[["公布居民名单","公开居民 [[identity]] 名单"],["尚未证实的信息","尚未 [[verify]] 的信息"]],
  11:[["姐姐却主动走开了两年","姐姐却主动 [[disappear]] 了两年"],["这种矛盾让她生气","这种 [[conflict]] 让她生气"]],
  20:[["没有早点问清楚那场雨夜到底发生过什么","没有早点 [[verify]] 那场 [[emergency]] 到底发生了什么"]],
  31:[["立即公开所有材料","立刻 [[disclose]] 所有材料"],["真正生活在街区里的人","真正生活在街区里的 [[resident]]"]],
  32:[["补齐自己当年参与登记的那部分记录","补齐自己当年参与登记的那部分 [[record]]"],["予安第一次没有反驳他","予安 [[accept]] 了这一点，没有再反驳"]],
  39:[["书脊里取出的索引","[[spine]] 里取出的索引"],["谁在当年借走了那一页","谁在当年借走了那份 [[document]] 的那一页"],["最简单的问题","最需要 [[verify]] 的问题"]],
 },
 11:{
  2:[["四个安置点","四个 [[shelter]]"],["数字本身并不惊人，却和苏阿姨当年实际领到的东西差了一大截","数字本身并不惊人，但那条 [[record]] 与苏阿姨实际领到的东西存在明显 [[discrepancy]]"]],
  5:[["事实认定不是现场讨论能完成的","要有 [[evidence]] 才能作出事实认定，不能只在现场讨论"]],
  28:[["个人姓名","居民的 [[identity]]"],["通过可追溯的手续寄存进资料馆","凭可追溯的 [[record]] 寄存进资料馆"]],
  37:[["姐姐留下的最后一张借阅证","姐姐留下的最后一张借阅 [[record]]"],["上面写着一个地点和一个时间","上面留着两条 [[clue]]：一个地点和一个时间"],["予安刚要问姐姐是否真的会来","予安还不能 [[confirm]] 姐姐是否真的会来"]],
  38:[["正式查阅回执","正式查阅 [[receipt]]"],["姐姐已经到来的证明","姐姐已经到来的 [[proof]]"],["上面画着小小的星星","上面画着她很 [[familiar]] 的小星星"]],
 },
 12:{
  1:[
   ["她将书店打扫了一遍","她 [[prepare]] 好书店，先打扫了一遍"],
   ["又把两只杯子放在同一张桌子上","又把两只杯子放在同一张桌子上，像在守着一个 [[promise]]"]
  ],
  2:[
   ["一个瘦了许多的女人缓缓走近","一个瘦了许多的女人缓缓 [[approach]] 书店门口"],
   ["她没有立刻说话","她 [[hesitate]] 片刻，没有立刻说话"]
  ],
  4:[["褪色的深蓝外套","褪色的、款式依然 [[familiar]] 的深蓝外套"]],
  6:[["予安看见姐姐仍习惯把杯柄朝左，忽然想起小时候争着用同一只杯子的早晨",
     "予安 [[notice]] 到姐姐依然把杯柄朝左，这个 [[familiar]] 的小 [[detail]] 让她想起小时候争着用同一只杯子的早晨"]],
  7:[
   ["明知记录不对","明知那份 [[record]] 不对"],
   ["希望通过正式渠道","希望通过 [[official]] 渠道"],
   ["没有凭据的指责","缺少 [[evidence]] 的指责"]
  ],
  8:[
   ["她以为切断联系就能让妹妹远离压力","她以为不再 [[contact]] 家人，就能让妹妹远离压力"],
   ["却没有想到沉默会伤害家人","却没有想到沉默这一 [[decision]] 也会伤害家人"],
   ["她没有要求妹妹立即原谅","她没有要求妹妹立即 [[forgive]]"]
  ],
  9:[["没有再用“为了你好”解释所有决定","没有再用“为了你好”来 [[explain]] 过去的每个 [[decision]]"]],
  11:[
   ["为自己的失联表达歉意","为自己的失联表达 [[apology]]"],
   ["却不要求妹妹立即回应","却不要求妹妹立即 [[respond]]"]
  ],
  13:[["那顿早餐并没有神奇地消除隔阂","那顿早餐并没有神奇地 [[remove]] 隔阂"],["最后都笑了","最后都笑了，像终于找到一点 [[relief]]"]],
  28:[
   ["书店依旧照常迎客","书店依旧保持过去的 [[routine]]，照常迎客"],
   ["姐姐说，未来不必再把每个疑问变成 ","姐姐说，往后的 [[future]] 不必再把每个疑问变成 "]
  ],
  29:[
   ["她开始计划为书店建立一个清晰的借阅登记系统","她开始为书店 [[prepare]] 一套清晰的借阅 [[register]] 系统"],
   ["让每一次借出和归还都有完整的时间与凭证","让每一次借出和 [[return]] 都留下可以核对的 [[record]] 与凭证"]
  ],
  30:[["把故障和维修历史也如实记录","把故障和 [[repair]] 历史也如实记录"]],
  32:[["明确标记每张纸件的收到时间和归还人","用 [[accurate]] 的 [[record]] 标明每张纸件的收到时间和归还人"]],
  37:[["背面没有姓名","背面没有能 [[identify]] 持有者的姓名"]]
 }
};
const UNUSABLE=new Set(["problem","confuse"]); // no headword or wrong grammatical usage
const forbidden=new Set(["个人信息"]);
const TOKEN=/\[\[([a-z]+)\]\]/g;
const hanCount=s=>(s.match(/\p{Script=Han}/gu)||[]).length;
const packText=p=>p.segments.map(x=>x.wordId?"[["+x.surface+"]]":x.text).join("");
const segmentize=(text,wordByName)=>{
 const s=[];let from=0;
 for(const match of text.matchAll(TOKEN)){
  if(match.index>from)s.push({text:text.slice(from,match.index)});
  const w=wordByName.get(match[1]);if(!w)throw Error("MISSING_WORD_ID_"+match[1]);
  s.push({wordId:w.id,surface:w.headword,gloss:w.meaningZh.split("；")[0]});
  from=match.index+match[0].length;
 }
 if(from<text.length)s.push({text:text.slice(from)});
 return {segments:s};
};
function replaceOnlyPlain(text,before,after){
 const parts=text.split(/(\[\[[a-z]+\]\])/g);
 let used=0;
 for(let i=0;i<parts.length;i+=2){
  const p=parts[i];
  const idx=p.indexOf(before);
  if(idx<0)continue;
  // Avoid invalid whitespace-only text segments between two English anchors.
  // If the exact phrase touches a previously-anchored word, decline this
  // substitution rather than force a misleading connector.
  const beforeText=p.slice(0,idx),afterText=p.slice(idx+before.length);
  const prevIsAnchor=i>0&&/^\[\[[a-z]+\]\]$/.test(parts[i-1]);
  const nextIsAnchor=i+1<parts.length&&/^\[\[[a-z]+\]\]$/.test(parts[i+1]);
  if(prevIsAnchor&&!beforeText.trim()&&after.startsWith("[["))continue;
  if(nextIsAnchor&&!afterText.trim()&&after.endsWith("]]"))continue;
  parts[i]=beforeText+after+afterText;
  used++;break;
 }
 return used?parts.join(""):text;
}
export function buildChapters2to12DensityCandidate(){
 const {candidate}=prepareRainyNightMemberCandidate();
 const byName=new Map(candidate.words.map(w=>[w.headword,w]));
 if(candidate.chapters.length!==12||candidate.words.length!==188)throw Error("SOURCE_INVENTORY_DRIFT");
 const rules=RULES.filter(([from,to])=>!forbidden.has(from)&&
  [...to.matchAll(TOKEN)].every(match=>byName.has(match[1])&&!UNUSABLE.has(match[1])));
 const output=[],audit=[],unappliedExtras=[];
 for(const original of candidate.chapters.slice(1)){
  let replacements=0,underfilled=0,sourceMentions=0;
  const paragraphs=original.paragraphs.map((p,pi)=>{
   let source=packText(p);
   const originalWords=(source.match(TOKEN)||[]).length;
   const added=[];
   for(const [before,after] of (EXTRA[original.number]?.[pi+1]||[])){
    const candidate=replaceOnlyPlain(source,before,after);
    if(candidate===source){unappliedExtras.push({chapter:original.number,paragraph:pi+1});continue;}
    source=candidate;
    for(const m of after.matchAll(TOKEN))added.push(m[1]);
   }
   const counts=new Map();
   for(const m of source.matchAll(TOKEN))counts.set(m[1],(counts.get(m[1])||0)+1);
   // Spread word exposures across sentences rather than concentrating all in
   // one introductory clause. The review gate still checks human readability.
   const sentences=source.split(/(?<=[。！？])/u);
   const countIn=t=>(t.match(TOKEN)||[]).length;
   const total=()=>sentences.reduce((n,t)=>n+countIn(t),0);
   const insertIn=(i)=>{
    if(total()>=6)return false;
    for(const [from,to] of rules){
     const inserted=[...to.matchAll(TOKEN)].map(m=>m[1]);
     const currentSentenceWords=new Set([...sentences[i].matchAll(TOKEN)].map(m=>m[1]));
     if(inserted.some(w=>(counts.get(w)||0)>=2||currentSentenceWords.has(w))||
        total()+inserted.length>6)continue;
     const next=replaceOnlyPlain(sentences[i],from,to);
     if(next===sentences[i])continue;
     sentences[i]=next;replacements+=inserted.length;
     inserted.forEach(w=>{counts.set(w,(counts.get(w)||0)+1);added.push(w)});
     return true;
    }
    return false;
   };
   // First, cover substantive sentences that would otherwise have zero or
   // one word exposure (at least 25 Chinese characters each).
   for(let i=0;i<sentences.length;i++){
    if(hanCount(sentences[i])<25)continue;
    while(countIn(sentences[i])<2&&total()<6&&insertIn(i)){}
   }
   // Then fill paragraph minimum; prefer long underexposed sentences.
   for(let attempt=0;attempt<7&&total()<5;attempt++){
    const order=sentences.map((t,i)=>({i,words:countIn(t),han:hanCount(t)}))
     .sort((a,b)=>(a.words-b.words)||(b.han-a.han));
    let changed=false;
    for(const item of order){
     if(insertIn(item.i)){changed=true;break;}
    }
    if(!changed)break;
   }
   const draft=sentences.join("");
   const next=segmentize(draft,byName);
   const wordCount=next.segments.filter(x=>x.wordId).length;
   if(wordCount<3)underfilled++;
   if(wordCount>6)throw Error("TOO_MANY_WORDS_"+original.number+"_"+pi);
   if(originalWords>wordCount)throw Error("ORIGINAL_ANCHOR_LOST");
   // Check every original annotation is preserved and in original order.
   const oldIds=p.segments.filter(x=>x.wordId).map(x=>x.wordId);
   const allIds=next.segments.filter(x=>x.wordId).map(x=>x.wordId);
   let cursor=0;for(const id of oldIds){
    cursor=allIds.indexOf(id,cursor);
    if(cursor<0)throw Error("ANCHOR_ORDER_LOST_"+original.number+"_"+pi);
    cursor++;
   }
   sourceMentions+=originalWords;
   audit.push({chapter:original.number,paragraph:pi+1,originalWords,newWords:wordCount,
    proposedAdded:added,needsManualRewrite:wordCount<3,
    humanReviewRequired:true});
   return next;
  });
  output.push({...original,paragraphs});
 }
 const chapterReports=output.map(ch=>{
  const density=auditChapterDensity(ch);
  return {chapter:ch.number,paragraphs:ch.paragraphs.length,occurrences:density.occurrences,
   avgPerParagraph:density.averagePerParagraph,per100Han:density.occurrencesPer100Han,
   sentenceViolations:density.sentenceViolations,meetsStrictTarget:density.passedDensity,
   underfilledParagraphs:audit.filter(x=>x.chapter===ch.number&&x.needsManualRewrite).length};
 });
 const sum=chapterReports.reduce((a,x)=>a+x.occurrences,0);
 const originalCount=candidate.chapters.slice(1).flatMap(ch=>ch.paragraphs.flatMap(p=>p.segments)).filter(x=>x.wordId).length;
 return {chapters:output,audit,
  report:{sourceBookId:candidate.book.id,chapterCount:11,sourceAnchors:originalCount,
   candidateAnchors:sum,additionalAnchors:sum-originalCount,
   underfilledParagraphs:audit.filter(x=>x.needsManualRewrite).length,
   underfilledChapters:chapterReports.filter(x=>x.underfilledParagraphs>0).length,
   unappliedExtras,unappliedExtraCount:unappliedExtras.length,
   chapterReports,reviewStatus:"PROVISIONAL_WORD_REPLACEMENTS_NOT_APPROVED",
   productionD1Touched:false,readyToPublish:false}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const output=buildChapters2to12DensityCandidate();
  if(process.argv.includes("--write-private")){
   mkdirSync(resolve("private-output"),{recursive:true,mode:0o700});
   writeFileSync(resolve("private-output/rainy-night-ch02-ch12-LEXICAL-DRAFT.json"),
    JSON.stringify(output,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});
  }else if(!process.argv.includes("--summary"))throw Error("Usage: --summary | --write-private");
  process.stdout.write(JSON.stringify(output.report,null,2)+"\n");
 }catch(e){console.error(e.message);process.exitCode=1}
}
