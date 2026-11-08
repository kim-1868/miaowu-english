// V1.1 per-account onboarding. No row = existing account, never auto-prompt.
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{
  "content-type":"application/json; charset=utf-8","cache-control":"no-store",
  "x-content-type-options":"nosniff","content-security-policy":"default-src 'none'"
}});
const query=(env,sql,...values)=>env.DB.prepare(sql).bind(...values);
export async function onboardingSchemaReady(env){
  try {
    const found=await query(env,"SELECT name FROM sqlite_master WHERE type='table' AND name='user_onboarding'").first();
    return found?.name==="user_onboarding";
  }catch{return false}
}
export function registrationOnboardingStatement(env,userId){
  return query(env,"INSERT INTO user_onboarding(user_id) VALUES(?)",userId);
}
export async function handleOnboarding(req,env,user){
  if(!user)return reply({error:"LOGIN_REQUIRED"},401);
  if(!await onboardingSchemaReady(env))return reply({error:"ONBOARDING_NOT_READY"},503);
  const entry=await query(env,
    "SELECT completed_at,completion_kind,first_word_tip_at,first_bookmark_tip_at FROM user_onboarding WHERE user_id=?",
    user.id).first();
  if(req.method==="GET"){
    return reply({
      eligible:!!entry,
      pending:!!entry&&!entry.completed_at,
      completionKind:entry?.completion_kind||null,
      wordTipPending:!!entry&&!entry.first_word_tip_at,
      bookmarkTipPending:!!entry&&!entry.first_bookmark_tip_at
    });
  }
  if(req.method!=="PUT")return reply({error:"METHOD_NOT_ALLOWED"},405);
  if(!entry)return reply({error:"ONBOARDING_NOT_APPLICABLE"},409);
  let body;
  try {body=await req.json()}catch{return reply({error:"INVALID_JSON"},400)}
  if(!body || typeof body!=="object" || Array.isArray(body))return reply({error:"INVALID_INPUT"},400);
  const keys=Object.keys(body);
  if(keys.length!==1)return reply({error:"INVALID_INPUT"},400);
  if(body.complete==="finished"||body.complete==="skipped"){
    await query(env,"UPDATE user_onboarding SET completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP),completion_kind=COALESCE(completion_kind,?) WHERE user_id=?",body.complete,user.id).run();
    return reply({ok:true});
  }
  if(body.dismissTip==="word"||body.dismissTip==="bookmark"){
    const column=body.dismissTip==="word"?"first_word_tip_at":"first_bookmark_tip_at";
    await query(env,"UPDATE user_onboarding SET "+column+"=COALESCE("+column+",CURRENT_TIMESTAMP) WHERE user_id=?",user.id).run();
    return reply({ok:true});
  }
  return reply({error:"INVALID_INPUT"},400);
}
