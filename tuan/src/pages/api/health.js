export default function handler(req, res) {
  // 只允许 GET 请求
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      detail: 'Only GET method is supported'
    });
  }

  // 返回健康检查响应
  res.status(200).json({ 
    ok: true, 
    service: "llm-eval-proxy",
    timestamp: new Date().toISOString()
  });
}
