// Single source of truth for offline voucher issuance approvals.
// salesEnabled is never proof that a payment is received or D1 has a category.
import {readFileSync} from "node:fs";
export function loadVoucherCatalog(file=new URL("../config/activation-categories.json",import.meta.url)){
 const data=JSON.parse(readFileSync(file,"utf8"));
 if(data.version!==1 || !Array.isArray(data.categories))throw Error("INVALID_CATEGORY_CATALOG");
 const seen=new Set();
 for(const row of data.categories){
  if(!row || typeof row.slug!=="string"|| !/^[a-z][a-z0-9-]{1,35}$/.test(row.slug)||
   typeof row.name!=="string"||!row.name.trim()||typeof row.salesEnabled!=="boolean"||
   seen.has(row.slug))throw Error("INVALID_CATEGORY_CATALOG");
  seen.add(row.slug);
 }
 return data.categories;
}
export function assertIssuableCategory(slug,rows=loadVoucherCatalog()){
 const row=rows.find(x=>x.slug===slug);
 if(!row||row.salesEnabled!==true)throw Error("CATEGORY_NOT_APPROVED_FOR_ISSUANCE");
 return row;
}
