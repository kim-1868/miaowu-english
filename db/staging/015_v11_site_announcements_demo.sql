-- STAGING TEST DATA ONLY. NEVER EXECUTE AGAINST A PRODUCTION DATABASE.
-- D1 target is pinned to miaowu-english-test by staging-only GitHub workflow.
-- Idempotent; never overwrites an operator-edited existing row.
INSERT OR IGNORE INTO site_announcements
(id,title,summary,body,category,status,show_on_home,revision,created_by,updated_by,created_at,updated_at,published_at)
VALUES
('d6e8f098-18fd-46e1-a1ab-45167df393e1',
 '预览示例：妙屋新鲜事上线啦',
 '我们正在试用新的更新公告栏。点击详情可查看完整说明。',
 '喵呜～这里是妙屋英语 V1.1 测试站的演示公告。\n你可以在运营台自主添加、修改、发布或下架公告；首页只展示一条，关闭后不会反复打扰你。\n这条内容仅用于测试，并不代表正式网站已经发布此功能。',
 'feature','published',1,1,'preview-seed','preview-seed',
 '2026-11-07 10:00:00','2026-11-07 10:00:00','2026-11-07 10:00:00'),
('831e827d-f941-43b0-b7e0-6ea84076db65',
 '预览示例：历史更新可以随时查看',
 '即使关闭首页公告，也可以在更新日志页面查看历史消息。',
 '这是另一条测试站演示公告。公开更新日志会按时间从新到旧显示全部已发布消息，草稿和已下架公告不会出现在这里。\n你以后可以把新书上架、功能优化和维护说明统一放在这个页面。',
 'other','published',0,1,'preview-seed','preview-seed',
 '2026-11-06 10:00:00','2026-11-06 10:00:00','2026-11-06 10:00:00');
