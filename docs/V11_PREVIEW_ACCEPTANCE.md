# V1.1 · 真实功能预览验收环境

## 关键区别

- **正式站**：Cloudflare Pages 服务绑定到 \`miaowu-english-production\`，生产 D1 \`miaowu-english-prod\`；不得拿正式 Pages 的“Preview URL”当安全的预览站。
- **预览站**：独立 \`miaowu-english-staging\` Worker，\`APP_ENV=staging\`，D1 \`miaowu-english-test\`；有 \`STAGING_PREVIEW_PASSWORD\` 的 reviewer 密码门禁。
- **当前交付**：提供预览环境的安全审计、部署门禁和验收路线；只有确认连接的真实 Worker、测试数据库、访问密码和 URL 均就绪后，才公布可实际打开的预览链接。

## 一、只读预检

运行：
\`\`\`sh
node scripts/check-v11-preview-config.mjs
npm run check
npm test
npm install --no-save --ignore-scripts wrangler@^4
npx wrangler deploy --dry-run --config wrangler.jsonc --outdir .wrangler/dryrun-preview
\`\`\`

GitHub Actions \`V1.1 preview isolation preflight\` 在独立分支上执行：
1. 以上本地检查。
2. 确认凭证存在，但不打印其值。
3. 用只读 \`wrangler secret list --config wrangler.jsonc\` 验证**目标测试 Worker**上 \`STAGING_PREVIEW_PASSWORD\` 和 \`ACTIVATION_PEPPER\` 已存在。
4. 任何失败均停止部署，不修改生产 Worker、Pages、D1 或密钥。

## 二、预览部署

只有预检完全通过，才使用独立的预览部署工作流。部署脚本必须：
- 明确写 \`--config wrangler.jsonc --keep-vars\`，**禁止使用 \`deploy/production.wrangler.jsonc\`**；
- 校验 \`APP_ENV=staging\`，测试 D1 及访问口令已经生效；
- 不自动运行任何 D1 迁移、激活码导入或生产发布；
- 使用固定提交 SHA，保留上个可用版本便于回退。

Cloudflare 首次连接可能启用 GitHub Builds；必须核查 \`miaowu-english-staging\` 的 GitHub Production branch 与部署冲突/来源。如果其原自动构建会覆盖 V1.1 预览，先消除冲突。

## 三、交给用户的验收材料

预览提交 SHA + 可访问 URL + reviewer 测试访问方式（密码不发送在聊天）+ 测试账户/测试码获取方式 + 变更清单 + 移动端/电脑端验收脚本。

在候选版本中用户可以：注册/登录测试账号、测试码兑换、小说阅读、点词/生词本、快速刷词、听音拼写、剧情回声、书房收藏及后台展示。所有操作只能更改测试 D1。

## 四、人工验收门禁

- 自动测试全部通过不代表用户验收通过。
- 用户指出问题 → 只更新预览站 → 重新验收。
- 用户明确回复“V1.1 验收通过，可以正式上线”，且完成正式站备份、回滚及基线核查，才允许单独执行正式发布。
- 若预览已稳定，后续迭代只更新该预览站，正式网站继续运行既有版本。
