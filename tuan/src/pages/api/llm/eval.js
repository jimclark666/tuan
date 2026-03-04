export default function handler(req, res) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      detail: 'Only POST method is supported'
    });
  }

  // 解析请求体
  let requestBody;
  try {
    requestBody = req.body || {};
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid request body',
      detail: 'Request body must be valid JSON'
    });
  }

  // 返回模拟评测响应
  res.status(200).json({
    scoring_version: "xm_score_mock_1",
    status: "ok",
    message: "mock ok",
    received_at: new Date().toISOString(),
    input_size: requestBody ? JSON.stringify(requestBody).length : 0
  });
}
