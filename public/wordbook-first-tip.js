// A tiny, local-only hint contract. Not attached to live routes until smart vocabulary ships.
// Never modifies the existing registration welcome guide or the first-word hint.
export function createWordbookFirstTip({storage,username,smartReady=false,onboardingPending=false}={}){
  const account=String(username||'').trim().toLowerCase();
  const key='miaowu_wordbook_hint_v1:'+encodeURIComponent(account);
  const usable=!!account&&!!storage&&typeof storage.getItem==='function'&&typeof storage.setItem==='function';
  const shouldShow=()=>{
    if(!usable||smartReady!==true||onboardingPending===true)return false;
    try{return storage.getItem(key)!=='done'}catch{return false}
  };
  const dismiss=()=>{
    if(!usable)return false;
    try{storage.setItem(key,'done');return true}catch{return false}
  };
  return {shouldShow,dismiss};
}
