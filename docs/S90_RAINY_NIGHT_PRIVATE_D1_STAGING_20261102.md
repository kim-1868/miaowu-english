# S90 — 《雨夜档案》12章生产 D1 私有导入（不等于发布）

## 使用范围

本次依照“《雨夜档案》上线”的指示先完成现有会员系统所必需的**非公开数据落库**。严格不改变书目的 published 状态，不向用户发送激活码，不写 entitlement，不上传第二章以后的任何静态文件，不跳过编辑审批。

- 生产网站：`https://miaowu-english-pages.pages.dev/`
- 生产 D1：`miaowu-english-prod`（由生产 Wrangler 配置绑定）
- 私有书目 ID：`rainy-night-archives-cet4-v1`
- 章节：12（第1章可预览标记，第2–12章标记非免费），目标词条188项，词汇锚点733处
- 生成入口：`scripts/build-rainy-night-member-draft-import.mjs --write-private`
- 生产暂存入口：`.github/workflows/stage-rainy-night-private-draft.yml`
- 全部内容仍来自已审核固定代码 SHA `90bc127b9fec334cbf0e7d56cdeaae3d26e26c71`；主分支不会读取未确认的新草稿。

## 防误公开措施

1. GitHub Actions 先运行语法/集成测试、检查私有SQL仅包含 draft INSERT，不包含 UPDATE books、DELETE、DROP、ALTER 或 entitlement 写入；
2. 使用 Github 原有 Cloudflare API Token 和 account ID，查询生产数据库**非用户数据**状态：CET4 必须存在；当前书目只能不存在或为 draft；章节只能为0或12；
3. 导入阶段仅执行 `wrangler d1 execute --remote --file`，生成内容全程在 workflow 运行器的 private-output 下，绝不上传为 public asset/artifact；
4. 导入后确认书目为 draft、12章、仅一章免费标记、没有任何已发布时间、733个词汇关联；
5. 如果已有发布中的书目或中途意外产生章节，自动中止，不强制覆盖、不重置数据。

### 为什么不能直接对外宣布上线

当前正式发布路径 `src/ops-publication.js` 对英美 IPA、词性、双语例句和人工审校采用阻断式检查；此外，`check-rainy-night-publishing-gate.mjs` 尚有188项词条语义、733处英文语境、36道剧情回声待复核。上述数字标志着未完成的*审校工作*，不是脚本出错。没有编辑人员完成真实核验并在运营后台审批，不能将 draft 切换为 published。

下一步是实际完成教学资料与版权/语境复核，然后使用有审计记录的审批→发布操作；最后执行真实已购/未购账户的 D1 章节权限、进度、词卡和复习功能 E2E 验收。

## 运行记录

本工作流在合并到主分支时执行一次，也支持 GitHub Actions 手动执行：输入 `STAGE_RAINY_NIGHT_DRAFT`。如果失败，先看 `Preflight production D1` 或 `Import only hidden draft rows`；**不要重新生成密钥，也不要尝试直接修改 production books.status**。

`published` 之前，运营侧可以处理草稿但消费者不会看见第2至12章。
