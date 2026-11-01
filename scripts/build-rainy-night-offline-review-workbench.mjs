// S67: self-contained offline reviewer UI built from an unpublished manuscript.
// No D1 access, accounts, browser storage, network, public assets or auto signoff.
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
import {buildRainyNightOfflineReviewDashboard} from "./build-rainy-night-review-dashboard.mjs";
import {buildRainyNightReviewLedger} from "./build-rainy-night-review-ledger.mjs";

const css='<style>'+
 '#review-workbench{border:2px solid #722f37;border-radius:14px;padding:16px 20px;margin:16px 0 28px;background:#fffaf2}'+
 '#review-workbench h2{margin-top:0;color:#722f37}'+
 '#review-workbench button,.human-review-trigger{cursor:pointer;border:1px solid #722f37;background:#722f37;color:white;border-radius:8px;padding:8px 12px;font-weight:600}'+
 '#review-workbench button:focus-visible,.human-review-trigger:focus-visible{outline:3px solid #c9a36b;outline-offset:3px}'+
 '.human-review-trigger{margin:9px 0 0}'+
 '#review-workbench .review-actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}'+
 '#review-workbench label{display:block;font-size:14px;font-weight:600;margin:10px 0}'+
 '#review-workbench input,#review-workbench select,#review-workbench textarea{box-sizing:border-box;width:100%;max-width:690px;font:inherit;font-weight:400}'+
 '#review-workbench textarea{display:block;min-height:90px;border:1px solid #b9aa9e;border-radius:8px;padding:8px}'+
 '#human-review-editor{margin-top:14px;border-top:1px solid #ded3c5;padding-top:12px}'+
 '#human-review-message[data-error="yes"]{color:#8e3b3b;font-weight:700}'+
 '#human-review-count{font-weight:600;color:#722f37}'+
 '</style>';
const workflow=[
 '<section id="review-workbench" aria-label="离线逐项人工审核工作台">',
 '<h2>离线逐项审校工作台 · 不联网</h2>',
 '<p><strong>只有人工主动填写，才会计入审核进度。</strong> 页面不会自动保存；关闭前必须导出JSON，后续从本地重新导入。任何审核记录均不能直接解锁正式出版、词汇授权或付费权益。</p>',
 '<p id="human-review-count" aria-live="polite"></p>',
 '<div class="review-actions">',
 '<button type="button" id="human-review-export">导出审核记录 JSON</button>',
 '<label for="human-review-import">导入此前审核记录（仅本机）<input type="file" id="human-review-import" accept=".json,application/json"></label>',
 '</div><div id="human-review-editor" hidden>',
 '<h3 id="human-review-item"></h3>',
 '<label for="human-review-decision">这条记录的编辑决定',
 '<select id="human-review-decision"><option value="PENDING">未审核 / 重置此条</option>',
 '<option value="REVIEWED_OK">已核对 / 通过内部审校</option>',
 '<option value="CHANGES_REQUESTED">需要修改 / 退回编辑</option></select></label>',
 '<label for="human-review-reviewer">审稿人标识（至少3字符）',
 '<input type="text" id="human-review-reviewer" maxlength="120" placeholder="请真实填写审稿人标识"></label>',
 '<label for="human-review-note">具体审校依据或改稿意见（至少12字符）',
 '<textarea id="human-review-note" maxlength="1800" placeholder="请逐条说明实际核查了什么、是否存在义项或事实问题"></textarea></label>',
 '<label for="human-review-evidence">线下证据/审稿记录编号（至少3字符）',
 '<input type="text" id="human-review-evidence" maxlength="200" placeholder="如本地审稿日志编号，不要填写登录凭证"></label>',
 '<button type="button" id="human-review-save">保存此条到本页内存</button>',
 '</div><p id="human-review-message" role="status" aria-live="polite"></p>',
 '<p class="unapproved">非商业批准：本页面无法核实审稿人真实身份、IPA商用许可、CET级别或真实付费流程。完成记录后仍须另行审查，不能通过该工作台发布作品。</p>',
 '</section>'
].join("");
const embed=value=>JSON.stringify(value).replace(/</g,"\\u003c")
 .replace(/>/g,"\\u003e").replace(/&/g,"\\u0026")
 .replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");

export function buildRainyNightOfflineReviewWorkbench(bundle){
 const base=buildRainyNightOfflineReviewDashboard(bundle);
 const ledger=buildRainyNightReviewLedger(bundle);
 if(ledger.rows.length!==957||ledger.rows.some(r=>r.decision!=="PENDING"))
  throw Error("OFFLINE_WORKBENCH_REQUIRES_UNAPPROVED_LEDGER");
 const client=readFileSync(new URL("./rainy-night-offline-workbench-client.js",import.meta.url),"utf8");
 if(client.includes("</script")||client.includes("fetch(")||
    client.includes("localStorage")||client.includes("sessionStorage"))
  throw Error("OFFLINE_WORKBENCH_CLIENT_UNSAFE_SOURCE");
 const marker='<section class="panel" data-panel="words">';
 if(!base.html.includes(marker)||!base.html.endsWith("</body></html>"))
  throw Error("OFFLINE_WORKBENCH_TEMPLATE_CHANGED");
 const html=base.html.replace("</head>",css+"</head>")
  .replace(marker,workflow+marker)
  .replace("</body></html>",
   '<script id="human-ledger-data" type="application/json">'+embed(ledger)+'</script>'+
   '<script>'+client+'</script></body></html>');
 return {summary:{...base.summary,totalReviewUnits:957,
  reviewDecisionsSaved:0,reviewNeedsAction:957,
  publicationAllowed:false,allContentStillPrivate:true},html};
}
function main(){
 const args=process.argv.slice(2);
 if(args.some(x=>!["--summary","--write-private"].includes(x)))
  throw Error("Usage: --summary | --write-private");
 const report=buildRainyNightOfflineReviewWorkbench(composeRainyNightSeasonDraft().bundle);
 if(args.includes("--write-private")){
  const dir=resolve("private-output");
  mkdirSync(dir,{recursive:true,mode:0o700});
  writeFileSync(resolve(dir,"rainy-night-s1-PRIVATE-HUMAN-REVIEW-WORKBENCH.html"),
   report.html,{encoding:"utf8",mode:0o600,flag:"wx"});
 }
 process.stdout.write(JSON.stringify(report.summary,null,2)+"\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){process.stderr.write(e.message+"\n");process.exitCode=1;}
}
