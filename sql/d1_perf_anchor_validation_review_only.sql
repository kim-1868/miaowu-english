-- Review-only replacement for the Cloudflare Insights hot query (2026-11-15).
-- Historical input: b.id=? marks the replaced book, b.category_id=? selects level.
-- Do NOT execute automatically in production: prove result equivalence in staging
-- and verify real rows_read with Query Insights before substituting any job.
--
-- Rather than JSON_EACH over EVERY paragraph and EVERY segment for EACH
-- chapter_words row, use the already-stored canonical context_anchor to
-- extract precisely one segment's .wordId. Preserve:
--   * published/visible category and chapter filters
--   * wordId must agree with cw.word_id
--   * nonblank gloss and POS
--   * exact canonical anchor shape p<nonnegative integer>:s<nonnegative integer>
--   * DISTINCT headwords plus is_replaced marker
-- Invalid chapter JSON yields no match, as in the old query.

SELECT DISTINCT w.headword, b.id = ? AS is_replaced
FROM chapter_words cw
JOIN chapters ch ON ch.id = cw.chapter_id
JOIN books b ON b.id = ch.book_id
JOIN categories c ON c.id = b.category_id
JOIN words w ON w.id = cw.word_id
WHERE b.category_id = ?
  AND c.is_visible = 1
  AND b.status = 'published'
  AND ch.published_at IS NOT NULL
  AND ch.published_at <= CURRENT_TIMESTAMP
  AND trim(coalesce(w.meaning_zh, '')) <> ''
  AND trim(coalesce(w.part_of_speech, '')) <> ''
  AND CASE WHEN
    cw.context_anchor =
      'p' || CAST(substr(cw.context_anchor,2,instr(cw.context_anchor,':s')-2) AS INTEGER)
      || ':s' || CAST(substr(cw.context_anchor,instr(cw.context_anchor,':s')+2) AS INTEGER)
    AND CAST(substr(cw.context_anchor,2,instr(cw.context_anchor,':s')-2) AS INTEGER) >= 0
    AND CAST(substr(cw.context_anchor,instr(cw.context_anchor,':s')+2) AS INTEGER) >= 0
  THEN json_extract(
    CASE WHEN json_valid(ch.content_json) THEN ch.content_json ELSE '{}' END,
    '$.paragraphs[' ||
      CAST(substr(cw.context_anchor,2,instr(cw.context_anchor,':s')-2) AS INTEGER)
      || '].segments[' ||
      CAST(substr(cw.context_anchor,instr(cw.context_anchor,':s')+2) AS INTEGER)
      || '].wordId'
  ) ELSE NULL END = w.id;
