import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const html=read("../public/ops.html");
const script=read("../public/ops-console.js");
const css=read("../public/ops-console.css");
const start=script.indexOf("function filterCatalogBooks(");
const end=script.indexOf("\nfunction renderBookDirectory",start);
assert.ok(start>=0&&end>start,"filter helper must be present");
const filterCatalogBooks=new Function(script.slice(start,end)+"\nreturn filterCatalogBooks")();

test("S150: operator catalog filters by partial title, category, status and combined inputs",()=>{
  const sample=[
    {id:"a",title:"雨夜档案",category_id:"cet4",status:"published"},
    {id:"b",title:"穿成恶毒女配后，我不演了",category_id:"cet4",status:"published"},
    {id:"c",title:"逆潮信号",category_id:"postgrad",status:"published"},
    {id:"d",title:"考研夜航",category_id:"postgrad",status:"draft"},
    {id:"e",title:"猫咪的 CET4 词典",category_id:"cet4",status:"draft"}
  ];
  assert.equal(filterCatalogBooks(sample,"","","").length,5);
  assert.deepEqual(filterCatalogBooks(sample,"  雨夜  ","","").map(x=>x.id),["a"]);
  assert.deepEqual(filterCatalogBooks(sample,"cet4","","").map(x=>x.id),["e"]);
  assert.deepEqual(filterCatalogBooks(sample,"","postgrad","").map(x=>x.id),["c","d"]);
  assert.deepEqual(filterCatalogBooks(sample,"","","draft").map(x=>x.id),["d","e"]);
  assert.deepEqual(filterCatalogBooks(sample,"夜","postgrad","draft").map(x=>x.id),["d"]);
  assert.deepEqual(filterCatalogBooks(sample,"不存在","","").map(x=>x.id),[]);
  assert.deepEqual(sample.map(x=>x.id),["a","b","c","d","e"],"never mutate the source catalog");
});

test("S150: operational directory contains interactive filters, compact paging and empty result states",()=>{
  for(const id of ["bookSearch","bookCategory","bookStatus","bookClearFilters",
    "bookDirectorySummary","bookPageInfo","bookPagePrev","bookPageNext"]){
    assert.ok(html.includes('id="'+id+'"'),"missing filter control "+id);
  }
  assert.match(html,/id="bookSearch" type="search"/);
  assert.match(html,/bookDirectorySummary" class="soft" role="status" aria-live="polite"/);
  assert.match(script,/const DIRECTORY_PAGE_SIZE=6;/);
  assert.match(script,/filtered\.slice\(first,first\+DIRECTORY_PAGE_SIZE\)/);
  assert.match(script,/没有找到符合条件的小说，可清空筛选重新查看/);
  assert.match(script,/function updateBookCategoryOptions/);
  assert.match(script,/bookCategory".*?value/);
  assert.match(script,/renderBookDirectory\(\)/);
  assert.match(css,/ops-book-filters/);
  assert.match(css,/ops-book-pagination/);
  assert.match(html,/v=20261104-v23-withdraw-ready/);
});

test("S150: local catalog selection retains publisher checks and never sends filter values to a write API",()=>{
  assert.match(script,/catalogBooks=Array\.isArray\(data\.books\)/);
  assert.match(script,/await openBook\(next\)/);
  assert.match(script,/\$\("bookClearFilters"\)\.addEventListener\("click"/);
  assert.match(script,/clearActions\(\);renderBookDirectory\(\)/);
  assert.match(script,/quickPublishBook\(id,readiness\)/);
  assert.match(script,/async function doWithdraw/);
  const filters=script.slice(script.indexOf("// The catalog is kept"),script.indexOf("async function openBook("));
  assert.doesNotMatch(filters,/api\([^\n]+[\,]\s*"(POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(filters,/localStorage|sessionStorage/);
});
