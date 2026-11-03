// Book covers use existing D1 until an R2 asset bucket is configured.
// Never accept SVG/HTML. Store only small browser-resized JPG/PNG/WebP files.
// Private drafts can be previewed only by a publisher, published covers are public.
import {authenticateOperator,hasOpsRole} from "./ops-access.js";
const ID=/^[a-zA-Z0-9_-]{1,80}$/;
const MAX_BYTES=768000;
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{
 "content-type":"application/json; charset=utf-8","cache-control":"private, no-store",
 "x-content-type-options":"nosniff","referrer-policy":"no-referrer"
}});
const error=(id,status)=>json({error:id},status);
const stmt=(db,sql,...binds)=>db.prepare(sql).bind(...binds);
function identify(bytes){
 if(bytes.length<16)return null;
 if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return "image/jpeg";
 if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return "image/png";
 if([82,73,70,70].every((v,i)=>bytes[i]===v)&&
    [87,69,66,80].every((v,i)=>bytes[8+i]===v))return "image/webp";
 return null;
}
async function auth(req,env){
 if(!["production","staging"].includes(env.APP_ENV)||env.OPS_CONSOLE_ENABLED!=="true")
  return {response:error("NOT_FOUND",404)};
 const check=await authenticateOperator(req,env);
 if(check.response)return check;
 if(!hasOpsRole(check.operator,"publisher"))
  return {response:error("OPS_ROLE_FORBIDDEN",403)};
 return check;
}
async function coverRow(env,id,allowDraft){
 // Role-gated preview may read a cover of an unpublished draft.
 // Public requests must not reveal private work-in-progress artwork.
 const row=await stmt(env.DB,`SELECT i.image_bytes,i.content_type,i.checksum
 FROM book_cover_images i JOIN books b ON b.id=i.book_id
 JOIN categories c ON c.id=b.category_id
 WHERE i.book_id=? ${allowDraft?"":"AND b.status='published' AND c.is_visible=1"}`,id).first();
 if(!row)return error("COVER_NOT_FOUND",404);
 let bytes;
 try{bytes=Uint8Array.from(row.image_bytes)}catch{return error("COVER_UNAVAILABLE",503)}
 if(!bytes.length||bytes.length>MAX_BYTES||!identify(bytes))
  return error("COVER_UNAVAILABLE",503);
 return new Response(bytes,{status:200,headers:{
  "content-type":row.content_type,
  "cache-control":allowDraft?"private, no-store":"public, max-age=86400, immutable",
  "etag":'"'+row.checksum+'"',
  "x-content-type-options":"nosniff","cross-origin-resource-policy":"same-origin",
  "content-security-policy":"default-src 'none'; sandbox",
 }});
}
async function upload(req,env,id,operator){
 if(!/^multipart\/form-data;\s*boundary=/i.test(req.headers.get("content-type")||""))
  return error("COVER_MULTIPART_REQUIRED",400);
 const reported=Number(req.headers.get("content-length")||0);
 if(reported>MAX_BYTES+4096)return error("COVER_TOO_LARGE",413);
 let file;
 try{
  const form=await req.formData();
  file=form.get("cover");
 }catch{return error("COVER_INVALID_UPLOAD",400)}
 if(!file||typeof file.arrayBuffer!=="function"||file.size<100||
    file.size>MAX_BYTES)return error("COVER_TOO_LARGE",413);
 const bytes=new Uint8Array(await file.arrayBuffer());
 const mime=identify(bytes);
 if(!mime||file.type!==mime)return error("COVER_NOT_SUPPORTED",415);
 const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
 const checksum=Array.from(hash,x=>x.toString(16).padStart(2,"0")).join("");
 const code="cover-d1-"+checksum.slice(0,24);
 const book=await stmt(env.DB,"SELECT id,status FROM books WHERE id=?",id).first();
 if(!book)return error("BOOK_NOT_FOUND",404);
 try{
  await env.DB.batch([
   stmt(env.DB,`INSERT INTO book_cover_images(book_id,content_type,image_bytes,checksum)
     VALUES(?,?,?,?) ON CONFLICT(book_id) DO UPDATE SET
     content_type=excluded.content_type,image_bytes=excluded.image_bytes,
     checksum=excluded.checksum,updated_at=CURRENT_TIMESTAMP`,
     id,mime,bytes,checksum),
   stmt(env.DB,"UPDATE books SET cover_key=? WHERE id=?",code,id),
   stmt(env.DB,`INSERT INTO ops_audit_events
     (id,actor_id,event_type,resource_type,resource_id,request_id,reason_code)
     VALUES (?,?,'book.cover.upload','book',?,?,'SAFE_IMAGE_VALIDATED')`,
     crypto.randomUUID(),operator.id,id,crypto.randomUUID())
  ]);
 }catch{return error("COVER_SAVE_FAILED",503)}
 return json({uploaded:true,bookId:id,status:book.status,coverKey:code,
   coverUrl:"/api/covers/"+encodeURIComponent(id)+"?v="+checksum.slice(0,24)},201);
}
export async function handleBookCover(req,env,path){
 const pub=path.match(/^\/api\/covers\/([a-zA-Z0-9_-]{1,80})$/);
 if(pub){
  if(req.method!=="GET")return error("NOT_FOUND",404);
  try{return await coverRow(env,pub[1],false)}catch{return error("COVER_NOT_FOUND",404)}
 }
 const ops=path.match(/^\/api\/ops\/books\/([a-zA-Z0-9_-]{1,80})\/cover$/);
 if(!ops)return error("NOT_FOUND",404);
 const verification=await auth(req,env);
 if(verification.response)return verification.response;
 if(req.method==="GET"){
  try{return await coverRow(env,ops[1],true)}catch{return error("COVER_NOT_FOUND",404)}
 }
 if(req.method!=="POST")return error("NOT_FOUND",404);
 try{return await upload(req,env,ops[1],verification.operator)}
 catch{return error("COVER_UNAVAILABLE",503)}
}
