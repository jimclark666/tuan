import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import fetch from 'node-fetch';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 安全中间件
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-production-domain.com'] 
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));

// 解析JSON请求体
app.use(express.json({ limit: '10mb' }));

// 系统提示词常量
const SYSTEM_PROMPT = `# System Role
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
}`;

// API配置
const API_CONFIGS = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo']
  },
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: process.env.GEMINI_API_KEY,
    models: ['gemini-pro', 'gemini-1.5-pro']
  },
  aliyun: {
    baseURL: 'https://dashscope.aliyuncs.com/api/v1',
    apiKey: process.env.ALIYUN_API_KEY,
    models: ['qwen-turbo', 'qwen-plus']
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY,
    models: ['deepseek-chat']
  }
};

// 调用OpenAI API
async function callOpenAI(model, messages, temperature = 0.2) {
  const config = API_CONFIGS.openai;
  if (!config.apiKey) {
    throw new Error('OpenAI API Key not configured');
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// 调用Gemini API
async function callGemini(model, messages, temperature = 0.2) {
  const config = API_CONFIGS.gemini;
  if (!config.apiKey) {
    throw new Error('Gemini API Key not configured');
  }

  const contents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const response = await fetch(
    `${config.baseURL}/models/${model}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: 4000
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

// 调用阿里云API
async function callAliyun(model, messages, temperature = 0.2) {
  const config = API_CONFIGS.aliyun;
  if (!config.apiKey) {
    throw new Error('Aliyun API Key not configured');
  }

  const response = await fetch(`${config.baseURL}/services/aigc/text-generation/generation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model,
      input: {
        messages
      },
      parameters: {
        temperature,
        max_tokens: 4000
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Aliyun API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.output.text;
}

// 调用DeepSeek API
async function callDeepSeek(model, messages, temperature = 0.2) {
  const config = API_CONFIGS.deepseek;
  if (!config.apiKey) {
    throw new Error('DeepSeek API Key not configured');
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// 调用大模型API
async function callLLM(provider, model, messages, temperature = 0.2) {
  switch (provider) {
    case 'openai':
      return await callOpenAI(model, messages, temperature);
    case 'gemini':
      return await callGemini(model, messages, temperature);
    case 'aliyun':
      return await callAliyun(model, messages, temperature);
    case 'deepseek':
      return await callDeepSeek(model, messages, temperature);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// 尝试解析JSON，如果失败则进行纠错重试
async function getJSONResponse(provider, model, normalizedResult, temperature = 0.2) {
  const userContent = JSON.stringify({ normalized_result: normalizedResult });
  
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent }
  ];

  try {
    // 第一次尝试
    let response = await callLLM(provider, model, messages, temperature);
    
    // 尝试解析JSON
    try {
      return JSON.parse(response);
    } catch (parseError) {
      console.log('第一次JSON解析失败，进行纠错重试...');
      
      // 纠错重试：追加"只输出JSON"指令
      const retryMessages = [
        ...messages,
        { role: 'assistant', content: response },
        { role: 'user', content: '请只输出JSON格式，不要包含任何其他文本或markdown格式。' }
      ];
      
      response = await callLLM(provider, model, retryMessages, temperature);
      
      try {
        return JSON.parse(response);
      } catch (retryParseError) {
        throw new Error('模型输出无法解析为JSON格式');
      }
    }
  } catch (error) {
    throw error;
  }
}

// LLM评测代理接口
app.post('/api/llm/eval', async (req, res) => {
  const startTime = Date.now();
  const TIMEOUT = 120000; // 2分钟超时

  try {
    // 检查超时
    if (Date.now() - startTime > TIMEOUT) {
      return res.status(408).json({
        error: 'Request timeout',
        detail: '请求处理超时'
      });
    }

    const { normalized_result, ab_test } = req.body;

    // 验证输入
    if (!normalized_result) {
      return res.status(400).json({
        error: 'Invalid input',
        detail: '缺少必要的 normalized_result 参数'
      });
    }

    // 检查输入验证是否通过
    if (normalized_result.input_validation && !normalized_result.input_validation.is_valid) {
      return res.json({
        scoring_version: "xm_score_v_llm_proxy_1",
        input_schema_version: "xm_eval_v1",
        ab_test: { enabled: false },
        weights: {
          base_weights: {
            "Intent Accuracy": 0.15,
            "Task Completion": 0.20,
            "Tool Use Correctness": 0.15,
            "Faithfulness": 0.15,
            "Turn Efficiency": 0.10,
            "Helpfulness": 0.15,
            "Persona & Policy": 0.10
          },
          scenario_weights: {
            "Intent Accuracy": 0.15,
            "Task Completion": 0.20,
            "Tool Use Correctness": 0.15,
            "Faithfulness": 0.15,
            "Turn Efficiency": 0.10,
            "Helpfulness": 0.15,
            "Persona & Policy": 0.10
          },
          weight_reason: "输入验证失败，使用基础权重"
        },
        model_a_result: {
          scenario: normalized_result.dialogue_summary?.scenario || "其他",
          metrics: [],
          total_score_0_100: 0,
          dashboard: {
            radar: [],
            low_metrics: [],
            critical_turn_ids: [],
            notes: normalized_result.input_validation.errors || ["输入验证失败"]
          }
        },
        handoff_to_next_step: {
          recommended_next_node: "RCA",
          rca_triggers: []
        }
      });
    }

    // 处理A/B测试
    if (ab_test && ab_test.enabled && ab_test.model_a && ab_test.model_b) {
      const modelA = ab_test.model_a;
      const modelB = ab_test.model_b;

      // 并行调用两个模型
      const [resultA, resultB] = await Promise.all([
        getJSONResponse(modelA.provider, modelA.model, normalized_result, modelA.temperature),
        getJSONResponse(modelB.provider, modelB.model, normalized_result, modelB.temperature)
      ]);

      // 计算差异
      const topDifferences = calculateDifferences(resultA, resultB);

      return res.json({
        scoring_version: "xm_score_v_llm_proxy_1",
        input_schema_version: "xm_eval_v1",
        ab_test: {
          enabled: true,
          model_a: modelA,
          model_b: modelB,
          top_differences: topDifferences
        },
        weights: resultA.weights || {
          base_weights: {
            "Intent Accuracy": 0.15,
            "Task Completion": 0.20,
            "Tool Use Correctness": 0.15,
            "Faithfulness": 0.15,
            "Turn Efficiency": 0.10,
            "Helpfulness": 0.15,
            "Persona & Policy": 0.10
          },
          scenario_weights: {
            "Intent Accuracy": 0.15,
            "Task Completion": 0.20,
            "Tool Use Correctness": 0.15,
            "Faithfulness": 0.15,
            "Turn Efficiency": 0.10,
            "Helpfulness": 0.15,
            "Persona & Policy": 0.10
          },
          weight_reason: "默认权重配置"
        },
        model_a_result: resultA,
        model_b_result: resultB,
        handoff_to_next_step: {
          recommended_next_node: "RCA",
          rca_triggers: generateRCATriggers(resultA, resultB)
        }
      });
    } else {
      // 单个模型调用
      const defaultModel = { provider: 'openai', model: 'gpt-4', temperature: 0.2 };
      const result = await getJSONResponse(
        defaultModel.provider, 
        defaultModel.model, 
        normalized_result, 
        defaultModel.temperature
      );

      return res.json({
        scoring_version: "xm_score_v_llm_proxy_1",
        input_schema_version: "xm_eval_v1",
        ab_test: { enabled: false },
        weights: result.weights || {
          base_weights: {
            "Intent Accuracy": 0.15,
            "Task Completion": 0.20,
            "Tool Use Correctness": 0.15,
            "Faithfulness": 0.15,
            "Turn Efficiency": 0.10,
            "Helpfulness": 0.15,
            "Persona & Policy": 0.10
          },
          scenario_weights: {
            "Intent Accuracy": 0.15,
            "Task Completion": 0.20,
            "Tool Use Correctness": 0.15,
            "Faithfulness": 0.15,
            "Turn Efficiency": 0.10,
            "Helpfulness": 0.15,
            "Persona & Policy": 0.10
          },
          weight_reason: "默认权重配置"
        },
        model_a_result: result,
        handoff_to_next_step: {
          recommended_next_node: "RCA",
          rca_triggers: generateRCATriggers(result)
        }
      });
    }

  } catch (error) {
    console.error('LLM eval error:', error);
    
    return res.status(500).json({
      error: 'Internal server error',
      detail: error.message
    });
  }
});

// 计算A/B测试差异
function calculateDifferences(resultA, resultB) {
  const differences = [];
  
  // 总分差异
  const scoreA = resultA.total_score_0_100 || 0;
  const scoreB = resultB.total_score_0_100 || 0;
  differences.push({
    type: "total_score",
    a: scoreA,
    b: scoreB,
    delta: scoreA - scoreB
  });

  // 维度差异
  const metricsA = resultA.metrics || [];
  const metricsB = resultB.metrics || [];
  
  const metricDifferences = [];
  metricsA.forEach((metricA, index) => {
    const metricB = metricsB[index];
    if (metricB) {
      const diff = (metricA.score_0_5 || 0) - (metricB.score_0_5 || 0);
      metricDifferences.push({
        type: "metric",
        metric: metricA.name,
        a: metricA.score_0_5 || 0,
        b: metricB.score_0_5 || 0,
        delta: diff,
        evidence_turn_ids: [...(metricA.evidence || []), ...(metricB.evidence || [])]
          .map(e => e.turn_id)
          .filter((value, index, self) => self.indexOf(value) === index)
      });
    }
  });

  // 取差异最大的3个维度
  const topMetricDiffs = metricDifferences
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  return [...differences, ...topMetricDiffs];
}

// 生成RCA触发器
function generateRCATriggers(...results) {
  const triggers = [];
  
  results.forEach(result => {
    const metrics = result.metrics || [];
    metrics.forEach(metric => {
      if (metric.score_0_5 < 3) {
        triggers.push({
          metric: metric.name,
          score_0_5: metric.score_0_5,
          turn_ids: (metric.evidence || []).map(e => e.turn_id)
        });
      }
    });
  });

  return triggers;
}

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    detail: 'An unexpected error occurred'
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    detail: 'The requested endpoint does not exist'
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`LLM Evaluation API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // 检查API密钥配置
  Object.entries(API_CONFIGS).forEach(([provider, config]) => {
    if (config.apiKey) {
      console.log(`${provider.toUpperCase()} API Key: Configured`);
    } else {
      console.log(`${provider.toUpperCase()} API Key: Not configured`);
    }
  });
});
