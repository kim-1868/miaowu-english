// S3-D0: staging-only preflight for future book release.
// Deliberately read-only; NO mutation, no publication endpoint and no test book release.
import {reviewDraft} from "./editorial-review.js";
const HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store",
  "x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const ID=/^[a-z][a-z0-9_-]{2,79}$/;
const add=(items,code,title,detail)=>items.push({code,title,detail});
export async function publicationReadiness(env,id) {
  if(!ID.test(id))return response({error:"INVALID_ID"},400);
  const result=await reviewDraft(env,id);
  if(!result.ok)return result;
  const report=await result.json();
  const blocks=[],advisories=[];
  if(report.blockerCount>0)add(blocks,"EDITORIAL_CHECKS_FAILED",
    "技术审核未通过","请先解决 "+report.blockerCount+" 项结构问题，然后重新执行审核。");
  // This is a safety gate: the QA fixtures and demo manuscript must never be
  // available to readers because somebody clicked through a prototype UI.
  const demo=/示例|测试|sample|demo/i.test(report.book.title+" "+report.book.id) ||
    /^qa[-_]/i.test(report.book.id) || /^draft[-_]/i.test(report.book.id);
  if(demo)add(blocks,"TEST_MANUSCRIPT",
    "这是测试内容","测试/示例书籍禁止进入正式发布流程，请使用独立的新书目进行后续验收。");
  const {results=[]}=await env.DB.prepare(
    "PRAGMA table_info(editorial_review_signoffs)").all();
  const signoffsSchemaReady=results.some(x=>x.name==="content_fingerprint");
  let humanReview={status:"unavailable",latestAt:null};
  if(!signoffsSchemaReady){
    add(blocks,"REVIEW_STORAGE_MISSING","人工审核记录库未就绪",
      "需要先完成 S3-C2 的 006 增量迁移。");
  }else{
    const entry=await env.DB.prepare(
      "SELECT content_fingerprint,created_at FROM editorial_review_signoffs "+
      "WHERE book_id=? ORDER BY rowid DESC LIMIT 1").bind(id).first();
    const valid=!!entry&&entry.content_fingerprint===report.contentFingerprint;
    humanReview={status:valid?"current":entry?"outdated":"missing",
      latestAt:entry?.created_at||null};
    if(!valid)add(blocks,"MANUAL_REVIEW_REQUIRED","缺少有效的人工审核确认",
      entry?"稿件已更改，旧审核记录不能用于发布。":"请完成原创性、语言质量与课程范围三项人工复核。");
  }
  if(report.metrics.chapters<5)add(advisories,"VERY_SHORT_BOOK","故事篇幅尚短",
    "当前只有 "+report.metrics.chapters+" 章。正式商品需要按剧情完结度决定章节数。");
  if(report.metrics.distinctWords<10)add(advisories,"LOW_TARGET_VOCABULARY","词汇覆盖尚待验证",
    "当前只有 "+report.metrics.distinctWords+" 个不同目标词。需要对照四级目标词表审核。");
  for(const warning of report.warnings.slice(0,50)){
    add(advisories,warning.code,warning.message,warning.wordId||warning.chapterId||"");
  }
  // Formal publishing must be designed and independently accepted. Explicitly
  // block it here even if a well-formed draft passes all other safeguards.
  add(blocks,"PUBLICATION_DISABLED","尚未开放上架功能",
    "当前仅允许审核与编辑草稿，禁止自动或手动将测试内容发布到读者书架。");
  return response({
    book:report.book,environment:"staging",draftOnly:true,
    metrics:report.metrics,technicalCheckPassed:report.technicalCheckPassed,
    humanReview,signoffsSchemaReady,blockers:blocks,advisories,
    canPublish:false,publicationAvailable:false,
    readerAccessPolicy:"Future: preview chapters public; paid chapters require active category entitlement",
    note:"发布准备检查不写入数据库，不代表审核批准，也不会发布或下架任何书。"
  });
}
