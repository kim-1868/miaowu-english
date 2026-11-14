// Owner-authorized CET4-02 exact 144 headword card lookup (production read-only).
// No customer, purchase or paid chapter content. Results remain PRIVATE and encrypted.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const HEADWORDS = Object.freeze([
  "aboard",
  "abundant",
  "accelerate",
  "acceleration",
  "accent",
  "accommodate",
  "accordance",
  "accumulate",
  "advance",
  "aeroplane",
  "aircraft",
  "airline",
  "airplane",
  "arise",
  "aviation",
  "baggage",
  "bicycle",
  "brake",
  "carriage",
  "celebrate",
  "claw",
  "collaborate",
  "commitment",
  "commonly",
  "contribute",
  "cough",
  "course",
  "crack",
  "creep",
  "crime",
  "cross",
  "cycle",
  "deceive",
  "deck",
  "deduce",
  "deed",
  "depart",
  "destination",
  "disorder",
  "dissatisfy",
  "distinct",
  "distribution",
  "dominate",
  "dorm",
  "dormitory",
  "downward",
  "dozen",
  "drawer",
  "drip",
  "drown",
  "drug",
  "dull",
  "dusk",
  "eager",
  "earnest",
  "edition",
  "eighty",
  "eliminate",
  "elsewhere",
  "embarrass",
  "embrace",
  "emit",
  "enclose",
  "encounter",
  "enforce",
  "englishman",
  "enhance",
  "enlarge",
  "enormous",
  "enthusiastic",
  "envy",
  "essential",
  "eve",
  "eventually",
  "evident",
  "evil",
  "exaggerate",
  "exceed",
  "exclaim",
  "exhibit",
  "expansion",
  "extend",
  "extension",
  "eyesight",
  "faint",
  "fame",
  "fare",
  "farewell",
  "fashionable",
  "fatigue",
  "favorable",
  "feasible",
  "fetch",
  "fierce",
  "fight",
  "flexible",
  "funeral",
  "gather",
  "highway",
  "hire",
  "indicate",
  "intimate",
  "landing",
  "lay",
  "line",
  "locate",
  "lorry",
  "mirror",
  "navigation",
  "passenger",
  "poke",
  "popular",
  "proceed",
  "prominent",
  "quit",
  "railroad",
  "refer",
  "roar",
  "seek",
  "shave",
  "shriek",
  "society",
  "speed",
  "steer",
  "suburb",
  "subway",
  "superior",
  "surprisingly",
  "surrender",
  "terminal",
  "track",
  "traffic",
  "tram",
  "transportation",
  "truck",
  "tube",
  "tunnel",
  "tyre",
  "unusual",
  "vehicle",
  "velocity",
  "waggon",
  "wagon",
  "wing"
]);
const sorted = [...HEADWORDS].sort();
assert.equal(HEADWORDS.length,144);
assert.equal(new Set(HEADWORDS).size,144);
assert.deepEqual(HEADWORDS, sorted);
assert.ok(HEADWORDS.every(x=>/^[a-z][a-z-]*$/.test(x)));
const makeSql=()=>{
  const quoted=HEADWORDS.map(x=>"'"+x+"'").join(",");
  const sql=[
    "SELECT w.id AS word_id, w.headword, w.part_of_speech, w.meaning_zh,",
    "w.phonetic_uk, w.phonetic_us, w.example_en, w.example_zh,",
    "w.collocations_json,",
    "(SELECT COUNT(*) FROM chapter_words cw",
    " JOIN chapters ch ON ch.id=cw.chapter_id",
    " JOIN books b ON b.id=ch.book_id",
    " WHERE cw.word_id=w.id AND b.status='published'",
    " AND ch.published_at IS NOT NULL) AS published_anchors",
    "FROM words w WHERE lower(trim(w.headword)) IN ("+quoted+")",
    "ORDER BY lower(trim(w.headword)), w.part_of_speech, w.id;"
  ].join("\n");
  assert.equal((sql.match(/;/g)||[]).length,1);
  assert.match(sql,/^SELECT\b/);
  assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|DROP|ALTER|PRAGMA|users|orders|payments|purchases|user_study)\b/i);
  return sql;
};
const mode=process.argv[2];
if(mode==='sql'){
  process.stdout.write(makeSql()+"\n");
}else if(mode==='verify'){
  assert.equal(process.argv.length,5,'usage: verify <wrangler-output.json> <private-output.json>');
  const body=JSON.parse(readFileSync(process.argv[3],'utf8'));
  const batches=Array.isArray(body)?body:[body];
  assert.ok(batches.length>=1&&batches.length<=2,'unexpected result batches');
  assert.ok(batches.every(b=>b&&b.success===true&&Array.isArray(b.results)),'D1 query failed');
  const rows=batches.flatMap(b=>b.results);
  assert.ok(rows.length<=3000,'unexpected result volume');
  const heads=new Set(HEADWORDS);
  const seen=new Set();
  for(const r of rows){
    assert.ok(r&&typeof r.word_id==='string'&&r.word_id.length>0,'missing card id');
    assert.ok(typeof r.headword==='string'&&heads.has(r.headword.trim().toLowerCase()),'unexpected headword');
    assert.ok(Number.isSafeInteger(r.published_anchors)&&r.published_anchors>=0,'invalid anchor count');
    assert.ok(!seen.has(r.word_id),'duplicate card id');
    seen.add(r.word_id);
  }
  const found=new Set(rows.map(r=>r.headword.trim().toLowerCase()));
  const unmatched=HEADWORDS.filter(x=>!found.has(x));
  const counts=new Map();
  for(const row of rows){const key=row.headword.trim().toLowerCase();counts.set(key,(counts.get(key)||0)+1)}
  const report={
    review_type:'CET4-02_144_TARGET_PRODUCTION_READONLY_LEGACY_WORD_CANDIDATES',
    scope:'current D1 words table, not necessarily approved senses',
    total_target_heads:HEADWORDS.length,
    matched_headwords:found.size,card_rows:rows.length,
    ambiguous_headwords:[...counts].filter(([k,v])=>v>1).map(([k,v])=>({headword:k,candidate_cards:v})),
    missing_headwords:unmatched,
    cards:rows,
    confirmed_publisher_approval:false,
    confirmed_crossbook_study_state:false,
    production_writes:0
  };
  writeFileSync(process.argv[4],JSON.stringify(report,null,2)+"\n",{mode:0o600});
  // Do not log word_id, definitions, phonetics or examples: public workflows may expose logs.
  console.log('CET4_02_PRIVATE_READONLY_OK heads='+HEADWORDS.length+
    ' matched='+found.size+' candidate_cards='+rows.length+
    ' ambiguous='+report.ambiguous_headwords.length+' unmatched='+unmatched.length);
}else{
  throw Error('Usage: node scripts/cet4-02-production-wordcards-readonly.mjs sql | verify <wrangler.json> <private-report.json>');
}
