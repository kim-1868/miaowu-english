-- Private CI fixture only. NEVER execute this against production or Cloudflare remote databases.
INSERT OR IGNORE INTO books(id,category_id,title,description,cover_key,status,sort_order)
 VALUES('wave2-qa-book','cet4','QA验收专用小花店','隔离自动化用的一本短篇',NULL,'published',0);
INSERT OR IGNORE INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at)
 VALUES('wave2-qa-chapter','wave2-qa-book',1,'一次新开始',
 '{"paragraphs":[{"segments":[{"text":"她轻轻推开花店的门，决定用自己的 "},{"wordId":"wave2-qa-word","surface":"ability","gloss":"能力"},{"text":" 经营这个小空间。"}]},{"segments":[{"text":"第二天她继续整理花束，并再次练习单词。"}]},{"segments":[{"text":"下雨的时候，她把灯打开，继续认真阅读故事。"}]}]}',0,CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO words(id,headword,phonetic_uk,phonetic_us,part_of_speech,meaning_zh,example_en,example_zh,collocations_json)
 VALUES('wave2-qa-word','ability','/əˈbɪləti/','/əˈbɪləti/','n.','能力','She has the ability to succeed.','她有成功的能力。','[]');
INSERT OR IGNORE INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor)
 VALUES('wave2-qa-chapter','wave2-qa-word','决定用自己的 ability 经营这个小空间','p0:ability');
