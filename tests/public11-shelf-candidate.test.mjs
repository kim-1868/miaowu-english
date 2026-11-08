import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext,Script} from "node:vm";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const app=read("public/app.js"),html=read("public/index.html");
const pagination=read("public/shelf-pagination.js");
const prod=read("scripts/build-production-assets.mjs");

function createNode(tag="div"){
  const attrs=new Map(),children=[],handlers=new Map();
  const el={tag,attrs,children,handlers,className:"",textContent:"",disabled:false,
    setAttribute:(key,val)=>attrs.set(key,String(val)),
    getAttribute:key=>attrs.get(key),
    addEventListener:(event,fn)=>handlers.set(event,fn),
    append(...values){for(const v of values){v.parent=this;children.push(v)}},
    querySelector(sel){return sel===":scope > .shelf-pagination"?
      children.find(x=>x.className==="shelf-pagination")||null:null},
    remove(){if(this.parent){const index=this.parent.children.indexOf(this);
      if(index>=0)this.parent.children.splice(index,1)}},
    fire(event){handlers.get(event)?.({target:this})},
    scrollIntoView(options){this.scrollOptions=options}
  };
  return el;
}
function findAll(root,fn){
  const result=[];
  (function walk(node){if(fn(node))result.push(node);for(const child of node.children||[])walk(child)})(root);
  return result;
}
function fixture(withPublic){
  const list=createNode("main"),heading=createNode("h2");
  const clickCalls=[];
  const document={createElement:createNode};
  const window={matchMedia:()=>({matches:false})};
  const ctx={document,window,console,
    shelfPage:1,SHELF_PAGE_SIZE:9,
    loadCloudBookCards:slug=>clickCalls.push(slug),
    $:key=>({bookGrid:list,selectedCategoryTitle:heading})[key]};
  if(withPublic)runInNewContext(pagination,{window,document});
  const start=app.indexOf("    function renderShelfPagination(slug,meta){");
  const end=app.indexOf("    async function loadCloudBookCards(slug){",start);
  assert.ok(start>=0&&end>start,"private app renderer anchors changed");
  const fn=runInNewContext("("+app.slice(start,end).trim().replace(/^function /,"function ")+")",ctx);
  return {fn,ctx,list,heading,clickCalls};
}
test("pilot candidate is isolated and source matches public component interface",()=>{
  new Script(app,{filename:"app.js"});
  new Script(pagination,{filename:"shelf-pagination.js"});
  assert.match(app,/PUBLIC11_SHELF_PAGINATION_CANDIDATE/);
  assert.match(app,/MiaowuShelfPagination\?\.create/);
  assert.match(app,/function renderShelfPagination\(slug,meta\)/);
  assert.match(pagination,/MiaowuShelfPagination=Object\.freeze/);
  assert.match(html,/<script src="\/shelf-pagination\.js\?v=[^"]+"><\/script>\s*<script src="\/app\.js/);
  assert.match(prod,/"shelf-pagination\.js"/);
  assert.doesNotMatch(pagination,/fetch\(|\/api\/|localStorage|document\.cookie/i);
});
test("public UI path renders one nav, preserves page summary and private next-page callback",()=>{
  const f=fixture(true);
  f.fn("cet4",{totalPages:12,total:104});
  const navs=findAll(f.list,n=>n.className==="shelf-pagination");
  assert.equal(navs.length,1);
  assert.equal(findAll(navs[0],n=>n.className==="shelf-page-summary")[0].textContent,"共 104 本 · 每页 9 本");
  const buttons=findAll(navs[0],n=>n.tag==="button");
  const next=buttons.find(n=>n.textContent==="下一页");
  assert.equal(next.disabled,false);
  next.fire("click");
  assert.equal(f.ctx.shelfPage,2);
  assert.deepEqual(f.clickCalls,["cet4"]);
  assert.equal(f.heading.scrollOptions.behavior,"smooth");
  assert.equal(f.heading.scrollOptions.block,"start");
});
test("public component absent: existing private renderer is a working fallback, never double-rendered",()=>{
  const f=fixture(false);
  f.fn("cet6",{totalPages:8,total:72});
  const navs=findAll(f.list,n=>n.className==="shelf-pagination");
  assert.equal(navs.length,1);
  const next=findAll(navs[0],n=>n.tag==="button").find(n=>n.textContent==="下一页");
  next.fire("click");
  assert.equal(f.ctx.shelfPage,2);
  assert.deepEqual(f.clickCalls,["cet6"]);
});
test("single page never renders an unnecessary paginator on either path",()=>{
  for(const installed of [false,true]){
    const f=fixture(installed);f.fn("cet4",{totalPages:1,total:8});
    assert.equal(findAll(f.list,n=>n.className==="shelf-pagination").length,0);
  }
});
