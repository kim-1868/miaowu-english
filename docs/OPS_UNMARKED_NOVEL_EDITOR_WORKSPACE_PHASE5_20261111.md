# V1.2 第五阶段：运营台未标记英文的可操作审核界面（2026-11-11）

## 用户目标和本轮交付
在原 `/ops` 出版台下方新增仅限 **staging + 已认证 publisher** 的可折叠工作区，支持：

1. 运营人员手动选择不包含 `words[]` 的 V2 小说 JSON 文件（小于 1.9MB）。不覆写旧上传流程。
2. 使用之前 PR #219 的只读 `POST /api/ops/import/dictionary-v2/plan-unmarked` 重新查询已审核词库，逐词展示英文在原句中的位置、词头及已批准的名/动等义项；无已批准词卡显示缺口和原因。
3. 逐个选择语境中真正的词义并显式点击确认。**批量确认按钮仅处理当前页（20 条）只有一种已批准义项的词，而且会再次询问操作员已逐句核对**；多义词必须单独选义。浏览器不会自动把唯一候选当成“认识”或 Publisher 签核。
4. 根据服务端颁发的原文 SHA256、审核方案 SHA256 和人工选择回调 `POST .../confirm-unmarked`。服务器再次核验精确 UTF-16 offset / 真正的已审核active sense / 同一本书原文，然后只返回 `marked_v2_package`、`verified_v1_package` **待审核草稿**，没有 D1 写入或上架。
5. 运营人员可以独立下载 V2 带学习目标版本和 V1 兼容预检包。要发布仍须经过现有、独立且已授权的 draft/versioned revision / preflight / Publisher 工作流，不会直接调用 `/api/ops/import` 上架动作。

## 安全兼容
- OPS Key 仍只在原 `ops-console.js` 内存中的 `key` 保存，模块仅接收原 `api` 方法；无 localStorage、sessionStorage 或额外凭证字段。401/登出/pagehide/重连正式站会清空旧审核文件与选择。
- 面板初始 HTML `hidden`，模块只在身份被验证为 staging Publisher 后延迟加载；生产站不可看到，且后台的 `/plan-unmarked` `/confirm-unmarked` 已只接受 staging 出版者。
- 原页面脚本 URL 标记保持不变，原上传、发码、用户订单、标签、下架、阅读器功能均保留；新增 CSS 独立于旧 OPS 样式，不调整正式用户 UI。
- 小说正文片段使用 `textContent` 进行 DOM 插入防注入；最多渲染 20 条/页；所有请求失败都 fail-closed，旧哈希不得继续生成文件；对同一个 `record` 可以按两句上下文分别选 n.记录、v.录制，词头仍共用一张主卡。
- 所有工作区数据仅存在当前浏览器内存，不上传到 GitHub；公共仓仅有通用代码/合成测试。**7391原词、655待审句、2,206旧word ID 均不改变**。

## 质量测试及边界
- 纯 JS 词头选择与签核数据结构自动测试；包含词头身份伪造、修改原文offset、重复标记、未审sense、错书SHA、绕过确认等；独立 OPS 集成静态 QA。
- 本地 Chromium 1280px 桌面与 390px 手机模拟“上传、扫描、2义选取、确认、下载、正式站隐藏和清除状态”均通过；无 JS exception。
- 此次使用的已审 record 测试数据均为**合成**，项目真实教学 Publisher approved senses 仍为0；**未真实部署 Cloudflare staging / 019 D1迁移 / 未改正式数据库，不能声称网站现已支持真实用户使用。**

## 下阶段
1. 做真正的预览站 Cloudflare D1 加密备份/迁移和 OPS Publisher 实际审核入口测试；先读后写，审批经人签核的少量教学词卡。
2. 串通 V2 草稿的 staging 导入、章节锚点与 018 稳定义项绑定、真实已上架最新版保守映射；验证两本书共享 user+entry 状态。
3. 保留历史 2,206 old IDs，分步给快速刷词、剧情回声、收藏接入同一词头学习计划。正式站仍处 Draft #206，禁止未审内容上架。