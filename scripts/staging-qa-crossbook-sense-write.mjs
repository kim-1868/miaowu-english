// Strict TEST-D1-only crossbook persistence QA.
// One inaccessible QA account, two approved-in-QA fixture locations, one sense
// study row and two different-book feedback events. The final cleanup removes
// only the QA-created records; no normal readers or production operations.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const QA_USER='v12-crossbook-qa-20261112';
export const QA_NAME='v12_crossbook_qa_20261112';
export const QA_SOURCE='wordletter-internal-qa-choice-v12-20261112';
export const BOOK_A='mw-v12-pilot-ex-20261112';
export const BOOK_B='mw-v12-pilot-bride-20261112';
export const CH_A=BOOK_A+'-ch01',CH_B=BOOK_B+'-ch01';
export const WORD_A='mw-v12-pilot-choice-ex';
export const WORD_B='mw-v12-pilot-choice-bride';
export const EVENT_A='a1202611-1212-4121-8121-121212121211';
export const EVENT_B='b1202611-1212-4121-8121-121212121212';
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
export function qaSourceSelect(word){
 return `SELECT s.sense_id,s.entry_id FROM global_dictionary_legacy_sense_links l
 JOIN global_dictionary_senses s ON s.sense_id=l.sense_id
 JOIN global_dictionary_entries e ON e.entry_id=s.entry_id
 JOIN global_dictionary_sources src ON src.source_key=e.source_name
 JOIN global_dictionary_lessons lesson ON lesson.entry_id=e.entry_id
 JOIN words w ON w.id=l.legacy_word_id
 WHERE l.legacy_word_id=${q(word)} AND e.source_name=${q(QA_SOURCE)}
 AND e.teaching_ready=1 AND s.approved=1 AND s.active=1
 AND src.license_reviewed=1 AND src.enabled=1
 AND length(trim(lesson.reviewed_by))>0
 AND w.headword='choice' AND w.meaning_zh='选择'`;
}
const now="strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const day="strftime('%Y-%m-%d','now')";
const due="strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day')";
export function qaCrossbookStatements(){
 const id=q(QA_USER),A=qaSourceSelect(WORD_A),B=qaSourceSelect(WORD_B);
 const one=[
  `INSERT INTO users(id,username,password_hash,password_salt)
    VALUES(${id},${q(QA_NAME)},${q('9'.repeat(64))},${q('8'.repeat(32))});`,
  `INSERT INTO user_dictionary_sense_study
   (user_id,sense_id,status,stage,bookmarked,encounter_count,
    remembered_count,forgotten_count,due_at,last_seen_at,last_feedback_at,
    last_advanced_day,mastered_at,revision)
   SELECT ${id},src.sense_id,'learning',1,0,0,1,0,${due},${now},
    ${now},${day},NULL,1 FROM (${A}) src;`,
  `INSERT INTO user_dictionary_sense_review_events
   (event_id,user_id,sense_id,entry_id,action,source_book_id,
    source_chapter_id,source_context_anchor,state_revision)
   SELECT ${q(EVENT_A)},${id},src.sense_id,src.entry_id,'remembered',
    ${q(BOOK_A)},${q(CH_A)},'p0:s7',1 FROM (${A}) src
   JOIN user_dictionary_sense_study st
    ON st.user_id=${id} AND st.sense_id=src.sense_id AND st.revision=1;`
 ];
 const two=[
  `UPDATE user_dictionary_sense_study SET encounter_count=encounter_count+1,
   last_seen_at=${now},revision=revision+1 WHERE user_id=${id}
   AND revision=1 AND sense_id=(SELECT sense_id FROM (${B}));`,
  `INSERT INTO user_dictionary_sense_review_events
   (event_id,user_id,sense_id,entry_id,action,source_book_id,
    source_chapter_id,source_context_anchor,state_revision)
   SELECT ${q(EVENT_B)},${id},src.sense_id,src.entry_id,'seen',
    ${q(BOOK_B)},${q(CH_B)},'p0:s7',2 FROM (${B}) src
   JOIN user_dictionary_sense_study st
    ON st.user_id=${id} AND st.sense_id=src.sense_id
    AND st.revision=2 AND st.encounter_count=1;`
 ];
 const check=`SELECT
  (SELECT count(*) FROM users WHERE id=${id} AND username=${q(QA_NAME)}) qa_users,
  (SELECT count(*) FROM user_dictionary_sense_study WHERE user_id=${id}) study_rows,
  (SELECT coalesce(max(revision),0) FROM user_dictionary_sense_study WHERE user_id=${id}) revision,
  (SELECT coalesce(sum(remembered_count),0) FROM user_dictionary_sense_study WHERE user_id=${id}) remembered,
  (SELECT coalesce(sum(encounter_count),0) FROM user_dictionary_sense_study WHERE user_id=${id}) seen,
  (SELECT count(*) FROM user_dictionary_sense_review_events WHERE user_id=${id}) events,
  (SELECT count(DISTINCT source_book_id) FROM user_dictionary_sense_review_events WHERE user_id=${id}) source_books,
  (SELECT count(DISTINCT sense_id) FROM user_dictionary_sense_review_events WHERE user_id=${id}) distinct_event_senses,
  (SELECT count(*) FROM user_dictionary_sense_review_events WHERE user_id=${id}
   AND ((event_id=${q(EVENT_A)} AND action='remembered' AND source_chapter_id=${q(CH_A)})
   OR (event_id=${q(EVENT_B)} AND action='seen' AND source_chapter_id=${q(CH_B)}))) expected_events,
  (SELECT count(*) FROM users WHERE username=${q(QA_NAME)} AND id!=${id}) username_conflicts;`;
 const clean=[
  `DELETE FROM user_dictionary_sense_review_events WHERE user_id=${id}
    AND event_id IN (${q(EVENT_A)},${q(EVENT_B)});`,
  `DELETE FROM user_dictionary_sense_study WHERE user_id=${id}
    AND sense_id=(SELECT sense_id FROM (${A}));`,
  `DELETE FROM users WHERE id=${id} AND username=${q(QA_NAME)};`
 ];
 const preflight=`SELECT
   (SELECT count(*) FROM users WHERE id=${id} OR username=${q(QA_NAME)}) qa_user_collisions,
   (SELECT count(*) FROM user_dictionary_sense_study WHERE user_id=${id}) qa_study_collisions,
   (SELECT count(*) FROM user_dictionary_sense_review_events WHERE user_id=${id}
     OR event_id IN (${q(EVENT_A)},${q(EVENT_B)})) qa_event_collisions,
   (SELECT count(*) FROM (${A})) source_a,
   (SELECT count(*) FROM (${B})) source_b,
   (SELECT count(*) FROM (${A}) a JOIN (${B}) b ON a.sense_id=b.sense_id
     AND a.entry_id=b.entry_id) same_qa_sense,
   (SELECT count(*) FROM chapter_words WHERE chapter_id IN
     (${q(CH_A)},${q(CH_B)}) AND word_id IN (${q(WORD_A)},${q(WORD_B)})) source_anchors;`;
 return {preflight,first:one.join('\n')+'\n',second:two.join('\n')+'\n',
  check,cleanup:clean.join('\n')+'\n'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,4,'QA_SQL_OUTPUT_DIRECTORY_REQUIRED');
  const path=process.argv[3];
  assert.ok(path.startsWith('/'),'QA_SQL_OUTPUT_MUST_BE_ABSOLUTE');
  const pieces=qaCrossbookStatements();
  for(const [name,sql] of Object.entries(pieces)){
   writeFileSync(path+'/'+name+'.sql',sql,{flag:'wx',mode:0o600});
  }
  console.log('STAGING_QA_CROSSBOOK_SQL_GENERATED_NO_DB_WRITES');
 }catch(e){console.error('QA_SQL_GENERATOR_BLOCKED',e.message);process.exitCode=1}
}
