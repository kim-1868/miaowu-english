-- V1.2 approved-scope production SELECT. Returns ONLY 772 already detected
-- textual gloss mismatches from duplicate old-card sense groups; no user/order
-- columns, no whole chapter content, no adjacent narrative sentences.
WITH published AS (
 SELECT b.id AS book_id,ch.id AS chapter_id,cw.context_anchor,
  cw.word_id AS legacy_word_id,w.headword,w.part_of_speech AS pos,
  w.meaning_zh AS old_gloss,w.phonetic_uk,w.phonetic_us,
  w.example_en,w.example_zh,
  CASE WHEN json_valid(ch.content_json)=1 THEN
   json_extract(ch.content_json,
    '$.paragraphs['||
    CAST(substr(cw.context_anchor,2,instr(cw.context_anchor,':')-2) AS INTEGER)||
    '].segments['||
    CAST(substr(cw.context_anchor,instr(cw.context_anchor,':s')+2) AS INTEGER)||
    ']') ELSE NULL END AS segment_json
 FROM chapter_words cw
 JOIN chapters ch ON ch.id=cw.chapter_id
 JOIN books b ON b.id=ch.book_id
 JOIN words w ON w.id=cw.word_id
 WHERE b.status='published' AND ch.published_at IS NOT NULL
  AND ch.published_at<=CURRENT_TIMESTAMP
), duplicate_groups AS (
 SELECT lower(trim(headword)) AS lemma,lower(trim(coalesce(pos,''))) AS pos,
  trim(coalesce(old_gloss,'')) AS old_gloss
 FROM published
 GROUP BY lemma,pos,old_gloss
 HAVING count(DISTINCT legacy_word_id)>1
), parsed AS (
 SELECT p.*,
  CASE WHEN json_valid(segment_json)=1 THEN
   json_extract(segment_json,'$.wordId') ELSE NULL END AS actual_word_id,
  CASE WHEN json_valid(segment_json)=1 THEN
   json_extract(segment_json,'$.gloss') ELSE NULL END AS context_gloss,
  CASE WHEN json_valid(segment_json)=1 THEN
   json_extract(segment_json,'$.surface') ELSE NULL END AS surface
 FROM published p JOIN duplicate_groups g
 ON g.lemma=lower(trim(p.headword))
 AND g.pos=lower(trim(coalesce(p.pos,'')))
 AND g.old_gloss=trim(coalesce(p.old_gloss,''))
)
SELECT book_id,chapter_id,context_anchor,legacy_word_id,
 headword,pos,old_gloss,context_gloss,surface,
 phonetic_uk,phonetic_us,example_en,example_zh
FROM parsed
WHERE actual_word_id=legacy_word_id AND
 context_gloss IS NOT NULL AND trim(context_gloss)<>'' AND
 replace(trim(context_gloss),' ','')<>replace(trim(old_gloss),' ','')
ORDER BY book_id,chapter_id,context_anchor;
