# 妙屋英语 · 三本旧小说 409 修复｜私人仓库本机受控发布

日期：2026-11-09。状态：**候选代码，尚未部署正式站**。

## 为什么提供这条路径

私有 GitHub Actions 由于 GitHub Billing/Spending Limit 在分配 Runner 之前失败；此前生产 D1 的只读查询也单独失败。不能把已下架小说当作新书导入，也不能仅为了上线就绕过 D1 备份和词卡学习身份检查。

本脚本不需要私有 Actions；它在仓库拥有者本机执行全量测试、构建、线上版本比对、运营台匿名 401、边缘健康探针、生产 D1 结构**只读 SELECT** 和 Worker 当前部署检查。所有前置条件通过且获得第二次明确确认后，才可以部署。

## Mac 运行方法（不要将任何密钥发给聊天）

在本机已经登录 GitHub 的终端中：

```bash
git clone --branch release/novel-revision-on-current-prod-20261109 https://github.com/kim-1868/miaowu-english.git miaowu-novel-fix
cd miaowu-novel-fix
npm install --no-save --ignore-scripts 'wrangler@^4'
npx wrangler login
node scripts/deploy-novel-revision-local.mjs
```

检查完成且显示 `PREFLIGHT_OK_NO_PRODUCTION_CHANGE`，并且对输出的生产 Worker 版本核对无误后，再输入：

```bash
MW_NOVEL_PROD_APPROVED=DEPLOY_GUARDED_NOVEL_EDITOR node scripts/deploy-novel-revision-local.mjs --deploy
```

如检查失败，**不要继续发布**，请提供终端中最后的 `FAIL_CLOSED` 或 `D1` 报错文本（先遮蔽任何私人数据），用于定位权限、schema 或版本漂移问题。严禁通过修改数据库、忽略错误或删掉源版本比对来跳过检查。部署后检查 Ops 和原书更新入口是否显示，并以真实旧书内容和教学审核结果决定是否实际重新上架。

## 此脚本不会做的操作

- 不自动修改 D1 任何表或删除旧书；
- 不上传任何真实小说 JSON，也不批准小说公开售卖；
- 不把任何私有 Token、D1 数据、运营密钥、原文或版权内容写入公共 GitHub；
- 不自动提交/推送、不改用户登录/订单/激活码；
- 不将公共 UI 合成测试结果冒充私人上线验收。

## 发布后人工验收

在正式运营台选择已有未发布小说，上传同 ID、同书名、原章节 ID 保持不变的修订稿。系统提示历史书籍时进行两步确认，保留旧词卡和用户学习记录并创建版本快照。然后上传封面、检查审核报告、确认重新上架。

仅当旧文档中历史词卡等身份与三份新 JSON 完全兼容时可执行；否则应修正候选包或确认审稿，不能绕过 409 重建 ID。

**注意**：部署 Worker 本身不会修复已有不兼容的三本 JSON，也不会解除任何真实旧卡字段不可变规则。
