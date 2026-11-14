-- Read-only private editorial input. One SELECT; no paid manuscript text, users or orders.
-- Only cards referenced by PUBLISHED novels and PUBLISHED chapters.
SELECT b.id AS book_id,b.category_id AS category_id,
 w.id AS old_word_id,w.headword AS headword,
 w.part_of_speech AS pos,w.meaning_zh AS gloss_zh,
 w.phonetic_uk AS phonetic_uk,w.phonetic_us AS phonetic_us,
 w.example_en AS example_en,w.example_zh AS example_zh,
 COUNT(*) AS occurrences
FROM chapter_words cw
JOIN chapters ch ON ch.id=cw.chapter_id
JOIN books b ON b.id=ch.book_id
JOIN words w ON w.id=cw.word_id
WHERE b.status='published' AND ch.published_at IS NOT NULL
GROUP BY b.id,b.category_id,w.id,w.headword,w.part_of_speech,w.meaning_zh,
 w.phonetic_uk,w.phonetic_us,w.example_en,w.example_zh
ORDER BY b.id,w.id;
