# 妙屋英语 V1.1 第二批交付与 D1 权限阻塞记录（2026-11-08）

## 已完成
- 第一批正式站：公告“预览当前公告”改为运营台内预览，不再跳首页；桌面端点击词汇就近弹出、公告历史容错、320–430px 样式、作废权益查询修正。Actions 成功：https://github.com/kim-1868/miaowu-english/actions/runs/42482044024，471 tests passed, 0 failed, 1 skipped。
- 用户新增阅读需求：尚未按「朗读」时，鼠标移动/点击普通段落、移动进度条和前后段按钮不得启动朗读。独立正式热修完成 https://github.com/kim-1868/miaowu-english/actions/runs/42482983528：474 passed, 0 failed, 1 skipped；正式页面资源 URL 加入 voice-guard 缓存标识，保留单词词卡及主动发音按钮。
- 第二批隔离开发分支 `release/v11-wave2-bookshelf-onboarding-20261108`：个人书架、已读状态、注册确认密码、账号级新用户引导、补充词典可选后端。专门增量表 009、010、012、013。源于当前生产 Worker，**未引入** P4 学习算法或 D1 014 义项映射。
- 第二批预览代码/静态包/语法与功能回归 Action 成功：https://github.com/kim-1868/miaowu-english/actions/runs/42483102570。481 tests, 480 passed, 0 failed, 1 skipped；隔离测试 Worker 已部署，匿名 401 保护有效。正式发布资源 50 个（原 47 + onboarding.js + onboarding.css + v11-bookshelf.css），公告功能仍完整打包。
- 第二批也已同步「朗读主动触发」的修复代码与回归测试，避免二次回归。

## 尚未完成的重要条件
- 远程预览 D1 用户新表尚未创建。https://github.com/kim-1868/miaowu-english/actions/runs/42483396211 在**备份/导出 test D1**阶段失败：Cloudflare API error 10000 (authentication); **还没执行任何 SQL**。当前 GitHub CLOUDFLARE_API_TOKEN 足以部署 Worker，但不能导出 D1。不能把预览代码部署成功误认为真实书架与引导功能已经可用。
- 用户可以**自行在 Cloudflare Dashboard 的 D1 miaowu-english-test 建立恢复书签/备份后**，执行单一文件 `db/WAVE2_TEST_ONLY_SETUP_20261108.sql`，其中仅新表及幂等词典词条，不更新 users、reading_progress、entitlements、orders。必须确认库名与 UUID，绝不在 production 执行。
- 另一种方式是在 Cloudflare 创建/授权有 D1 Edit 权限的 GitHub CI token（只将 token 值保存到 GitHub Actions Secret，不要发在聊天）；先验证预览 D1 导出成功再执行幂等脚本，避免未经备份的写入。
- 在预览 D1 权限、真实用户测试、生产 D1 独立备份和迁移确认之前，**第二批不得发布正式站**。目前正式站只包含第 1 批+语音误触热修，没有第二批的个人书架与首次引导。生产 D1 未修改。
- 第二批补充词典后端已独立接入，但前端例句点击仍按此前确认“只点读、不二次弹窗”，尚未引入额外的弹窗查询交互。
- 新用户引导：无旧行的老账号不自动弹出；只有新注册时表已存在才有用户引导行。个人书架表将从阅读进度计算 reading / finished，收藏不提供付费章节授权。

## 后续严格顺序
1. test D1 备份与添加新表，校验 API 读写、新旧账号、章节进度与收藏，兼容性和隐私。
2. 预览站真实验收；保持已有公告发布闭环、朗读主动启动、手机端词卡/登录与复习旧逻辑不变。
3. 生产 D1 独立备份/回滚准备，逐表增量迁移并验证（不执行 014 或 P4）。
4. 第二批受控生产构建 50 资源，源代码/资源版本前置检查，低风险部署，回归与回滚手册。
