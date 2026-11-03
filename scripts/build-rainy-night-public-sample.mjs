// Public book information page only. Never embed member-only chapter text.
// Actual Rainy Night chapters are fetched via server-side CET4 entitlement checks.
export function buildRainyNightPublicSample(){
 return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="description" content="妙屋英语《雨夜档案》四级会员专享小说。全部12章需激活四级权益后阅读，不设免费试读。">
<meta property="og:image" content="/rainy-night-cover-v2.svg">
<title>《雨夜档案》· 四级会员专享｜妙屋英语</title>
<style>
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;background:#f8f3ec;color:#473740;font:16px/1.9 system-ui,"Songti SC",serif}
main{max-width:820px;margin:10vh auto 0;padding:30px;display:grid;grid-template-columns:180px 1fr;gap:30px;align-items:center}
img{width:100%;border-radius:14px;box-shadow:0 12px 32px #0002}
small{color:#98677a;letter-spacing:.13em}
h1{font-size:36px;margin:5px 0}
a{display:inline-block;background:#78445a;color:#fff;padding:9px 20px;text-decoration:none;border-radius:30px}
p{margin:12px 0 22px}
footer{max-width:820px;margin:0 auto;padding:10px 30px;color:#7f6c72;font-size:13px}
@media(max-width:600px){main{margin-top:4vh;grid-template-columns:1fr;text-align:center}img{max-width:180px;margin:auto}h1{font-size:30px}}
@media(prefers-color-scheme:dark){body{background:#221f24;color:#f1e8ed}small,footer{color:#c3a3b1}}
</style></head><body>
<main><img class="hero-cover" src="/rainy-night-cover-v2.svg" alt="《雨夜档案》原创封面" width="180" height="240">
<section><small>WORDLETTER · CET4 MEMBERS</small><h1>雨夜档案</h1>
<p>一封深夜来信，让林予安再次追寻姐姐留下的秘密。共12章，全部为四级会员专享内容，不提供免费试读。</p>
<a href="/">返回四级书架，登录后阅读</a></section></main>
<footer>妙屋英语 · WordLetter｜正文仅通过会员鉴权接口提供</footer></body></html>`;
}
