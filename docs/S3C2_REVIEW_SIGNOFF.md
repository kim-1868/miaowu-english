# 妙屋英语 S3-C2：人工审核确认与版本留痕（测试）

## 已知验收背景

用户已在 Cloudflare 实际验收：S3-B2 章节和词卡的直接编辑/保存/历史记录都通过；S3-C1 审核报告正常显示「必须修复0、建议完善3、人工审核3」，示例图书是测试数据（书名含示例、promise 搭配不足、总目标词数太少）。

## 本阶段新增

- `db/006_editorial_review_signoffs.sql`：**只新增**人工审核记录表和索引；不会删除或覆盖既有用户、章节、词汇、分类权益、S3-B2 编辑历史。每次确认都向 `editorial_review_signoffs` 追加一条记录。
- 私有 API（仅 staging、reviewer 测试站访问授权 + 独立 `S3_EDITOR_SECRET`）：
  - `GET /api/staging/editor/drafts/:id/review-signoffs`：返回最近最多15次审核确认、当前版本是否仍有效。
  - `POST /api/staging/editor/drafts/:id/review-signoffs`：必须提交与最新审核报告一致的 `expectedFingerprint`、全部三项明确勾选、12～800字审核备注。
- 后台审核报告下面增加「人工审核确认与留痕」表单。
- 确认记录绑在当前草稿、全部章节内容、相关词库字段、标注锚点、分类关系与编辑历史的不可逆摘要上。保存章节/词汇修改，包括之后撤销恢复到原来的文字，旧确认都失效。用户需重新完成技术检查及人工审核。
- 有技术阻断问题时拒绝人工审核确认；密钥无效/未登录无法访问；测试环境以外不存在此 API。
- **本阶段始终不发布任何章节**，不触碰 `books.status`、`chapters.published_at`、`entitlements`。确认人只记录为 `staging-editor-key-holder`，不能作为具有实名责任人的正式合规审核证据。

## Cloudflare 增量迁移：只需要一次

目标：`miaowu-english-test`（绝不能是正式 D1）。
Cloudflare → D1 → `miaowu-english-test` → Console → 先确认 Time Travel/备份可用 → 执行 `db/006_editorial_review_signoffs.sql`。

Cloudflare Console 可能不识别含注释、多条语句的粘贴内容，建议去掉 `--` 注释并**逐条**执行这两条：

```sql
CREATE TABLE IF NOT EXISTS editorial_review_signoffs (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  content_fingerprint TEXT NOT NULL,
  checks_json TEXT NOT NULL,
  note TEXT NOT NULL,
  reviewer_identity TEXT NOT NULL DEFAULT 'staging-editor-key-holder',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

```sql
CREATE INDEX IF NOT EXISTS ix_editorial_review_signoffs_book
ON editorial_review_signoffs(book_id,created_at DESC);
```

检查：

```sql
SELECT name FROM sqlite_master WHERE type='table' AND name='editorial_review_signoffs';
```

不要重跑 001–005；不需要创建/轮换新的 Secret。

## 真实站点验收步骤

1. Worker `miaowu-english-staging` → Deployments，确认最新 S3-C2 提交为 Ready。
2. 打开 `https://miaowu-english-staging.kim10086a.workers.dev/editor.html`，使用原先的独立 `S3_EDITOR_SECRET` 验证权限。
3. 草稿书库打开 `【示例草稿】未寄出的信`，在「⑥ 发布前内容审核」运行检查。
4. 检查自动审核结果仍为 0 阻断、测试草稿的提醒合理，并在「人工审核确认与留痕」看到检查表、备注与保存按钮。
5. **不要把未审核的事打勾**。示例草稿的审核确认仅用于练习流程，可以不保存记录。若完成了真实的对应复核，可填写真实审核范围、确认并保存；系统会显示留痕。
6. 如需检验旧审核失效，可以只在示例草稿修改一句中文（这是用户之前已经成功做过的操作）；重新审核后，旧记录应显示「版本已变化」。
7. 不能在普通读者书架看到这份尚未发布的测试书，普通用户账号不能打开审核记录。

## 限制

- 自动技术检查不能保证文本的原创性、版权、英文质量和词表覆盖。人工复核必不可少。
- 尚未实现正式生产管理员账号、双人审批、署名审计、发布/撤回按钮或支付，测试确认并**不等于正式发布批准**。
- 只有 GitHub CI 成功、Cloudflare 远程 D1 新表就绪及真实站点验收后，才能认为本阶段功能可使用。
