# miaowu-english · 妙屋英语 WordLetter（私人核心仓库）

此仓库保持 **Private**，用于保存内容资产、敏感业务实现、真实环境配置及生产发布。

## 2026-11-07 决策：公共开发 + 私人核心双仓库

- 公共开发仓库：[miaowu-english-public](https://github.com/kim-1868/miaowu-english-public)：未来优先承接**可公开的前端、通用组件、脱敏测试、标准 GitHub Actions CI**。
- 当前私人仓库：继续负责**小说与词汇内容、用户/订单/激活数据边界、业务授权、生产 D1/Workers、敏感发布流程及整体集成验收**。
- **禁止直接将本仓库设为 Public 或复制 Git 历史到新公共仓库。** 迁移仅通过经过检查的白名单文件，保持线上站点和预览环境不变。
- 详细范围、验收及迁移步骤见 [docs/DUAL_REPOSITORY_PUBLIC_CI_POLICY_20261107.md](docs/DUAL_REPOSITORY_PUBLIC_CI_POLICY_20261107.md)。

**当前状态**：18 个公共前端文件已安全迁移，公共 UI 演示、文件白名单与 GitHub Actions 离线测试已投入使用；私人 V1.1 分支已优化过时检查取消逻辑。生产站仍使用私人仓库代码快照，跨仓库自动整合及剩余私人 CI 优化尚待推进，因此不能声称 2,000 分钟限制已完全消失。

公共仓库迁移明细：[PUBLIC_MIGRATION_MANIFEST.md](https://github.com/kim-1868/miaowu-english-public/blob/main/docs/PUBLIC_MIGRATION_MANIFEST.md)。
