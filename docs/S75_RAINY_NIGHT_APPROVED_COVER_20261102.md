# S75｜《雨夜档案》正式封面接入（2026-11-02）

**封面已由项目所有者在上一轮确认“可以的，放进去”。** 本轮使用该生成作品的经网页压缩的**同一画面**，而不是重新生成另一张图；原始高清文件请在对话中获取。

- `public/rainy-night-cover.webp`：原创封面，260×347 WebP，7,618 字节，来源为已确认的“雨夜旧书店／神秘来信／女主角”的高清图。Git Blob SHA-1 `71c76a514dfa6c43e801a6cea9aac4ae6f40da2a`，可用程序逐字节核验。静态站点封面图经压缩以节省移动网络流量；如未来需要全尺寸封面/电商导出，应使用高清原图。
- **CET4书架**：`public/app.js` 原《雨夜档案》免费试读卡从雨伞占位符改为真人物封面，并加入可访问的 `alt` 文本；`public/styles.css` 保持 3:4 书封原比例，桌面和移动屏适配。
- **免费试读阅读页**：`scripts/build-rainy-night-public-sample.mjs` 添加封面 hero（书名、简介、开始阅读）、主站风格简化导航（可返回书架和跳转正文/说明），保留原有正文内容和全部 64 处学习单词标注。纯静态试读不会假装已具备用户词卡/复习等功能。
- **商业及安全边界不变**：正式 Worker 构建白名单只多一个经过校验的封面 WebP；不改生产D1、账号、权益或付费逻辑；**12章完整版尚未商业上架**。
- `tests/s75-rainy-night-approved-cover.test.mjs` 校验图片有效的 WebP 魔数、长度、Git Blob SHA、生产资源构建、书架和阅读页一致的图片引用及免费内容隔离。

## 上线状态

提交/测试/合并到 release 之后仍需要 Cloudflare 更新正式 Worker 的资产版本，代码更新不等于线上立即生效。线上首章和书架主站可供匿名核验的入口：

- <https://miaowu-english-pages.pages.dev/>
- <https://miaowu-english-pages.pages.dev/rainy-night.html>

部署完成后应检查 `/rainy-night-cover.webp` 实际返回非空图片、书架卡片封面被浏览器渲染、免费阅读页封面和正文可见。谨防已经缓存的旧站资源。
