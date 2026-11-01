// Offline, operator-attested voucher fulfillment. NO Cloudflare/network calls.
// One settled order -> one category -> one single-use voucher. No PII in input.
// The output directory is gitignored and must never be uploaded.
import {createHmac,randomBytes,randomUUID} from "node:crypto";
import {readFile,writeFile,rename,open,mkdir,unlink,lstat} from "node:fs/promises";
import {basename,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {assertIssuableCategory,loadVoucherCatalog} from "./voucher-catalog.mjs";

const ORDER=/^ORD-[A-Z0-9][A-Z0-9_-]{5,55}$/;
const HEX=/^[0-9a-f]{64}$/;
const TITLE="order_reference,category_id,payment_confirmed";
const LIMIT=100;
const isObject=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const sqlQuoted=s=>"'"+s.replaceAll("'","''")+"'";
export function parseConfirmedOrdersCsv(csv){
 if(typeof csv!=="string"||csv.length>20000)throw Error("INVALID_ORDERS_FILE");
 const lines=csv.replace(/\r\n/g,"\n").trimEnd().split("\n");
 if(lines.shift()?.replace(/^\uFEFF/,"")!==TITLE)throw Error("INVALID_ORDERS_HEADER");
 if(lines.length<1||lines.length>LIMIT)throw Error("INVALID_ORDER_COUNT");
 const rows=[],seen=new Set();
 for(const line of lines){
  const columns=line.split(",");
  if(columns.length!==3)throw Error("INVALID_ORDER_ROW");
  const [orderReference,categoryId,paid]=columns;
  if(!ORDER.test(orderReference)||!/^[a-z][a-z0-9-]{1,35}$/.test(categoryId)||
    paid!=="YES"||seen.has(orderReference))throw Error("UNCONFIRMED_DUPLICATE_OR_UNSAFE_ORDER");
  seen.add(orderReference);
  rows.push({orderReference,categoryId});
 }
 return rows;
}
export function makeVoucher(categoryId,pepper){
 if(typeof pepper!=="string"||pepper.length<32)throw Error("STRONG_PEPPER_REQUIRED");
 const random=randomBytes(20).toString("hex").toUpperCase();
 const prefix=categoryId.replaceAll("-","").toUpperCase();
 const activationCode="MW-"+prefix+"-"+(random.match(/.{8}/g)||[]).join("-");
 const normalized=activationCode.replaceAll("-","");
 if(!/^[A-Z0-9]{16,80}$/.test(normalized))throw Error("UNSUPPORTED_CODE_FORMAT");
 const codeHash=createHmac("sha256",pepper).update("code:"+normalized).digest("hex");
 return {activationCode,codeHash};
}
function safeLedger(obj){
 if(!isObject(obj)||obj.version!==1||!Array.isArray(obj.entries))throw Error("INVALID_FULFILLMENT_LEDGER");
 const seen=new Set();
 for(const x of obj.entries){
  if(!isObject(x)||!ORDER.test(x.orderReference)||!HEX.test(x.codeHash)||
    typeof x.codeId!=="string"||!["prepared","issued"].includes(x.status)||
    seen.has(x.orderReference))throw Error("INVALID_FULFILLMENT_LEDGER");
  seen.add(x.orderReference);
 }
 return obj;
}
async function writePrivate(path,content){
 await writeFile(path,content,{mode:0o600,flag:"wx"});
}
async function atomicLedger(path,ledger){
 const temp=join(resolve(path,".."),"."+basename(path)+"."+randomUUID()+".tmp");
 try{
  await writePrivate(temp,JSON.stringify(ledger,null,2)+"\n");
  await rename(temp,path);
 }catch(error){await unlink(temp).catch(()=>{});throw error;}
}
async function readLedger(path){
 try{return safeLedger(JSON.parse(await readFile(path,"utf8")))}
 catch(error){
  if(error.code==="ENOENT")return {version:1,entries:[]};
  throw error;
 }
}
export async function fulfillOrders({ordersCsv,pepper,outputDir,categoryRows=loadVoucherCatalog()}){
 if(typeof pepper!=="string"||pepper.length<32)throw Error("STRONG_PEPPER_REQUIRED");
 const orders=parseConfirmedOrdersCsv(ordersCsv);
 for(const row of orders)assertIssuableCategory(row.categoryId,categoryRows);
 if(typeof outputDir!=="string"||!outputDir)throw Error("PRIVATE_OUTPUT_REQUIRED");
 const dir=resolve(outputDir);
 await mkdir(dir,{recursive:true,mode:0o700});
 // Refuse if the operator has accidentally replaced the private directory with a symlink.
 if(!(await lstat(dir)).isDirectory())throw Error("INVALID_PRIVATE_DIRECTORY");
 const lockPath=join(dir,"fulfillment.lock");
 const lock=await open(lockPath,"wx",0o600); // stale lock => manual inspection, never overwrite
 const ledgerPath=join(dir,"fulfillment-ledger.json");
 try{
  const ledger=await readLedger(ledgerPath);
  if(ledger.entries.some(x=>x.status==="prepared"))throw Error("UNRESOLVED_PREPARED_BATCH");
  const prior=new Set(ledger.entries.map(x=>x.orderReference));
  if(orders.some(x=>prior.has(x.orderReference)))throw Error("ORDER_ALREADY_ISSUED");
  const runId=randomUUID();
  const issued=orders.map(order=>{
   const {activationCode,codeHash}=makeVoucher(order.categoryId,pepper);
   return {...order,activationCode,codeHash,codeId:randomUUID(),runId};
  });
  const hashSet=new Set(ledger.entries.map(x=>x.codeHash));
  for(const row of issued){
   if(hashSet.has(row.codeHash))throw Error("DUPLICATE_VOUCHER_HASH");
   hashSet.add(row.codeHash);
  }
  const rows=issued.map(x=>({
    orderReference:x.orderReference,categoryId:x.categoryId,
    codeHash:x.codeHash,codeId:x.codeId,runId:x.runId,status:"prepared"
  }));
  ledger.entries.push(...rows);
  // Reserve each order first. A crash may require manual recovery, but cannot
  // safely produce a SECOND voucher for the same order on subsequent runs.
  await atomicLedger(ledgerPath,ledger);
  const inventoryName="voucher-inventory-"+runId+".csv";
  const importName="voucher-d1-import-"+runId+".sql";
  const inventory=[TITLE.replace("payment_confirmed","activation_code"),
   ...issued.map(x=>[x.orderReference,x.categoryId,x.activationCode].join(","))].join("\n")+"\n";
  const sql=[
   "-- PRIVATE IMPORT: after manual payment checks, new production D1 schema and UNIQUE order_reference index.",
   "-- Never upload this file or the private inventory to GitHub/public Pages.",
   ...issued.map(x=>"INSERT INTO activation_codes(id,code_hash,category_id,status,order_reference) VALUES ("+
    [x.codeId,x.codeHash,x.categoryId,"unused",x.orderReference].map(sqlQuoted).join(",")+");")
  ].join("\n")+"\n";
  await writePrivate(join(dir,inventoryName),inventory);
  await writePrivate(join(dir,importName),sql);
  for(const row of ledger.entries)if(row.runId===runId)row.status="issued";
  await atomicLedger(ledgerPath,ledger);
  return {count:issued.length,categories:[...new Set(issued.map(x=>x.categoryId))],
   inventoryName,importName,ledgerName:"fulfillment-ledger.json"};
 }finally{
  await lock.close();
  await unlink(lockPath).catch(()=>{});
 }
}
async function main(args){
 if(args.length!==2||args[0]!=="--orders")throw Error(
  "Usage: ACTIVATION_PEPPER=<private secret> node scripts/fulfill-voucher-orders.mjs --orders private-input/paid-orders.csv");
 const inputPath=resolve(args[1]);
 const privateInput=resolve("private-input");
 if(!(inputPath.startsWith(privateInput+"/")))throw Error("ORDERS_MUST_BE_IN_PRIVATE_INPUT");
 const ordersCsv=await readFile(inputPath,"utf8");
 const result=await fulfillOrders({ordersCsv,pepper:process.env.ACTIVATION_PEPPER,
  outputDir:resolve("private-output")});
 // Only filenames and totals; never print codes, secret, hashes, or order IDs.
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{await main(process.argv.slice(2))}
 catch(e){process.stderr.write("OFFLINE_FULFILLMENT_STOPPED: "+e.message+"\n");process.exitCode=1}
}
