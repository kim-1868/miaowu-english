-- Fixed private production READ ONLY SELECT. No manuscript or identifiers in output.
-- Check actual segmented context on 32 PUBLISHED novels against legacy cards.
WITH published AS (
 SELECT b.id AS book_id,cw.word_id,cw.context_anchor,
   w.headword,w.part_of_speech,w.meaning_zh,
   CASE WHEN json_valid(ch.content_json)=1 THEN
    json_extract(ch.content_json,
      '$.paragraphs['||
      CAST(substr(cw.context_anchor,2,instr(cw.context_anchor,':')-2) AS INTEGER)||
      '].segments['||
      CAST(substr(cw.context_anchor,instr(cw.context_anchor,':s')+2) AS INTEGER)||
      ']')
   ELSE NULL END AS segment_json,
   json_valid(ch.content_json) AS json_ok
 FROM chapter_words cw
 JOIN chapters ch ON ch.id=cw.chapter_id
 JOIN books b ON b.id=ch.book_id
 JOIN words w ON w.id=cw.word_id
 WHERE b.status='published' AND ch.published_at IS NOT NULL
    AND ch.published_at<=CURRENT_TIMESTAMP
),
parsed AS (
 SELECT *,
    json_extract(segment_json,'$.wordId') AS segment_word_id,
    json_extract(segment_json,'$.surface') AS segment_surface,
    json_extract(segment_json,'$.gloss') AS segment_gloss
 FROM published
),
textual_duplicate AS (
 SELECT lower(trim(headword)) AS lemma,
  lower(trim(coalesce(part_of_speech,''))) AS pos,
  trim(coalesce(meaning_zh,'')) AS meaning_zh
 FROM published
 GROUP BY lemma,pos,meaning_zh
 HAVING count(DISTINCT word_id)>1
),
scoped AS (
 SELECT p.*,
  CASE WHEN d.lemma IS NOT NULL THEN 1 ELSE 0 END AS duplicate_group
 FROM parsed p LEFT JOIN textual_duplicate d
 ON d.lemma=lower(trim(p.headword))
 AND d.pos=lower(trim(coalesce(p.part_of_speech,'')))
 AND d.meaning_zh=trim(coalesce(p.meaning_zh,''))
)
SELECT
 count(*) AS published_anchors,
 count(DISTINCT book_id) AS published_books,
 count(DISTINCT word_id) AS all_distinct_old_ids,
 sum(duplicate_group) AS duplicate_candidate_anchors,
 count(DISTINCT CASE WHEN duplicate_group=1 THEN word_id END) AS duplicate_candidate_old_ids,
 (SELECT count(*) FROM textual_duplicate) AS duplicate_candidate_groups,
 sum(CASE WHEN json_ok=0 THEN 1 ELSE 0 END) AS invalid_chapter_json_anchors,
 sum(CASE WHEN segment_json IS NULL THEN 1 ELSE 0 END) AS missing_context_segments,
 sum(CASE WHEN segment_json IS NOT NULL AND segment_word_id=word_id THEN 1 ELSE 0 END) AS confirmed_matching_wordid_anchors,
 sum(CASE WHEN segment_json IS NOT NULL AND (segment_word_id IS NULL OR segment_word_id<>word_id) THEN 1 ELSE 0 END) AS mismatched_wordid_anchors,
 sum(CASE WHEN segment_json IS NOT NULL AND (segment_gloss IS NULL OR trim(segment_gloss)='') THEN 1 ELSE 0 END) AS missing_context_gloss_anchors,
 sum(CASE WHEN duplicate_group=1 AND segment_word_id=word_id AND
    replace(trim(segment_gloss),' ','')=replace(trim(meaning_zh),' ','')
    THEN 1 ELSE 0 END) AS duplicate_gloss_equal_anchors,
 sum(CASE WHEN duplicate_group=1 AND segment_word_id=word_id AND
    segment_gloss IS NOT NULL AND trim(segment_gloss)<>'' AND
    replace(trim(segment_gloss),' ','')<>replace(trim(meaning_zh),' ','')
    THEN 1 ELSE 0 END) AS duplicate_gloss_mismatch_anchors,
 sum(CASE WHEN duplicate_group=1 AND (segment_surface IS NULL OR trim(segment_surface)='') THEN 1 ELSE 0 END) AS duplicate_missing_surface_anchors
FROM scoped;
