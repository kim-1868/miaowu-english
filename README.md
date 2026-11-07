# miaowu-english · 妙屋英语 WordLetter（私人核心仓库）

此仓库保持 **Private**，用于保存内容资产、敏感业务实现、真实环境配置及生产发布。

## 2026-11-07 决策：公共开发 + 私人核心双仓库

- 公共开发仓库：[miaowu-english-public](https://github.com/kim-1868/miaowu-english-public)：未来优先承接**可公开的前端、通用组件、脱敏测试、标准 GitHub Actions CI**。
- 当前私人仓库：继续负责**小说与词汇内容、用户/订单/激活数据边界、业务授权、生产 D1/Workers、敏感发布流程及整体集成验收**。
- **禁止直接将本仓库设为 Public 或复制 Git 历史到新公共仓库。** 迁移仅通过经过检查的白名单文件，保持线上站点和预览环境不变。
- 详细范围、验收及迁移步骤见 [docs/DUAL_REPOSITORY_PUBLIC_CI_POLICY_20261107.md](docs/DUAL_REPOSITORY_PUBLIC_CI_POLICY_20261107.md)。

当前阶段仅落实仓库治理规范；公共测试和代码安全迁移尚未完成，不能视为已解决全部私有 Actions 额度问题。
