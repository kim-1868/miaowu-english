# 妙屋英语 V1.9｜单次确认上架与多颜色封面标签

日期：2026-11-04。此文档描述开发分支实现；只有生产工作流部署、D1 表迁移后才在线上生效。

## 目标流程

管理员验证运营密钥后，在“⑥ 上传并发布新小说”选择完整 JSON 或含词卡的 MD/TXT；点击“识别文件并检查内容”，确认书名、章节、英文词标注与例句的预览；选择 JPG/PNG/WEBP 封面；点击一次“确认上传并上架”。

界面依次：受控导入草稿 → 经过校验压缩上传封面 → 向服务器获取当前版本指纹与发布可用性 → publisher 单次授权发布。只有最后一步将整本书标记为 published。任何一步失败都保留草稿、原小说及付费门禁，后续在书籍目录选择草稿后可点击“确认当前草稿并上架”，不必重新导入。

取消勾选三项、填写审核笔记、重复输入书名；服务器仍要求 OPS_PUBLICATION_ENABLED=true、publisher 身份、有效同源请求、非测试内容、章节与词卡检查通过、英美音标和双语例句完整、封面已配置，以及当前版本指纹匹配。发布事务写入追加式审计，已购权益和学习记录不变。单次确认属于有意识的发布动作，而非上传即后台自动发布。

## 封面标签

已上架/未上架书籍都可在“封面管理”编辑标签。下拉含默认推荐标签，以及由后台已保存书籍自动生成的常用标签；手动输入 1–24 字符，颜色使用 HEX 色盘。每本书可有多个不同标签，不设固定的产品数量上限。支持修改颜色、改名、删除。标签按书独立存储在 `book_cover_tags` 中，`/api/books?category=...` 只查询已发布书的标签文字与颜色，不包含草稿正文或个人信息。

书架卡片封面右上角使用半透明背景展示标签，左下角继续展示“已解锁/会员专享”。标签为 CSS 和文本，不会写入/重绘原始图片。过多标签受封面尺寸限制，应避免遮挡主要封面视觉。

## 数据库部署前置步骤

先检查正确的 `miaowu-english-prod` D1 绑定并备份，再只执行 `db/production/005_book_cover_tags.sql`。迁移仅新增 `book_cover_tags` 表与索引，可重试；无任何 `UPDATE/DELETE` 客户数据操作。迁移完成后才部署新 Worker。旧版无新表时读者书架仍可正常返回书籍，只是不显示标签；标签编辑端会提示 TAGS_SCHEMA_REQUIRED。

## API

- `GET /api/ops/books/:bookId/tags` — 该书标签+可复用历史标签，仅 publisher 可见
- `POST /api/ops/books/:bookId/tags` — {label,color,previousLabel?,requestId}，新增、改名、改色
- `DELETE /api/ops/books/:bookId/tags` — {label,requestId}，移除该书标签
- `GET /api/ops/books/:bookId/readiness` — 增加 coverReady/quickPublishAvailable
- `POST /api/ops/books/:bookId/publish-reviewed` — {expectedFingerprint,bookId,confirmed:true,requestId}，明确操作人确认后原子发布
- `GET /api/books?category=cet4` — published metadata 的 `cover_tags` 列表

## 不变的约束

- 不开放未购买用户读取付费小说章节；
- 不把已发布小说变回草稿；
- 不在浏览器持久化运营密钥；
- 不对后端未通过自动审核的稿件强行上架；
- 不把机器字段齐全视为作品版权或者语言已经完成真实校验。
