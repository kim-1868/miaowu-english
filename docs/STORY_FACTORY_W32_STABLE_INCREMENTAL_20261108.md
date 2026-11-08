# 妙屋英语 · 小说工厂 W3.2 稳定增量升级（2026-11-08）

## 目标
**继续沿用原 W3 V2/W3.1 的工作台、九本旧稿与已写章节，不重新生成小说、不全量安装、不触碰 V1.1 网站。** 此轮只解决流程错配、重复覆盖风险、CSS 严格 CSP、词卡身份安全和多版本升级成本。

## 交付与来源
- 私人 Library `/妙屋英语/小说工厂V1/WordLetter_小说工厂_W3.2_一次稳定升级_20261108.zip`。
- ZIP SHA256 `04972260a645251a01ade6aea7821e4de7965d89bf8738fe317bfcb8baedf9b0`，10 files，完整性校验通过，约35.6KB。**不包含用户真实小说、词卡和本机任务文件。**
- `install_w32.py` 自动识别 **V2 → W3.2** 或 **W3.1 → W3.2**，读取旧源文件 SHA，未知/部分修改的版本安全停止；备份代码并分阶段原子替换，失败回滚，重复执行幂等。只修改6个根目录代码文件：`private_bridge.py`、`w3_provider_scheduler.py`、`workbench.html`、`workbench.js`、`workbench.css`、`w31_revision_agent.py`。
- 不访问或修改 `engine/`、`legacy_assets/`、`new_batches/`、`reports/`、`revision_backups/` 及任何 Cloudflare D1/正式站/预览站数据。

## 本次修复
1. 原 W3.1 CSS 外链已修，但进度条的 `element.style.width` 仍会被严格 `style-src 'self'` CSP 拦截。换成 HTML `<progress>` 原生组件及独立 CSS。
2. 预演 API 文案 `executionEnabledFromBrowser:false` 与同页面真实生成按钮矛盾。改成 `true`（**仅表示有显式确认按钮**）；并明确当前预演没有实际模型调用，避免误操作。
3. 新书卡片对已存密度失败章给出可操作的审核提示；密度已通过时禁用无意义的再次 AI 候选修订按钮，降低重复计费概率。
4. 章节候选不仅保证原 ID 集合、章节身份和段落数不变，还必须保持各 `wordId → (surface,gloss)` 原样映射，阻断将旧词卡 ID 错配新英文词形或中文义项。确需改变词形/义项，必须走额外教学审阅流程，不能在密度优化中暗改。
5. Codex 章节生成改用 `--sandbox read-only`，CLI 不应直接编辑已有书稿，生成输出由 `factory.save_chapter` 独立写入；用户 Mac Codex CLI 真实版本兼容性**仍需试跑**，不能以本地模拟证明。
6. 保留既有 P1/P2 门禁、来源 SHA 核验、同一时间单模型任务、人工修订确认、原稿备份、失败不自动重试、教学终审/发布门禁。

## 已实际测试
- 自包含原 W3 V2 与 W3.1 隔离根目录：升级前识别、两次连续执行幂等、未知自定义版本拒绝覆盖、原六本 3/48 章节 JSON SHA 不变，全部通过。
- 原项目 Python unittest **38项执行、35项通过、3项按资源条件跳过、0失败**。
- 第2章上传原稿与已修订候选测试：70标注，原 ID 保持，surface/gloss 篡改被拒绝，0模型调用。
- 本机 HTTP `/api/status` 返回 **9本/72章/27章**（这是包内测试基线；用户 Mac 已保存第2章修订后按**26/56四级正文文件**独立统计），`/`、`/workbench.css`、`/workbench.js` 均 200，模型预演返回第2章队列而不调用模型。
- Node `--check` JS 语法通过，Python 编译通过。浏览器真实视觉点击仍需用户 Mac 验证，不能称线上完成。
- 公共合成回归：[PR #33](https://github.com/kim-1868/miaowu-english-public/pull/33) 已成功通过公共 Actions 并合并；提交 `db5b17fe1f23c43d41ce0d08c1380fd27646f63f`，私人 GitHub Actions 本轮0次。
- 用户实际已经完成《凌晨三点的失物招领》第2章70标注定向修订安装、3.68密度/P1P2=0；此补丁**不会覆盖**该章，也不把教学审核视为已通过。
- 本轮未创建任何新的真实小说章节。

## 用户设备下一步（仅当用户选择升级）
用户在本机无模型任务时停止 `start_story_factory.py` 服务，解压本小补丁，将 `WordLetter_小说工厂_W3.2_稳定升级_20261108` 放入旧主目录，运行：
`python3 WordLetter_小说工厂_W3.2_稳定升级_20261108/install_w32.py --apply`
看到 `W32_LOCAL_PATCH_INSTALLED` 后 `python3 start_story_factory.py`。如果 `W32_SAFE_STOP`，**不重装**、不覆盖，记录原文并针对修改过的源码提供差分方案。

## 后续唯一主线
1. 用户 Mac 上核验 W3.2 样式/章节审核真实 UI，确保第2章内容标记为密度合格、教学待审，不再生成第2章。
2. 真实授权 Codex 单章续写第3章，按同一质量门禁验证并保留失败候选；观察只读沙箱 CLI 的兼容性。新增章节审核后纳入本轮四级统计。
3. 继续工作台完成剩余四级章节、旧三本词卡/IPA教学终审，最后与冻结的 V1.1 预览功能统一验收、**增量**正式发布。
