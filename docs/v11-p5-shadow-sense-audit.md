# 妙屋英语 V1.1｜P5 词义影子映射（网站 A 线）

状态：已完成只读工具与测试，待真实 P5 脱敏快照运行、人工审核及 staging 验收。不修改用户实际学习状态或正式 D1，不自动发布。

本工作对应《妙屋英语 WordLetter｜网站 V1.1 × 内容修订 × Agent V2 并行开发清单》中的网站 A 线和共享契约第 2、3 条；小说 R1–R3、考研词库及 Agent V2 本身不在本任务内。

## 原则

当前网站的 studyKey 基于英文词目、词性和中文主释义生成候选身份；这种文字匹配不能代替语义确认。P5 已发现重复词卡候选，不代表可以直接合并或删除旧词卡 ID。

本工具从私有导出快照（cards 或 senses 数组）只读计算候选簇、同词目不同义项、音标差异和混合词性数量。未审核的旧 ID 在影子结果中保留 legacy:ID。只有审核清单显式批准且带有审校证据、审核者、审核日期，并且匹配当前快照的 SHA-256 指纹时，才模拟产生 reviewed:... 义项映射；**这依然不会修改数据库**。

## 本地执行

~~~bash
node --test tests/v11-shadow-sense-audit.test.mjs
node scripts/v11-shadow-sense-audit.mjs --snapshot /private/p5-content-review.json
node scripts/v11-shadow-sense-audit.mjs --snapshot /private/p5-content-review.json --candidates
node scripts/v11-shadow-sense-audit.mjs --snapshot /private/p5-content-review.json --approvals /private/reviewed-senses.json --assignments
~~~

默认只输出统计汇总和快照指纹，不输出正文、用户、订单、账号记录、激活码。--candidates 输出要人工审核的候选词卡 ID，--assignments 仅在无阻断错误时输出影子对应关系。源数据及产出建议全部保存于私有目录，勿上传含原文、用户/订单等数据的文件至公开仓库。

## 审核清单格式（以下均为虚构示例，非真实审校结论）

~~~json
{
  "version": 1,
  "snapshotFingerprint": "在首次只读命令取得的64位sha256值",
  "groups": [
    {
      "status": "approved",
      "senseId": "reviewed:record_n_001",
      "wordIds": ["fictional-record-a", "fictional-record-b"],
      "reviewer": "运营审核者",
      "reviewedAt": "2026-11-06",
      "evidence": "核对两个真实语境，均为名词“记录”，目标释义与发音一致"
    }
  ]
}
~~~

不得直接使用示例清单。相同词面不同词性、缺乏审核者/证据、一个 ID 进入多个义项、不同来源快照指纹、同 ID 内容相互冲突时一律阻断；任何阻断均禁止输出部分审核通过映射。

## 不包含

- 不改变在线 studyKey、阅读/藏书票/快速刷词/听音拼写/剧情回声等功能及学习计划。
- 不自动审核已发布 23 本全部真实语义；本轮测试均用虚构词卡。
- 不进行 D1 主键迁移、用户数据写入、书籍上架、Worker/Pages 生产发布。
- 不能将静态影子映射认为已完成真实手机或跨设备验收。

## 后续网站发布顺序

1. P1–P4 手机/电脑预览验收；检查三步引导、字号与朗读、例句点击只发音、移动端按钮。
2. 运行真实脱敏数据影子报告；人工按章节实际语境确认候选义项，记录审校证据、存量学习状态影响。
3. 设计只新增映射表的增量迁移，在隔离 D1 验证，不改变旧 wordId/章节/订单。
4. 跨书及三种复习玩法回归、旧数据保留与恢复演练、运营发码/兑换/权限/版本和 Cloudflare Access 回归。
5. 固定最终版本 SHA，用户明确批准正式 V1.1 发布后才允许独立生产部署。
