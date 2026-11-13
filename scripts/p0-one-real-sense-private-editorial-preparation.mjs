// Private P0 review of one authentic sense candidate in two published books.
// Input from two AES-encrypted GitHub artifacts only inside protected runner.
// Output plaintext is private temporary data. No approval, D1 or deployment.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRealPublisherClearanceTemplate,RIGHTS_KINDS,CHECK_KINDS}
 from './v12-real-published-commercial-rights-gate.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const lower=x=>String(x??'').normalize('NFKC').trim().toLowerCase();
const compact=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const pos=x=>lower(x).replace(/[.。]/gu,'');
const literal=x=>String(x??'').replace(/[\u0000-\u001f]/gu,' ');
const renderedParagraph=x=>{
 const p=JSON.parse(x);assert.ok(Array.isArray(p.segments));
 return p.segments.map(s=>typeof s==='string'?s:s?.text??s?.surface??'').join('');
};
const checks=(state,evidence,fix)=>({status:state,evidence,fix});
export function preparePrivateReview(packet,uk){
 const clearance=createRealPublisherClearanceTemplate(packet);
 assert.equal(uk?.schema,'wordletter-real-one-sense-two-books-licensed-uk-ipa-preflight-v1');
 assert.equal(uk.status,'ONE_REAL_SENSE_UK_US_SOURCE_CANDIDATES_EDITORIAL_HOLD');
 assert.equal(uk.counts?.real_books,2);
 assert.equal(uk.counts?.real_old_cards,2);
 assert.equal(uk.counts?.distinct_reviewable_textual_sense_candidates,1);
 assert.equal(uk.counts?.approved_real_senses,0);
 assert.equal(uk.counts?.test_d1_writes,0);
 const c=packet.candidate,ed=uk.original_editorial_review_private,old=c.real_cards;
 assert.ok(ed&&ed.editor_decision==='HOLD'&&!ed.ops_signed);
 for(const [original,reconciled,name] of [
  [c.headword,ed.headword,'HEADWORD'],
  [c.part_of_speech,ed.pos,'POS'],
  [c.meaning_zh,ed.meaning_zh,'MEANING'],
  [old[0].example_en,ed.example_en,'EXAMPLE_EN'],
  [old[0].example_zh,ed.example_zh,'EXAMPLE_ZH'],
  [old[0].phonetic_uk,ed.old_uk_ipa,'IPA_UK'],
  [old[0].phonetic_us,ed.old_us_ipa,'IPA_US']
 ])assert.equal(original,reconciled,'PRIVATE_EVIDENCE_CHANGED_'+name);
 assert.deepEqual(ed.two_book_ids,old.map(x=>x.book_id));
 assert.deepEqual(ed.two_old_card_ids,old.map(x=>x.legacy_word_id));
 assert.deepEqual(ed.original_legacy_card_sha256,old.map(x=>x.old_card_sha256));
 assert.deepEqual(ed.original_context_sha256,old.map(x=>x.context_paragraph_sha256));
 const evidence=old.map((card,i)=>({
  book_no:i+1,book_title:card.book_title,chapter_title:card.chapter_title,
  book_id:card.book_id,chapter_id:card.chapter_id,legacy_word_id:card.legacy_word_id,
  anchor:card.anchor,card_sha256:card.old_card_sha256,
  context_sha256:card.context_paragraph_sha256,
  context_text:renderedParagraph(card.paragraph_json),
  original_paragraph_json:card.paragraph_json,
  surface:card.segment_surface,context_gloss:card.context_gloss,
  pos:card.part_of_speech,meaning:card.meaning_zh,
  en:card.example_en,zh:card.example_zh,uk:card.phonetic_uk,
  us:card.phonetic_us,collocations:card.collocations_json
 }));
 const sameHeadword=lower(old[0].old_headword)===lower(old[1].old_headword);
 const samePos=pos(evidence[0].pos)===pos(evidence[1].pos);
 const sameMeaning=compact(evidence[0].meaning)===compact(evidence[1].meaning);
 const contextGloss=evidence.every(x=>compact(x.context_gloss)===compact(x.meaning));
 const identicalExamples=evidence[0].en===evidence[1].en&&evidence[0].zh===evidence[1].zh;
 assert.ok(sameHeadword&&samePos&&sameMeaning&&contextGloss&&identicalExamples,
  'PRIVATE_DIFFERENT_OLD_SENSE_REFUSE_MERGE');
 assert.equal(new Set(evidence.map(x=>x.book_id)).size,2);
 assert.equal(new Set(evidence.map(x=>x.legacy_word_id)).size,2);
 const flags=ed.english_example_reviewer_flags||[];
 const items={
  crossbook_sense:checks('EXACT_TEXT_EQUAL_CONTEXTUAL_HOLD',
   '两书词头、词性、中文义项、旧卡 SHA 和原段落 SHA 经受保护来源复核一致',
   '双语编辑分别阅读两个真实段落后写出此处具体语义；不同义项必须拒绝合并'),
  chinese_gloss:checks('ANCHORED_GLOSS_MATCH_HUMAN_HOLD',
   '两处段落标注 gloss 与旧卡中文义项文本一致',
   '人工确认该句中具体含义及中文表达准确性'),
  english_example:checks('HEURISTIC_FLAGGED_HUMAN_REVIEW',
   '两张原词卡英文例句完全一致；现有机器提示 '+flags.join('、'),
   '人工确认自然度、语法、目标义项；可另写全新的统一课件英文示例，不改旧卡'),
  chinese_example:checks('TEXTUAL_EQUAL_NOT_TRANSLATION_SIGNOFF',
   '两张原卡中文译句完全一致',
   '人工对照英文与语境核译；可对新统一课件独立创作中文译句'),
  uk_ipa:checks('MIT_CANDIDATE_FOUND_NOT_APPROVED',
   'Britfone固定版本 '+ed.uk.source_commit+'；候选 '+ed.uk.candidates.join(' / ')+
    '；旧卡归一化结果 '+ed.uk.status,
   '语言审校确定词性/重音/变体、上游权利链和署名；旧卡不修改'),
  us_ipa:checks('MIT_CANDIDATE_FOUND_NOT_APPROVED',
   'ipa-dict en_US 固定版本 '+ed.us.source_commit+'；候选 '+
    ed.us.candidates.join(' / ')+'；旧卡比对 '+ed.us.old_ipa_status,
   '语言审校逐个核对词性、读音与许可，旧卡不修改'),
  audio:checks('ABSENT_FROM_PRIVATE_EVIDENCE',
   '这两份审稿包未提供音频文件或录音商用许可信息',
   '新课件不附未核权的音频；若未来启用 TTS，需核对引擎与输出许可')
 };
 const sources=[
  ['中文释义/词性','已发布小说旧卡','旧卡来源未证；ECDICT可作MIT词义参考候选','逐句定义原创/许可凭证和释义审校'],
  ['英文例句','历史旧卡、两书同一英文例句','项目层面用户自述AI协助创作，非该例句独立来源记录','逐卡生成记录、排他性/第三方重叠审核或新原创例句'],
  ['中文译句','历史旧卡、两书同一中文例句','逐卡翻译权及来源未证','翻译准确性审阅与原创/许可证明'],
  ['UK IPA','旧卡来源未知；新候选JoseLlarena/Britfone '+ed.uk.source_commit,
   '候选文件声明 MIT，Britfone上游引用来源待核；不采用GPL派生数据',
   '编辑选择对应词性/音节重音、来源链/作者署名和许可'],
  ['US IPA','旧卡来源未知；新候选open-dict-data/ipa-dict '+ed.us.source_commit,
   'en_US候选声明 MIT；不证明旧卡的实际来源',
   '编辑确认美式变体/重音及许可范围与出处'],
  ['搭配','两张旧卡的 collocations_json','逐条来源未知',
   '新统一课件可以留空，不渲染未经审核搭配'],
  ['小说正文/语境','受保护的真实已发布章节原段落',
   '用户自述AI协助小说创作，非逐段所有权证明',
   '当前两段的创作记录/付费教学使用依据'],
  ['音频（若有）','此两份私密审稿包无音频文件',
   '不推定声音素材/合成TTS输出许可','若计划保存音频单独补服务商/版权证据']
 ].map(([material,actual_source,license_state,missing_evidence])=>({
  material,actual_source,adopted_content:'原历史卡与原文不覆盖；新课件尚未选择素材',
  license_state,missing_evidence}));
 const privateReport={
  schema:'wordletter-private-one-real-sense-review-prepared-v1',
  status:'HOLD_PENDING_INDEPENDENT_LANGUAGE_AND_RIGHTS_REVIEW',
  source_artifacts:{real_context:packet.source_encrypted_artifact_id,
   uk_us_review:14020109876,context_fingerprint:packet.source_proof_sha256},
  candidate:{headword:c.headword,pos:c.part_of_speech,meaning_zh:c.meaning_zh,
   english_example:ed.example_en,chinese_example:ed.example_zh,
   old_uk_ipa:ed.old_uk_ipa,old_us_ipa:ed.old_us_ipa,
   uk_candidates:ed.uk.candidates,us_candidates:ed.us.candidates,
   machine_heuristic_flags:flags},
  books:evidence,mechanical_checks:{sameHeadword,samePos,sameMeaning,
   contextGloss,identicalExamples,old_card_sha_verified:true,
   context_sha_verified:true},per_item:items,source_inventory:sources,
  replacement_options:[
   '在新统一 lesson 内独立原创英文例句和中文译句，真实编辑审核后才采用，原两旧词卡和章节一字不改',
   '英美IPA仅从已固定版本的候选中经专业编辑选择并核对上游授权/署名后采用；旧音标保持原样',
   '不明来源的搭配或音频先在新 lesson 中留空，不引入任何未经审查素材'
  ],
  reviewer_roles:{
   independent_bilingual_editor:'独立语义、双语例句和IPA编辑（真实人员尚无签收证据）',
   rights_reviewer:'有权审查每类商业许可和原创证据的责任人（真实人员尚无签收证据）',
   ops_publisher:'已存在有权限并登记公钥的OPS Publisher，只能在上述真实审核完成后签收'
  },
  approval:false,rights_signed:0,language_signed:0,
  ops_receipts:0,approved_senses:0,test_writes:0,production_writes:0,
  same_sense_merge_authorized:false
 };
 const md=[
 '# 妙屋 P0｜真实双书共用一个义项 · 私密内容与来源审稿单',
 '**状态 HOLD：仅完成客观来源结构核验，独立语言和商用权利尚未终审。**',
 '词头：'+literal(c.headword)+'；词性：'+literal(c.part_of_speech)+'；中文释义：'+literal(c.meaning_zh),
 ...evidence.flatMap((v,i)=>[
  '## 真实小说 '+(i+1)+'｜'+literal(v.book_title)+' / '+literal(v.chapter_title),
  '旧卡 '+v.legacy_word_id+'；锚点 '+v.anchor,
  '旧卡SHA256 '+v.card_sha256+'；上下文SHA256 '+v.context_sha256,
  '上下文原段落：'+literal(v.context_text),
  '目标词形：'+literal(v.surface)+'；原义项释义：'+literal(v.context_gloss)
 ]),
 '## 英中例句和音标（历史只读）',
 '英文：'+literal(ed.example_en),
 '中文：'+literal(ed.example_zh),
 'UK：'+literal(ed.old_uk_ipa)+'；Britfone：'+ed.uk.candidates.join(' / '),
 'US：'+literal(ed.old_us_ipa)+'；ipa-dict：'+ed.us.candidates.join(' / '),
 '机器例句提示：'+(flags.join('、')||'未触发预设规则（不等于语言审核通过）'),
 '## 分项证据与待修',
 ...Object.entries(items).flatMap(([key,v])=>[
  '### '+key+'｜'+v.status,
  '证据：'+v.evidence,
  '需要编辑完成：'+v.fix
 ]),
 '## 素材来源/实际采用状态/许可依据与缺失证据',
 ...sources.flatMap(s=>[
  '### '+s.material,'来源：'+s.actual_source,
  '实际采用：'+s.adopted_content,
  '许可状态：'+s.license_state,
  '缺失证据：'+s.missing_evidence
 ]),
 '## 可审核替代方案（仅新课件，不覆盖原书）',
 ...privateReport.replacement_options.map(x=>'- '+x),
 '## 必须由真实审核人员完成，不得一键批准',
 ...RIGHTS_KINDS.map(x=>'- [ ] 权利 '+x+'（原始证明、权利人/许可、证据SHA256、审核人、时间）'),
 ...CHECK_KINDS.map(x=>'- [ ] 内容 '+x+'（实际审查理由、证据SHA256、编辑、时间）'),
 '**任何一处为不同具体词义，必须 REFUSE_MERGE，禁止为了推进P0合并。**',
 '**本包不是 AI 语言终审，不是独立人工签名，不能用作 TEST 写入批准。**'
 ].join('\n\n');
 const safe={real_published_books:2,real_old_cards:2,structural_equal_candidate:1,
  same_sense_human_signoffs:0,old_card_hashes_verified:2,
  original_context_hashes_verified:2,
  old_us_ipa_diff:ed.us.old_ipa_status==='US_IPA_CANDIDATES_DIFFER_FROM_OLD_CARD'?1:0,
  old_uk_ipa_diff:ed.uk.status==='MIT_UK_CANDIDATES_DIFFER_FROM_OLD_CARD'?1:0,
  english_flags:flags.length,rights_pending:RIGHTS_KINDS.length,
  editor_checks_pending:CHECK_KINDS.length,ops_signed:0,
  approved_real_senses:0,test_writes:0,production_writes:0};
 return {privateReport,clearance,safe,md};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,6,'P0_PRIVATE_REVIEW_USAGE');
  const packet=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const uk=JSON.parse(readFileSync(process.argv[3],'utf8'));
  const r=preparePrivateReview(packet,uk);
  writeFileSync(process.argv[4],JSON.stringify({
   report:r.privateReport,unapproved_review_template:r.clearance
  },null,2),{flag:'wx',mode:0o600});
  writeFileSync(process.argv[5],r.md,{flag:'wx',mode:0o600});
  console.log('P0_PRIVATE_REVIEW_AGGREGATE_ONLY='+JSON.stringify(r.safe));
 }catch(e){
  const m=String(e?.message||'');
  console.error('P0_PRIVATE_REVIEW_FAILED',
   /^[A-Z0-9_]+$/u.test(m)?m:'SOURCE_OR_PRIVATE_VALIDATION_FAILED');
  process.exitCode=1;
 }
}
