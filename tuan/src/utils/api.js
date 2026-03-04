import { trimNormalizedResult, calculateInputSize } from './inputTrimmer';
import { safeParseJson } from './safeJsonParser';

// 前端API调用工具 - 使用NoCode平台火山方舟模型调用能力

/**
 * 统一的火山方舟API调用函数（带超时控制）
 * @param {Object} config - 配置参数
 * @param {string} config.baseUrl - 基础URL
 * @param {string} config.endpointId - 接入点ID
 * @param {string} config.apiKey - API密钥
 * @param {number} config.temperature - 温度参数
 * @param {Array} config.messages - 消息列表
 * @param {number} config.timeoutMs - 超时时间（毫秒）
 * @returns {Promise<Object>} 包含结果和调试信息的对象
 */
async function callVolcArkChatWithTimeout({ 
  baseUrl, 
  endpointId, 
  apiKey, 
  temperature, 
  messages, 
  timeoutMs = 60000 
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();
  
  try {
    // 构建请求体
    const requestBody = {
      model: endpointId,
      messages,
      temperature,
      max_tokens: 4000
    };
    
    // 计算输入大小
    const inputSizeChars = JSON.stringify(requestBody).length;
    
    try {
      // 发送请求
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const durationMs = Date.now() - startTime;
      
      // 处理响应
      if (!response.ok) {
        let responseText = '';
        try {
          responseText = await response.text();
        } catch (textError) {
          responseText = '无法读取响应内容';
        }
        
        const errorCode = response.status === 408 ? 'SERVER_408' : `HTTP_${response.status}`;
        
        return {
          ok: false,
          status: response.status,
          statusText: response.statusText,
          responseText: responseText.substring(0, 300),
          errorCode,
          durationMs,
          timeoutMs,
          inputSizeChars,
          message: response.status === 408 ? '服务端408' : `HTTP ${response.status}`
        };
      }
      
      // 解析JSON响应
      const data = await response.json();
      
      // 返回成功结果
      return {
        ok: true,
        text: data.choices[0].message.content,
        durationMs,
        timeoutMs,
        inputSizeChars
      };
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      const durationMs = Date.now() - startTime;
      
      // 处理超时错误
      if (error.name === 'AbortError') {
        return {
          ok: false,
          status: 408,
          statusText: 'Request Timeout',
          responseText: '本地超时(Abort)',
          errorCode: 'CLIENT_TIMEOUT',
          durationMs,
          timeoutMs,
          inputSizeChars: JSON.stringify({ model: endpointId, messages, temperature }).length,
          message: '本地超时(Abort)'
        };
      }
      
      // 处理网络错误
      return {
        ok: false,
        status: 0,
        statusText: 'Network Error',
        responseText: error.message,
        errorCode: 'NETWORK_ERROR',
        durationMs,
        timeoutMs,
        inputSizeChars: JSON.stringify({ model: endpointId, messages, temperature }).length,
        message: error.message
      };
    }
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    const durationMs = Date.now() - startTime;
    
    // 处理其他错误
    return {
      ok: false,
      status: 0,
      statusText: 'Unknown Error',
      responseText: error.message,
      errorCode: 'UNKNOWN_ERROR',
      durationMs,
      timeoutMs,
      inputSizeChars: 0,
      message: error.message
    };
  }
}

/**
 * 调用火山方舟对话API (前端直连) - 增强版，支持超时分级和重试
 * @param {Object} config - 配置参数
 * @param {string} config.baseUrl - 基础URL
 * @param {string} config.endpointId - 接入点ID
 * @param {string} config.apiKey - API密钥
 * @param {number} config.temperature - 温度参数
 * @param {Array} config.messages - 消息列表
 * @param {string} config.taskType - 任务类型：'score', 'rca', 'strategy'
 * @param {number} config.maxRetries - 最大重试次数
 * @param {number} config.timeoutMs - 自定义超时时间（毫秒）
 * @returns {Promise<string>} 模型输出的文本
 */
export const callVolcArkChatEnhanced = async ({ 
  baseUrl, 
  endpointId, 
  apiKey, 
  temperature, 
  messages, 
  taskType = 'score',
  maxRetries = 2,
  timeoutMs = null
}) => {
  // 超时策略分级
  const timeoutMap = {
    'score': 60000,    // 评分/归因 60秒
    'rca': 60000,      // 评分/归因 60秒
    'strategy': 30000  // 策略生成 30秒
  };
  
  // 使用自定义超时或默认超时
  const finalTimeoutMs = timeoutMs || timeoutMap[taskType] || 60000;
  
  // 指数退避等待时间
  const backoffDelays = [800, 1600];
  
  let lastError = null;
  const attemptRecords = [];
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await callVolcArkChatWithTimeout({
      baseUrl,
      endpointId,
      apiKey,
      temperature,
      messages,
      timeoutMs: finalTimeoutMs
    });
    
    // 记录尝试信息
    const attemptRecord = {
      attempt: attempt + 1,
      errorCode: result.errorCode,
      durationMs: result.durationMs,
      timeoutMs: result.timeoutMs,
      inputSizeChars: result.inputSizeChars,
      message: result.message
    };
    attemptRecords.push(attemptRecord);
    
    if (result.ok) {
      // 返回模型输出文本
      return {
        content: result.text,
        attempt: attempt + 1,
        durationMs: result.durationMs,
        timeoutMs: result.timeoutMs,
        inputSizeChars: result.inputSizeChars,
        attemptRecords
      };
    }
    
    // 如果是可重试的错误，且还有重试机会，则继续重试
    if (["CLIENT_TIMEOUT", "SERVER_408", "NETWORK_ERROR"].includes(result.errorCode) && attempt < maxRetries) {
      lastError = result;
      await new Promise(resolve => setTimeout(resolve, backoffDelays[attempt]));
      continue;
    }
    
    // 不可重试的错误或重试次数用完，抛出错误
    throw {
      code: result.errorCode,
      status: result.status,
      statusText: result.statusText,
      responseText: result.responseText,
      url: `${baseUrl}/chat/completions`,
      provider: 'volc_ark',
      endpointId,
      attempt: attempt + 1,
      durationMs: result.durationMs,
      timeoutMs: result.timeoutMs,
      inputSizeChars: result.inputSizeChars,
      message: result.message,
      attemptRecords
    };
  }
  
  // 理论上不会执行到这里
  throw lastError;
};

/**
 * 调用火山方舟对话API (前端直连)
 * @param {Object} config - 配置参数
 * @param {string} config.baseUrl - 基础URL
 * @param {string} config.endpointId - 接入点ID
 * @param {string} config.apiKey - API密钥
 * @param {number} config.temperature - 温度参数
 * @param {Array} config.messages - 消息列表
 * @returns {Promise<string>} 模型输出的文本
 */
export const callVolcArkChat = async ({ baseUrl, endpointId, apiKey, temperature, messages }) => {
  const result = await callVolcArkChatWithTimeout({
    baseUrl,
    endpointId,
    apiKey,
    temperature,
    messages,
    timeoutMs: 15000 // 15秒超时
  });
  
  if (!result.ok) {
    throw {
      code: result.errorCode,
      status: result.status,
      statusText: result.statusText,
      responseText: result.responseText,
      url: `${baseUrl}/chat/completions`,
      provider: 'volc_ark',
      endpointId,
      durationMs: result.durationMs,
      timeoutMs: result.timeoutMs,
      inputSizeChars: result.inputSizeChars,
      message: result.message
    };
  }
  
  return result.text;
};

/**
 * 调用LLM评测API (使用NoCode平台火山方舟模型) - 增强版
 * @param {Object} normalizedResult - 标准化后的对话日志结果
 * @param {Object} abTest - A/B测试配置（可选）
 * @param {Object} modelConfig - 模型配置（火山方舟）
 * @param {Object} stabilityConfig - 稳定性配置
 * @param {number} timeoutMs - 自定义超时时间（毫秒）
 * @returns {Promise<Object>} 评测结果
 */
export const evaluateWithLLMEnhanced = async (normalizedResult, abTest = null, modelConfig = null, stabilityConfig = null, timeoutMs = null) => {
  try {
    // 输入瘦身必须真的生效
    let trimmedResult = normalizedResult;
    const maxTurns = 12;
    
    // 无论是否启用稳定性模式，都进行输入瘦身
    trimmedResult = trimNormalizedResult(normalizedResult, maxTurns);
    
    // 稳定性模式降载
    if (stabilityConfig && stabilityConfig.enabled) {
      // 自动降低温度
      if (stabilityConfig.temperature > 0.1) {
        modelConfig = {
          ...modelConfig,
          temperature: 0.1
        };
      }
    }
    
    // 计算输入大小
    const inputSizeChars = calculateInputSize(trimmedResult);
    
    // 构建评测提示词 - 加强约束
    const systemPrompt = `# System Role
你是美团生活服务场景的小美智能体评测专家（Evaluation Engineer）。你的输出将被程序直接 JSON.parse 解析，用于看板展示与后续 RCA。

# Input
你会收到一个 JSON 对象，字段包括：
- normalized_result：Step1 标准化结果（schema_version=xm_eval_v1），包含 dialogue_summary、turns、input_validation 等
- model_context：当前评测模型的信息（provider/model/temperature）
- ab_test：可选，包含 model_a 与 model_b 的配置。若提供则需要输出 A/B 两份评分。

# Task (Step2 only)
只做"评分与证据抽取"，不要做 RCA 根因诊断与修复建议。
1) 生成 7 个维度的 0-5 分评分 + rubric + deductions + evidence(turn_id+quote<=30字) + confidence
2) 场景自适应权重（加总=1），计算 total_score_0_100
3) 若 ab_test.enabled=true：输出 model_a_result 与 model_b_result，并给出 top_differences（总分差异、差异最大的3个维度、关联的证据轮次）

# Metrics (must)
- Intent Accuracy
- Task Completion
- Tool Use Correctness
- Faithfulness
- Turn Efficiency
- Helpfulness
- Persona & Policy

# Rules
- 严格 JSON 输出：禁止 markdown、禁止解释性文本
- 若 input_validation.is_valid=false：total_score_0_100=0，并在 notes 写 errors
- 信息不足不允许臆测：降低 confidence，并写明"信息不足"
- Faithfulness：若 assistant 声称"已下单/已退款/已核销"等，但 turns 中无 tool_call 成功证据 → 明确扣分并引用证据轮次
- Tool Use：若 tool_call failed 或 status=unknown → 扣分并引用该轮
- Efficiency：明显重复确认/无进展轮次多 → 扣分并引用最典型两轮

# Output JSON schema (strict)
{
  "scoring_version": "xm_score_v_llm_proxy_1",
  "input_schema_version": "xm_eval_v1",
  "ab_test": {
    "enabled": true/false,
    "model_a": {"provider":"", "model":"", "temperature":0.2},
    "model_b": {"provider":"", "model":"", "temperature":0.2},
    "top_differences": [
      {"type":"total_score","a":0,"b":0,"delta":0},
      {"type":"metric","metric":"Tool Use Correctness","a":0,"b":0,"delta":0,"evidence_turn_ids":[1,2]}
    ]
  },
  "weights": {
    "base_weights": {"Intent Accuracy":0.15,"Task Completion":0.20,"Tool Use Correctness":0.15,"Faithfulness":0.15,"Turn Efficiency":0.10,"Helpfulness":0.15,"Persona & Policy":0.10},
    "scenario_weights": {"Intent Accuracy":0.15,"Task Completion":0.20,"Tool Use Correctness":0.15,"Faithfulness":0.15,"Turn Efficiency":0.10,"Helpfulness":0.15,"Persona & Policy":0.10},
    "weight_reason": ""
  },
  "model_a_result": {
    "scenario": "",
    "metrics": [
      {"name":"","score_0_5":0,"confidence_0_1":0.0,"rubric":{"5":"","4":"","3":"","2":"","1":"","0":""},"evidence":[{"turn_id":1,"quote":""}],"deductions":[""]}
    ],
    "total_score_0_100": 0,
    "dashboard": {
      "radar":[{"metric":"","value_0_5":0}],
      "low_metrics":[{"metric":"","score_0_5":0}],
      "critical_turn_ids":[1],
      "notes":[""]
    }
  },
  "model_b_result": {
    "scenario": "",
    "metrics": [],
    "total_score_0_100": 0,
    "dashboard": {"radar":[],"low_metrics":[],"critical_turn_ids":[],"notes":[]}
  },
  "handoff_to_next_step": {
    "recommended_next_node": "RCA",
    "rca_triggers": [{"metric":"","score_0_5":0,"turn_ids":[1]}]
  }
}

# 重要约束
- 只输出合法JSON，不要输出任何解释文字
- 不要使用 Markdown 代码块，不要 \`\`\`json\`\`\`
- 输出必须以 { 开头，以 } 结尾`;

    const userContent = JSON.stringify({ 
      normalized_result: trimmedResult,
      ...(abTest && { ab_test: abTest })
    });

    // 调用火山方舟模型
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];

    let response;
    try {
      const result = await callVolcArkChatEnhanced({
        baseUrl: modelConfig.baseUrl,
        endpointId: modelConfig.endpointId,
        apiKey: modelConfig.apiKey,
        temperature: modelConfig.temperature,
        messages,
        taskType: 'score',
        maxRetries: 2,
        timeoutMs: timeoutMs // 使用自定义超时
      });
      
      response = result.content;
      
      // 创建包含调试信息的响应对象
      const responseWithDebugInfo = {
        content: result.content,
        debugInfo: {
          attempt: result.attempt,
          durationMs: result.durationMs,
          timeoutMs: result.timeoutMs,
          inputSizeChars: result.inputSizeChars,
          attemptRecords: result.attemptRecords
        }
      };
      
      return responseWithDebugInfo;
    } catch (error) {
      // 提供更详细的错误信息
      const detailedError = new Error(`模型调用失败: ${error.code || 'Unknown'} - ${error.message || error.statusText}`);
      detailedError.debugInfo = {
        provider: error.provider || 'volc_ark',
        endpointId: error.endpointId || modelConfig.endpointId,
        baseUrl: error.url || modelConfig.baseUrl,
        status: error.status,
        responseText: error.responseText,
        attempt: error.attempt,
        durationMs: error.durationMs,
        timeoutMs: error.timeoutMs,
        inputSizeChars: error.inputSizeChars,
        attemptRecords: error.attemptRecords,
        timestamp: new Date().toISOString()
      };
      throw detailedError;
    }

  } catch (error) {
    console.error('LLM evaluation error:', error);
    
    // 创建包含详细调试信息的错误对象
    const evaluationError = new Error(error.message || '评测调用失败');
    evaluationError.debugInfo = {
      error: error.message,
      debugInfo: error.debugInfo,
      timestamp: new Date().toISOString()
    };
    
    throw evaluationError;
  }
};

/**
 * 调用LLM评测API (使用NoCode平台火山方舟模型)
 * @param {Object} normalizedResult - 标准化后的对话日志结果
 * @param {Object} abTest - A/B测试配置（可选）
 * @param {Object} modelConfig - 模型配置（火山方舟）
 * @returns {Promise<Object>} 评测结果
 */
export const evaluateWithLLM = async (normalizedResult, abTest = null, modelConfig = null) => {
  try {
    // 构建评测提示词 - 加强约束
    const systemPrompt = `# System Role
你是美团生活服务场景的小美智能体评测专家（Evaluation Engineer）。你的输出将被程序直接 JSON.parse 解析，用于看板展示与后续 RCA。

# Input
你会收到一个 JSON 对象，字段包括：
- normalized_result：Step1 标准化结果（schema_version=xm_eval_v1），包含 dialogue_summary、turns、input_validation 等
- model_context：当前评测模型的信息（provider/model/temperature）
- ab_test：可选，包含 model_a 与 model_b 的配置。若提供则需要输出 A/B 两份评分。

# Task (Step2 only)
只做"评分与证据抽取"，不要做 RCA 根因诊断与修复建议。
1) 生成 7 个维度的 0-5 分评分 + rubric + deductions + evidence(turn_id+quote<=30字) + confidence
2) 场景自适应权重（加总=1），计算 total_score_0_100
3) 若 ab_test.enabled=true：输出 model_a_result 与 model_b_result，并给出 top_differences（总分差异、差异最大的3个维度、关联的证据轮次）

# Metrics (must)
- Intent Accuracy
- Task Completion
- Tool Use Correctness
- Faithfulness
- Turn Efficiency
- Helpfulness
- Persona & Policy

# Rules
- 严格 JSON 输出：禁止 markdown、禁止解释性文本
- 若 input_validation.is_valid=false：total_score_0_100=0，并在 notes 写 errors
- 信息不足不允许臆测：降低 confidence，并写明"信息不足"
- Faithfulness：若 assistant 声称"已下单/已退款/已核销"等，但 turns 中无 tool_call 成功证据 → 明确扣分并引用证据轮次
- Tool Use：若 tool_call failed 或 status=unknown → 扣分并引用该轮
- Efficiency：明显重复确认/无进展轮次多 → 扣分并引用最典型两轮

# Output JSON schema (strict)
{
  "scoring_version": "xm_score_v_llm_proxy_1",
  "input_schema_version": "xm_eval_v1",
  "ab_test": {
    "enabled": true/false,
    "model_a": {"provider":"", "model":"", "temperature":0.2},
    "model_b": {"provider":"", "model":"", "temperature":0.2},
    "top_differences": [
      {"type":"total_score","a":0,"b":0,"delta":0},
      {"type":"metric","metric":"Tool Use Correctness","a":0,"b":0,"delta":0,"evidence_turn_ids":[1,2]}
    ]
  },
  "weights": {
    "base_weights": {"Intent Accuracy":0.15,"Task Completion":0.20,"Tool Use Correctness":0.15,"Faithfulness":0.15,"Turn Efficiency":0.10,"Helpfulness":0.15,"Persona & Policy":0.10},
    "scenario_weights": {"Intent Accuracy":0.15,"Task Completion":0.20,"Tool Use Correctness":0.15,"Faithfulness":0.15,"Turn Efficiency":0.10,"Helpfulness":0.15,"Persona & Policy":0.10},
    "weight_reason": ""
  },
  "model_a_result": {
    "scenario": "",
    "metrics": [
      {"name":"","score_0_5":0,"confidence_0_1":0.0,"rubric":{"5":"","4":"","3":"","2":"","1":"","0":""},"evidence":[{"turn_id":1,"quote":""}],"deductions":[""]}
    ],
    "total_score_0_100": 0,
    "dashboard": {
      "radar":[{"metric":"","value_0_5":0}],
      "low_metrics":[{"metric":"","score_0_5":0}],
      "critical_turn_ids":[1],
      "notes":[""]
    }
  },
  "model_b_result": {
    "scenario": "",
    "metrics": [],
    "total_score_0_100": 0,
    "dashboard": {"radar":[],"low_metrics":[],"critical_turn_ids":[],"notes":[]}
  },
  "handoff_to_next_step": {
    "recommended_next_node": "RCA",
    "rca_triggers": [{"metric":"","score_0_5":0,"turn_ids":[1]}]
  }
}

# 重要约束
- 只输出合法JSON，不要输出任何解释文字
- 不要使用 Markdown 代码块，不要 \`\`\`json\`\`\`
- 输出必须以 { 开头，以 } 结尾`;

    const userContent = JSON.stringify({ 
      normalized_result: normalizedResult,
      ...(abTest && { ab_test: abTest })
    });

    // 调用火山方舟模型
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];

    let response;
    try {
      response = await callVolcArkChat({
        baseUrl: modelConfig.baseUrl,
        endpointId: modelConfig.endpointId,
        apiKey: modelConfig.apiKey,
        temperature: modelConfig.temperature,
        messages
      });
    } catch (error) {
      // 提供更详细的错误信息
      const detailedError = new Error(`模型调用失败: ${error.status || 'Network Error'} - ${error.responseText || error.statusText}`);
      detailedError.debugInfo = {
        provider: error.provider || 'volc_ark',
        endpointId: error.endpointId || modelConfig.endpointId,
        baseUrl: error.url || modelConfig.baseUrl,
        status: error.status,
        responseText: error.responseText,
        timestamp: new Date().toISOString()
      };
      throw detailedError;
    }

    // 返回原始响应，让formatEvaluationResult处理解析
    return response;

  } catch (error) {
    console.error('LLM evaluation error:', error);
    
    // 创建包含详细调试信息的错误对象
    const evaluationError = new Error(error.message || '评测调用失败');
    evaluationError.debugInfo = {
      error: error.message,
      debugInfo: error.debugInfo,
      timestamp: new Date().toISOString()
    };
    
    throw evaluationError;
  }
};

/**
 * 健康检查 - 使用Smoke Test方式，直接测试模型调用
 * @param {Object} modelConfig - 模型配置
 * @returns {Promise<Object>} 健康状态
 */
export const checkHealth = async (modelConfig = null) => {
  try {
    // 如果没有提供配置，使用默认配置进行测试
    const defaultConfig = {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      endpointId: 'ep-xxxx', // 这里应该使用实际的endpointId
      apiKey: 'test-key',
      temperature: 0.1
    };

    const config = modelConfig || defaultConfig;

    // 使用简单的健康检查提示词测试模型调用
    const messages = [
      { role: 'user', content: '请只输出严格JSON：{"ok":true}' }
    ];

    const result = await callVolcArkChatWithTimeout({
      baseUrl: config.baseUrl,
      endpointId: config.endpointId,
      apiKey: config.apiKey,
      temperature: 0.1,
      messages,
      timeoutMs: 15000 // 15秒超时
    });

    if (!result.ok) {
      throw {
        code: result.errorCode,
        status: result.status,
        statusText: result.statusText,
        responseText: result.responseText,
        url: `${config.baseUrl}/chat/completions`,
        provider: 'volc_ark',
        endpointId: config.endpointId,
        durationMs: result.durationMs,
        timeoutMs: result.timeoutMs,
        inputSizeChars: result.inputSizeChars,
        message: result.message
      };
    }

    if (!result.text) {
      throw new Error('健康检查失败：未收到响应');
    }

    // 尝试解析响应
    try {
      const parsed = JSON.parse(result.text);
      if (parsed.ok === true) {
        return {
          ok: true,
          service: "llm-eval-proxy",
          timestamp: new Date().toISOString(),
          provider: 'volc_ark',
          endpointId: config.endpointId
        };
      } else {
        throw new Error('健康检查失败：响应格式不正确');
      }
    } catch (parseError) {
      // 如果解析失败，检查是否包含ok字段
      if (result.text.includes('"ok"') && result.text.includes('true')) {
        return {
          ok: true,
          service: "llm-eval-proxy",
          raw_response: result.text.substring(0, 100),
          timestamp: new Date().toISOString(),
          provider: 'volc_ark',
          endpointId: config.endpointId
        };
      } else {
        throw new Error(`健康检查失败：响应不是有效JSON - ${result.text.substring(0, 200)}`);
      }
    }

  } catch (error) {
    console.error('Health check error:', error);
    
    // 创建包含详细调试信息的错误对象
    const healthError = new Error(error.message || '健康检查失败');
    healthError.debugInfo = {
      error: error.message,
      provider: error.provider || 'volc_ark',
      endpointId: error.endpointId,
      baseUrl: error.url,
      status: error.status,
      responseText: error.responseText,
      timestamp: new Date().toISOString()
    };
    
    throw healthError;
  }
};

/**
 * A/B测试配置示例
 */
export const AB_TEST_CONFIGS = {
  openai_gpt4_vs_gpt35: {
    enabled: true,
    model_a: {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.2
    },
    model_b: {
      provider: 'openai', 
      model: 'gpt-3.5-turbo',
      temperature: 0.2
    }
  },
  openai_vs_gemini: {
    enabled: true,
    model_a: {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.2
    },
    model_b: {
      provider: 'gemini',
      model: 'gemini-pro',
      temperature: 0.2
    }
  },
  single_openai: {
    enabled: false
  }
};

/**
 * 创建评测请求的默认配置
 */
export const createEvaluationRequest = (normalizedResult, abTestConfig = null) => {
  return {
    normalized_result: normalizedResult,
    ...(abTestConfig && { ab_test: abTestConfig })
  };
};

/**
 * 验证评测结果格式
 */
export const validateEvaluationResult = (result) => {
  const requiredFields = [
    'scoring_version',
    'input_schema_version', 
    'ab_test',
    'weights',
    'model_a_result',
    'handoff_to_next_step'
  ];

  const missingFields = requiredFields.filter(field => !(field in result));
  
  if (missingFields.length > 0) {
    throw new Error(`评测结果缺少必需字段: ${missingFields.join(', ')}`);
  }

  return true;
};

/**
 * 格式化评测结果用于展示
 */
export const formatEvaluationResult = (result) => {
  const formatted = {
    ...result,
    formatted_at: new Date().toISOString(),
    total_score: result.model_a_result?.total_score_0_100 || 0,
    scenario: result.model_a_result?.scenario || '未知场景',
    metrics_count: result.model_a_result?.metrics?.length || 0,
    has_ab_test: result.ab_test?.enabled || false
  };

  if (result.ab_test?.enabled) {
    formatted.model_b_score = result.model_b_result?.total_score_0_100 || 0;
    formatted.score_difference = formatted.total_score - formatted.model_b_score;
  }

  return formatted;
};

/**
 * 验证模型配置
 * @param {Object} config - 模型配置
 * @returns {Object} 验证结果
 */
export const validateModelConfig = (config) => {
  const errors = [];

  if (!config.baseUrl || config.baseUrl.trim() === '') {
    errors.push('Base URL不能为空');
  }

  if (!config.provider) {
    errors.push('Provider不能为空');
  } else if (config.provider === 'volc_ark') {
    if (!config.endpointId || config.endpointId.trim() === '') {
      errors.push('火山方舟Endpoint ID不能为空');
    }
  }

  if (!config.apiKey || config.apiKey.trim() === '') {
    errors.push('API Key不能为空');
  }

  if (config.temperature < 0 || config.temperature > 1) {
    errors.push('Temperature必须在0-1之间');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * 获取用户友好的错误建议
 * @param {Object} error - 错误对象
 * @returns {string} 建议文本
 */
export const getErrorAdvice = (error) => {
  const status = error.status;
  
  switch (status) {
    case 401:
      return 'API Key无效或已过期，请检查Key权限或重新生成';
    case 403:
      return '权限不足，请检查Endpoint ID是否有访问权限';
    case 429:
      return '请求频率超限或额度不足，请稍后重试或联系管理员';
    case 404:
      return 'Endpoint ID不存在，请检查配置是否正确';
    case 500:
    case 502:
    case 503:
    case 504:
      return '服务暂时不可用，请稍后重试';
    case 408:
      return '请求超时，请重试';
    default:
      if (error.responseText && error.responseText.includes('quota')) {
        return 'API额度不足，请联系管理员充值';
      }
      if (error.responseText && error.responseText.includes('rate')) {
        return '请求频率超限，请降低调用频率';
      }
      return '请检查网络连接和API配置';
  }
};
