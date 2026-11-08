# 妙屋英语 WordLetter V1.1 01–04 生产部署实录 — 2026-11-08

## 真实状态
01 妙屋新鲜事、02 手机导航与桌面教程、03 阅读器与折叠样式、04 词卡与生词本展示：正式站源码及资源均已上线。公告表为空，因此还没有可展示的公告。运营台实际登录后创建/发布/撤回完整闭环仍需有 production publisher 角色的站长手动验收；不能把匿名 401 检查当作发布者登录成功。

## 本次可核验的生产证据
- 02–04 GitHub Actions 正式部署成功：https://github.com/kim-1868/miaowu-english/actions/runs/42467030857
- 01 公告 GitHub Actions 正式部署成功：https://github.com/kim-1868/miaowu-english/actions/runs/42468644200
- 两次正式部署前都校验了现有生产 Pages 与 Worker 代码，01 更新未触碰 02–04 和用户数据。
- 01 发布时测试 466 项：465 通过、0 失败、1 跳过。正式打包 47 个资源。公告接口 GET /api/updates/latest 返回 available:true；GET /api/updates?page=1 返回 available:true 且列表可用；未授权 /api/ops/updates 返回 HTTP 401；/ops.html 的 307 站内跳转正常。
- 用户在 Cloudflare D1 Console 的 miaowu-english-prod 中手动执行了仅一张公告表和两个索引的建表 SQL，页面反馈 This query successfully executed。01 Worker 发布流程没有执行任何生产 D1 SQL/导出/恢复。
- 外部匿名浏览器复测：正式首页、Banner、更新历史 /updates.html 的空状态、运营台 /ops 的公告管理 UI 均正常；无演示公告、无空白大占位。
- 01 受控正式发布源码 SHA：824861ff463f01efd5880560ff777a036064381f；发布分支 release/v11-0104-production-isolated-20261108。后续纯文档提交不改变 Worker 源码。
- 实际网站：https://miaowu-english-pages.pages.dev/
- 正式运营台：https://miaowu-english-pages.pages.dev/ops
- 公告历史：https://miaowu-english-pages.pages.dev/updates.html

## 重要的持续发布保护
- 正式站 01 使用临时生产配置增加两项非秘密启用变量 OPS_ANNOUNCEMENTS_ENABLED=true 和 V11_NOTICE_RELEASE_APPROVED=true；部署使用 --keep-vars 保留已有 Cloudflare 生产 Secrets 与变量。
- 永远不要在下一次生产发布中不经检查地运行默认 43 资源构建，否则公告界面会被剥离。带公告的受审发布必须明确使用命令 node scripts/build-production-assets.mjs --approved-announcements，生成 47 资源，再部署对应正式 Worker。
- 生产数据库必须仍绑定 miaowu-english-prod（UUID 649c71b3-340c-49bf-b806-3d39256851d3），绝不关联测试库。
- 不得把整个 V1.1 预览开发分支的 P4 学习算法、014 义项合并等未选中更改强行覆盖生产；必须优先读取当前生产源码并核实差异。
- 本次没有核验生产 D1 的独立 SQL 文件备份；用户曾生成过 Time Travel 书签，恢复窗口约 7 天。恢复 D1 将回退全库订单/学习记录，绝不可当作普通 UI 回滚方式。遇到问题优先 Worker 版本回滚并关闭公告开关。
- 公告仅公开展示已发布记录。真实创建/发布/撤回操作需生产运营发布者身份 publisher 授权，禁止使用预览站演示运营密钥。
- Draft PR #192 是代码审计和发布候选存档，发布走了隔离的 GitHub Actions。不要因此误将 PR #154 的混合 V1.1 开发分支合并到正式站。

最终状态：PROD_0104_LIVE。真实发布者账号 CRUD 仍待站长上线后验收。
