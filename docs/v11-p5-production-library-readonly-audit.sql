-- WordLetter V1.1 P5: read-only published-library learning metadata audit.
-- Returns AGGREGATED book-level counts; no customer, voucher or token data.
-- Run only after independently verifying the D1 target and backup/Time Travel.
-- This SQL must never mutate data and MUST NOT be wired to a public endpoint.
WITH published_words AS (
  SELECT DISTINCT b.id AS book_id,b.title AS book_title,c.slug AS category,
    w.id AS word_id,w.headword,w.part_of_speech,w.meaning_zh,
    w.phonetic_uk,w.phonetic_us,w.example_en,w.example_zh,w.collocations_json
  FROM books b
  JOIN categories c ON c.id=b.category_id
  JOIN chapters ch ON ch.book_id=b.id
  JOIN chapter_words cw ON cw.chapter_id=ch.id
  JOIN words w ON w.id=cw.word_id
  WHERE b.status='published' AND ch.published_at IS NOT NULL
),
per_book AS (
  SELECT book_id,book_title,category,COUNT(*) AS distinct_word_cards,
    SUM(CASE WHEN LENGTH(TRIM(COALESCE(phonetic_uk,'')))=0 THEN 1 ELSE 0 END) AS missing_uk_ipa,
    SUM(CASE WHEN LENGTH(TRIM(COALESCE(phonetic_us,'')))=0 THEN 1 ELSE 0 END) AS missing_us_ipa,
    SUM(CASE WHEN LENGTH(TRIM(COALESCE(part_of_speech,'')))=0 THEN 1 ELSE 0 END) AS missing_pos,
    SUM(CASE WHEN LENGTH(TRIM(COALESCE(meaning_zh,'')))=0 THEN 1 ELSE 0 END) AS missing_meaning,
    SUM(CASE WHEN LENGTH(TRIM(COALESCE(example_en,'')))=0 THEN 1 ELSE 0 END) AS missing_example_en,
    SUM(CASE WHEN LENGTH(TRIM(COALESCE(example_zh,'')))=0 THEN 1 ELSE 0 END) AS missing_example_zh,
    SUM(CASE WHEN collocations_json IS NOT NULL AND TRIM(collocations_json)!=''
      AND json_valid(collocations_json)=0 THEN 1 ELSE 0 END) AS malformed_collocations
  FROM published_words
  GROUP BY book_id,book_title,category
)
SELECT book_id,book_title,category,distinct_word_cards,
  missing_uk_ipa,missing_us_ipa,missing_pos,missing_meaning,
  missing_example_en,missing_example_zh,malformed_collocations
FROM per_book
ORDER BY category,book_title;
