# V1.2 已发布32本 · 已核准义项只读连接桥

2026-11-12：现有 global_dictionary_book_sense_bindings 受 draft-only trigger 保护，无法在书已published后直接补写。新增staging-only只读已发布旧卡overlay：从现有chapter_words/words引用和global_dictionary_legacy_sense_links中，只读取真正已审核的global_dictionary_senses及已审核、来源许可证确认的lessons/entry。严格检查购买权限或章节预览、来源卡片精确SHA256固定指纹、词头POS中文释义、lesson中唯一审核sense。返回章节锚点到sense_id映射，不更新章节、旧卡、用户学习状态、数据库或运营权限。

路径：GET /api/me/dictionary/chapters/:chapterId/published-legacy-sense-preview 。仅APP_ENV=staging且显式设置GLOBAL_DICTIONARY_PUBLISHED_LEGACY_PREVIEW_ENABLED=true 才可访问；还需要登录和现有购买权限（preview章节例外）。正式站404。返回只读映射，不开启SRS反馈，因此不会出现UI点击后缺少上下文的问题。

卡片历史版本指纹合同：SHA-256(JSON.stringify([legacy_word_id,headword,phonetic_uk,phonetic_us,part_of_speech,meaning_zh,example_en,example_zh,collocations_json]))。后续生成link时必须按这个确定性顺序计算并固定hash，旧卡发生变化则拒绝返回，防止错误学习状态污染。旧link若使用不同SHA算法会被安全拦截而不是错误展示。

本次不将532组未经语境/商用核实的HOLD候选转成正式sense_id。旧卡与审核义项必须完成真正签核/来源审核之后才能绑定。未发布14本不处理。上线前还需要生产schema/接口启用独立安全审批，且跨书学习状态端到端验收。
