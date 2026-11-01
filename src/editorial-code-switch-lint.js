// S60: conservative, non-certifying flags for Chinese+English code-switch editing.
// The classifier catches suspicious syntax only; a flag is NOT proof of an error.
// A clean result is NEVER evidence that a word/occurrence is editorially approved.
export function codeSwitchPosRisk({partOfSpeech="",before="",after=""}={}){
 const p=String(partOfSpeech).trim().toLowerCase();
 const left=String(before).slice(-80).trimEnd();
 const right=String(after).slice(0,80).trimStart();
 const flags=[];
 const verb=p==="v."||p.startsWith("v./")||p.endsWith("/v.");
 const adjective=p==="adj."||p.startsWith("adj./")||p.endsWith("/adj.");
 if(verb){
  // "从最早的一次 contact 开始说" and "每一次 distribute 物资的记录"
  // treat a verb as the head of a Chinese nominal expression.
  if(/(?:的一次|一份|一项|一种|每一次|每一回)\s*$/.test(left))
   flags.push("CODE_SWITCH_VERB_AFTER_NOMINAL_CLASSIFIER");
  // "写下 contact 方式" is a noun compound; a vocabulary card labeled v.
  // needs a proper verbal example or a separate noun-sense analysis.
  if(/^(?:方式|渠道|记录|方案|文件|申请|时间)(?:[，。；：、\s]|$)/.test(right) &&
     /(?:与|和|及|的|留下|写下|注明|记录)\s*$/.test(left))
   flags.push("CODE_SWITCH_VERB_IN_NOUN_MODIFIER_SLOT");
 }
 if(adjective){
  // "保留 original。" leaves an adjective without its head noun.
  if(/^(?:[，。！？；]|不该|就|去向|来源)/.test(right) &&
    /(?:核对|保留|保存|移交|交给|拿到|拿出|留下|保护|检查|找到|要求|收到|存放|收好|签收|递交)\s*$/.test(left))
   flags.push("CODE_SWITCH_ADJECTIVE_HEAD_NOUN_MISSING");
  // "一条 missing 的记录" is worth reviewing for unnecessary 的.
  if(/^的(?:记录|线索|文件|副本|页|方式|材料|报告|证件|信息)/.test(right) &&
     /(?:一[条份张页个]|两[条份张页个]|几[条份张页个]|每[条份张页个])\s*$/.test(left))
   flags.push("CODE_SWITCH_ADJECTIVE_LINKER_REVIEW");
 }
 return flags;
}
