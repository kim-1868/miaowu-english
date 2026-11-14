# V1.2 当前 Publisher 小说版本对账（2026-11-12）

离线安全版本核验：输入用户此前保存的小说历史元数据（书ID、SHA256、章节号、原词卡数）与**通过已登录 Publisher 合法只读导出取得的真实最新快照**（book sha256/revision、chapter id+hash、各 context_anchor/legacy_word_id）。对每本逐项核对缺书、章节变动、文件 SHA 变更、标注数漂移、孤儿锚点、未经过人工确认的词义。输出逐书 review reasons。

不能把 2026-11-06 历史档或已保存两篇修订 JSON 冒充今天上线书籍。当前 browser profile 没有已记录的 Publisher 登录状态，因此**真实最新 Publisher 导出尚不可用**。工具不能从公开仓库恢复付费小说全文，也不从猜测的词义直接生成已发布 sense_id。

已保存的两本书的历史 SHA256 和统计在用户私密交付目录 /mnt/data/miaowu_phase3_20261112/04_两本真实历史小说_新版Publisher对账请求.jsonl。禁止将小说付费内容、用户ID、会话cookie上传公开GitHub。最新只读导出到手后，先编辑确认 sense_id、审核原词/英中例句/许可，再走单独预览站审批。019/020测试结构已完成，但020真实写入仍关闭。
