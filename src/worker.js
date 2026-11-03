// 妙屋英语 V1.0：安全的服务端开发入口
// 尚未接入真实账号系统，任何真实用户注册、激活和付费内容请求必须拒绝。
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({
        ok: true,
        app: 'miaowu-english',
        stage: 'foundation-s0',
        authReady: false,
        paymentsReady: false
      });
    }
    if (url.pathname.startsWith('/api/')) {
      return json({
        error: 'NOT_IMPLEMENTED',
        message: '账号、激活码、内容授权接口仍在开发；此页面不能用于真实交易。'
      }, 501);
    }
    return env.ASSETS.fetch(request);
  }
};
