// Private owner drafts only. Export heuristic editorial review queue, NEVER approval.
// Source examples and user manuscript content must not enter public CI/logs.
const TIERS=new Set(['基础','四级新增','六级新增','考研新增']);
const normalize=x=>String(x??'').normalize('NFKC').trim().toLowerCase();
const TOKEN=/[a-z]+(?:['’][a-z]+)?/giu;
const CJK=/[\u3400-\u9fff]/u;
const SPECIAL={be:['am','is','are','was','were','been','being'],
 go:['went','gone','goes','going'],do:['does','did','done','doing'],
 have:['has','had','having'],good:['better','best'],bad:['worse','worst']};
function forms(headword){
 const h=normalize(headword),x=new Set([h,h+'s',h+'es',h+'ed',h+'ing',...(SPECIAL[h]||[])]);
 if(h.endsWith('e')){x.add(h.slice(0,-1)+'ing');x.add(h+'d')}
 if(h.endsWith('y')){x.add(h.slice(0,-1)+'ies');x.add(h.slice(0,-1)+'ied')}
 if(h.length>=3&&!/[aeiouwxy]/u.test(h.at(-1))&&
   /[aeiou]/u.test(h.at(-2))&&!/[aeiou]/u.test(h.at(-3))){
  x.add(h+h.at(-1)+'ed');x.add(h+h.at(-1)+'ing');
 }
 return x;
}
function invalidApproved(row){
 return row.publisher_approved!==false||row.teaching_ready!==false||
   row.approved_sense_id!==null||row.commercial_release_allowed!==false;
}
export function auditOwnerOriginalExamples({
 drafts,targets,history=[],semanticAttention=[]
}={}){
 if(!Array.isArray(drafts)||!drafts.length||drafts.length>30000||
   !Array.isArray(targets)||!Array.isArray(history)||!Array.isArray(semanticAttention))
  throw Error('OWNER_DRAFT_REVIEW_INVALID_INPUT');
 const target=new Map(),risk=new Map(),older=new Map(),seen=new Set();
 for(const t of targets){
  const h=normalize(t?.headword);
  if(!h||target.has(h)||!TIERS.has(t?.target_tier))throw Error('OWNER_DRAFT_TARGET_DUPLICATE');
  target.set(h,t);
 }
 for(const r of semanticAttention){
  const h=normalize(r?.headword??r?.word);
  if(!h)throw Error('OWNER_DRAFT_RISK_IDENTITY_INVALID');
  risk.set(h,[...(risk.get(h)||[]),String(r.risk_code??r.reason_code??'LEXICAL_ATTENTION')]);
 }
 for(const h of history){
  const word=normalize(h?.headword);
  if(!word)throw Error('OWNER_DRAFT_HISTORY_IDENTITY_INVALID');
  older.set(word,[...(older.get(word)||[]),h]);
 }
 const rows=[];
 for(const d of drafts){
  const h=normalize(d?.headword),t=target.get(h);
  if(!h||seen.has(h)||!t||!TIERS.has(d.target_tier)||
   d.target_tier!==t.target_tier||d.entry_id!==t.entry_id||
   invalidApproved(d)||typeof d.example_en_draft!=='string'||
   typeof d.example_zh_draft!=='string')
   throw Error('OWNER_DRAFT_IDENTITY_OR_APPROVAL_INVALID');
  seen.add(h);
  const en=d.example_en_draft.trim(),zh=d.example_zh_draft.trim();
  if(!en||!zh)throw Error('OWNER_DRAFT_EMPTY_EXAMPLE');
  const flags=[];
  const tokens=(en.toLowerCase().match(TOKEN)||[]).map(x=>x.replaceAll('’',"'"));
  if(!tokens.some(x=>forms(h).has(x))&&!en.toLowerCase().includes(h))
   flags.push('TARGET_LEMMA_NOT_VISIBLE_OR_IRREGULAR_INFLECTION');
  if(!CJK.test(zh))flags.push('EXAMPLE_ZH_NO_CHINESE');
  if(tokens.length<5||tokens.length>35)flags.push('EXAMPLE_EN_LENGTH_OUTLIER');
  if(zh.length<8||zh.length>110)flags.push('EXAMPLE_ZH_LENGTH_OUTLIER');
  if(!/[.!?]$/u.test(en))flags.push('EXAMPLE_EN_PUNCTUATION');
  if(!/[。！？!?]$/u.test(zh))flags.push('EXAMPLE_ZH_PUNCTUATION');
  if(/\b(?:todo|tbd|placeholder|lorem ipsum)\b/iu.test(en)||zh.includes('待补充'))
   flags.push('PLACEHOLDER');
  if(!String(d.pos_draft??'').trim()||!String(d.meaning_zh_draft??'').trim())
   flags.push('SENSE_METADATA_MISSING');
  for(const code of [...new Set(risk.get(h)||[])].sort())
   flags.push('SEMANTIC_ATTENTION:'+code);
  const prior=older.get(h)||[];
  if(prior.length>1)flags.push('HISTORICAL_MULTIPLE_SENSE_GROUPS');
  if(prior.some(x=>x.qa_flags?.includes('INCONSISTENT_IPA_ACROSS_HISTORICAL_CARDS')))
   flags.push('HISTORICAL_IPA_CONFLICT_REVIEW');
  const oldCount=prior.reduce((n,x)=>n+Number(x.old_id_count||0),0);
  const bookCount=prior.reduce((n,x)=>n+Number(x.book_count||0),0);
  const priority=flags.length*6+Math.min(oldCount,25)*2+
    Math.min(bookCount,20)*3+Number(d.batch==='HISTORICAL_SENSE_80')*20+
    Number(Boolean(d.lexical_attention_reason))*8;
  rows.push({headword:d.headword,target_tier:d.target_tier,
   entry_id:d.entry_id,source_batch:d.batch,flags,priority,
   example_en_draft:en,example_zh_draft:zh,
   pos_draft:d.pos_draft,meaning_zh_draft:d.meaning_zh_draft,
   editor_decision:'HOLD',commercial_license_verified:false,
   IPA_verified:false,editor_signed_off:false,approved_sense_id:null,
   publish_allowed:false,study_writes_allowed:false});
 }
 rows.sort((a,b)=>b.priority-a.priority||a.headword.localeCompare(b.headword,'en'));
 const byTier=Object.fromEntries([...TIERS].map(t=>[t,rows.filter(x=>x.target_tier===t).length]));
 return {status:'OWNER_ORIGINAL_EXAMPLES_MACHINE_TRIAGED_EDITOR_REQUIRED',
  summary:{drafts:rows.length,with_flags:rows.filter(x=>x.flags.length).length,
   without_rule_flags:rows.filter(x=>!x.flags.length).length,by_tier:byTier,
   approved_senses:0,production_writes:0},
  rows,all_publish_blocked:true,
  warning:'Heuristic checks are not license, semantic, bilingual or phonetic approval.'};
}
