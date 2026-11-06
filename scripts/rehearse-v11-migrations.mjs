// V1.1 P5: entirely offline 009/010/011 migration rehearsal.
// No network, Wrangler, Cloudflare secrets, or remote database write paths.
// Optionally accepts a trusted local SQL export, never uploads it.
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {readFileSync,statSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const stages=["009_v11_onboarding","010_v11_my_bookshelf","011_v11_study_schedules"];
const expected={
 user_onboarding:["user_id","completed_at","completion_kind","first_word_tip_at","first_bookmark_tip_at","created_at"],
 user_bookmarks:["user_id","book_id","created_at"],
 user_study_schedules:["user_id","study_key","stage_index","due_at","last_positive_day","last_reviewed_at","mastered","bookmarked","created_at","updated_at"]
};
const assert=(value,code)=>{if(!value)throw Error(code)};
const quot=s=>'"'+s.replaceAll('"','""')+'"';
const baseTables=db=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
const columns=(db,table)=>db.prepare("PRAGMA table_info("+quot(table)+")").all().map(r=>r.name);
const fingerprint=(db,table)=>{
 const cols=columns(db,table),projection=cols.map(quot).join(",");
 const all=db.prepare("SELECT "+projection+" FROM "+quot(table)+" ORDER BY rowid").all();
 return createHash("sha256").update(JSON.stringify({cols,rows:all},(_k,v)=>typeof v==="bigint"?String(v):v)).digest("hex");
};
const fkValid=db=>db.prepare("PRAGMA foreign_key_check").all().length===0;
const integrityValid=db=>db.prepare("PRAGMA integrity_check").get().integrity_check==="ok";
export function rehearseV11Migrations(db){
 assert(integrityValid(db),"V11_BASELINE_INTEGRITY_FAILED");
 assert(fkValid(db),"V11_BASELINE_FOREIGN_KEYS_FAILED");
 const original=baseTables(db);
 for(const name of ["users","books","chapters","words","activation_codes",
  "entitlements","sessions","reading_progress","user_words","review_events",
  "ops_operators","ops_audit_events","ops_book_content_versions","ops_publication_approvals"])
  assert(original.includes(name),"V11_MISSING_BASE_TABLE_"+name);
 const hashes=Object.fromEntries(original.map(name=>[name,fingerprint(db,name)]));
 const originalSchema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master "+
  "WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
 const sqls=stages.map(name=>readFileSync(new URL("../db/"+name+".sql",import.meta.url),"utf8"));
 for(const sql of sqls){
  assert(!/\b(?:ALTER\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+[a-z_]|INSERT\s+INTO|REPLACE\s+INTO)\b/i.test(sql),
   "V11_NON_ADDITIVE_DDL_FOUND");
 }
 for(let pass=0;pass<2;pass++){
  for(let i=0;i<stages.length;i++){
   try{db.exec(sqls[i])}catch{throw Error("V11_MIGRATION_FAILED_"+stages[i]+"_PASS_"+(pass+1))}
  }
  for(const [table,expectedColumns] of Object.entries(expected)){
   assert(baseTables(db).includes(table),"V11_TABLE_MISSING_"+table);
   assert(JSON.stringify(columns(db,table))===JSON.stringify(expectedColumns),
     "V11_TABLE_SHAPE_MISMATCH_"+table);
   assert(db.prepare("SELECT count(*) AS n FROM "+quot(table)).get().n===0,
     "V11_NEW_TABLE_UNEXPECTED_ROWS_"+table);
  }
  for(const table of original)
   assert(fingerprint(db,table)===hashes[table],"V11_LEGACY_TABLE_CHANGED_"+table);
  assert(fkValid(db),"V11_FOREIGN_KEYS_FAILED_PASS_"+(pass+1));
  assert(integrityValid(db),"V11_INTEGRITY_FAILED_PASS_"+(pass+1));
 }
 const after=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master "+
  "WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
 const beforeNames=new Set(originalSchema.map(x=>x.type+":"+x.name));
 const changed=originalSchema.filter(row=>{
  const end=after.find(x=>x.type===row.type&&x.name===row.name);
  return !end||end.tbl_name!==row.tbl_name||end.sql!==row.sql;
 });
 assert(changed.length===0,"V11_EXISTING_SCHEMA_CHANGED");
 const newTables=baseTables(db).filter(name=>!original.includes(name));
 assert(JSON.stringify(newTables.sort())===JSON.stringify(Object.keys(expected).sort()),
  "V11_UNEXPECTED_TABLES_CREATED");
 return {dryRunPassed:true,remoteDatabaseModified:false,
   oldTablesPreserved:original.length,oldRowsPreserved:true,
   migrationFiles:stages.map(s=>"db/"+s+".sql"),newTables,
   duplicateApplyPassed:true,foreignKeys:"ok",integrity:"ok",
   newSchemaObjects:after.filter(x=>!beforeNames.has(x.type+":"+x.name)).map(x=>({type:x.type,name:x.name}))};
}
export function newFixture(){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 for(const part of ["001_schema","002_s1","003_public_categories","004_editorial_content",
  "005_editorial_revisions","006_editorial_review_signoffs",
  "007_ops_identity_audit","008_ops_release_workflow"]){
  db.exec(readFileSync(new URL("../db/"+part+".sql",import.meta.url),"utf8"));
 }
 // Representative old customer and review history. No real customer records.
 db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES"+
  "('old-1','old-reader','hash','salt'),('old-2','old-reader-2','hash2','salt2')");
 db.exec("INSERT INTO books(id,category_id,title,status) VALUES('book-1','cet4','Legacy book','published')");
 db.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES"+
  "('ch-1','book-1',1,'Old chapter','{}','2026-01-01 00:00:00')");
 db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES"+
  "('w-1','memory','n.','记忆')");
 db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES"+
  "('ch-1','w-1','A memory.','p1:w1')");
 db.exec("INSERT INTO entitlements(user_id,category_id) VALUES('old-1','cet4')");
 db.exec("INSERT INTO activation_codes(id,code_hash,category_id,status) VALUES"+
  "('code-1','aabbccdd','cet4','unused')");
 db.exec("INSERT INTO reading_progress(user_id,chapter_id,progress,completed_at) VALUES"+
  "('old-1','ch-1',1,'2026-11-01 08:00:00')");
 db.exec("INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) VALUES"+
  "('old-1','w-1','mastered',1,NULL)");
 db.exec("INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) VALUES"+
  "('ev-1','old-1','w-1','ch-1','story-echo-fill','correct')");
 return db;
}
function main(){
 const path=process.argv[2];
 if(path&&path.startsWith("-"))throw Error("USAGE: [LOCAL_TRUSTED_SQL_EXPORT_PATH]");
 let db;
 if(path){
  const file=resolve(path),bytes=statSync(file).size;
  assert(bytes>100&&bytes<=250*1024*1024,"INVALID_LOCAL_EXPORT_SIZE");
  const sql=readFileSync(file,"utf8");
  db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(sql);
 }else db=newFixture();
 try{process.stdout.write(JSON.stringify(rehearseV11Migrations(db),null,2)+"\n")}
 finally{db.close()}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{main()}catch(err){process.stderr.write("V11_LOCAL_REHEARSAL_FAILED: "+err.message+"\n");process.exitCode=1}
}
