# 四级 23 本已上架小说 · 受控只读批量导出与词典匹配验收
日期：2026-11-10

现有发布者运营台的 GET /api/ops/books/{bookId}/live-editor/export 已有独立认证、版本号和完整词卡/章节导出；本次不新增公开 API。
新增后台按钮：仅经过验证的 staging/production publisher 主动确认后，从已有同源 GET 接口逐本读取 CET4 published，读取当前版本并再次核验运营目录。失败则中止，不生成部分文件。
本地下载一个 JSON 文件，带每本 bookId、章节数、版本、SHA-256 和原始内容。不传公共 GitHub，不携带个人学习状态、订单或激活密钥。
说明：整批不是数据库原子快照。每本书可以在下载之后发生新的更新，因此离线匹配前应重新核对时间与版本。

本地离线复核示例（只在自己的安全工作机运行，禁止公开上传完整书籍内容）：
node scripts/audit-cet4-published-archive-offline.mjs --lexicon /private/考试词表_合并版_原始.csv --batch /private/miaowu-cet4-live-batch-2026-11-10.json --out /private/cet4-qa-summary.json

工具先检查书籍 ID、章节数、版本和内容哈希，再输出来源词头、缺词、歧义、重复词义、未引用卡、正文词密度等指标。词头命中不代表已审核教学词卡。
正式站当前 23 本书仍需通过运营者身份执行实际导出；目前仅添加待预览部署与核验的代码和 CI。禁止对生产 D1、用户学习记录和订单做写操作；上线仍须通过独立 D1 备份/回滚、义项映射和多端回归。