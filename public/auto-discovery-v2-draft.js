// Browser/client-safe, side-effect-free conversion of explicit publisher
// confirmations into a V2 DRAFT. Never creates words[] or publishes books.
// Every auto-suggested gloss still needs human contextual approval.
const positionKey=x=>[x.chapter_number,x.paragraph_index,x.segment_index].join(':');
export function draftAutoDiscoveredV2(source,suggestions){
 if(source?.version!==2||source.words!==undefined||
    !Array.isArray(source.chapters)||!Array.isArray(suggestions)||
    !suggestions.length||suggestions.length>12000)
   throw Error('AUTO_DISCOVERY_INVALID_V2_DRAFT_INPUT');
 const copy=structuredClone(source),groups=new Map();
 for(const hit of suggestions){
  if(hit.action!=='PROPOSE_ONLY_REQUIRES_CONTEXT_EDITOR_CONFIRMATION'||
     !/^gds_[0-9a-f]{24}$/.test(hit.sense_id||'')||
     typeof hit.gloss!=='string'||!hit.gloss.trim()||
     !Number.isInteger(hit.start_offset)||!Number.isInteger(hit.end_offset)||
     !Number.isInteger(hit.chapter_number)||
     !Number.isInteger(hit.paragraph_index)||!Number.isInteger(hit.segment_index))
    throw Error('AUTO_DISCOVERY_SUGGESTION_UNVERIFIED');
  const key=positionKey(hit);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(hit);
 }
 let seen=0;
 for(const ch of copy.chapters){
  for(const [pi,para] of ch.paragraphs.entries()){
   para.segments=para.segments.flatMap((seg,si)=>{
    const key=[ch.number,pi,si].join(':');
    const targets=(groups.get(key)||[]).sort((a,b)=>a.start_offset-b.start_offset);
    if(!targets.length)return [seg];
    if(typeof seg.text!=='string'||seg.surface!==undefined)
     throw Error('AUTO_DISCOVERY_POSITION_NOT_PLAIN_TEXT');
    const next=[];let cursor=0;
    for(const hit of targets){
     if(hit.start_offset<cursor||hit.end_offset>seg.text.length||
        hit.end_offset<=hit.start_offset||
        seg.text.slice(hit.start_offset,hit.end_offset)!==hit.surface)
       throw Error('AUTO_DISCOVERY_CONTEXT_CHANGED_OR_OVERLAPPING');
     if(hit.start_offset>cursor)
       next.push({text:seg.text.slice(cursor,hit.start_offset)});
     next.push({surface:hit.surface,gloss:hit.gloss});
     cursor=hit.end_offset;seen++;
    }
    if(cursor<seg.text.length)next.push({text:seg.text.slice(cursor)});
    return next;
   });
  }
 }
 if(seen!==suggestions.length)throw Error('AUTO_DISCOVERY_SUGGESTION_POSITION_NOT_FOUND');
 return copy;
}
