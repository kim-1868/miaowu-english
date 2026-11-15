-- Review-only replacement for the Cloudflare D1 2026-11-15 1.31M-rows query.
-- This file is NOT a production migration and MUST NOT be run on production
-- without identifying its original caller and proving correctness on staging.
--
-- Match each stored chapter_words.context_anchor of form pN:sM directly to its
-- single corresponding JSON segment. The original query cross joined JSON
-- paragraphs and segments before filtering by context_anchor, amplifying D1
-- reads enormously. This form avoids both JSON_EACH virtual-table scans.
--
-- Requirement: published chapter JSON uses paragraphs[]/segments[] arrays,
-- which is the supported novel import schema. Test against a snapshot before
-- replacing the original query in any script or operator workflow.
SELECT
  c.slug,
  b.id AS book_id,
  lower(trim(w.headword)) AS headword,
  COUNT(*) AS occurrences
FROM chapter_words cw
JOIN chapters ch ON ch.id = cw.chapter_id
JOIN books b ON b.id = ch.book_id
JOIN categories c ON c.id = b.category_id
JOIN words w ON w.id = cw.word_id
WHERE
  c.is_visible = 1
  AND b.status = 'published'
  AND ch.published_at IS NOT NULL
  AND ch.published_at <= CURRENT_TIMESTAMP
  AND trim(w.meaning_zh) <> ''
  AND trim(w.part_of_speech) <> ''
  AND instr(cw.context_anchor, ':s') > 2
  AND cw.context_anchor =
    'p' || CAST(substr(cw.context_anchor, 2,
      instr(cw.context_anchor, ':s') - 2) AS INTEGER)
    || ':s' || CAST(substr(cw.context_anchor,
      instr(cw.context_anchor, ':s') + 2) AS INTEGER)
  AND CAST(substr(cw.context_anchor, 2,
    instr(cw.context_anchor, ':s') - 2) AS INTEGER) >= 0
  AND CAST(substr(cw.context_anchor,
    instr(cw.context_anchor, ':s') + 2) AS INTEGER) >= 0
  AND json_extract(ch.content_json,
    '$.paragraphs[' || CAST(substr(cw.context_anchor, 2,
      instr(cw.context_anchor, ':s') - 2) AS INTEGER)
    || '].segments[' || CAST(substr(cw.context_anchor,
      instr(cw.context_anchor, ':s') + 2) AS INTEGER)
    || '].wordId'
  ) = cw.word_id
GROUP BY c.slug, b.id, lower(trim(w.headword));
