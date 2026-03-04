import { trimNormalizedResult, calculateInputSize } from './inputTrimmer';
import { callVolcArkChatEnhanced } from './api';
import { formatEvaluationResult } from './formatters';
import { safeParseJson } from './safeJsonParser';

/**
 * A/B测试执行器 - 专门处理AB模式的串行执行
 * @param {Object} normalizedResult - 标准化结果
 * @param {Object} abTestConfig - A/B测试配置
 * @param {Object} modelAConfig - Model A配置
 * @param {Object} modelBConfig - Model B配置
 * @param {Object} stabilityConfig - 稳定性配置
 * @returns {Promise<Object>} A/B测试结果
 */
export async function executeABTest({
  normalizedResult,
  abTestConfig,
  modelAConfig,
  modelBConfig,
  stabilityConfig = null
}) {
  const runRecords = [];
  const abTestTimeoutMs = 90000; // AB测试每侧90秒超时
  
  // 输入瘦身必须启用
  const trimmedResult = trimNormalizedResult(normalizedResult, 12);
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
- 不要使用 Markdown 代码块，不要使用三个反引号加json的格式
- 输出必须以 { 开头，以 } 结尾`;

  // 执行A侧评测
  const runAResult = await runModelEvaluation({
    side: 'A',
    modelConfig: modelAConfig,
    normalizedResult: trimmedResult,
    systemPrompt,
    timeoutMs: abTestTimeoutMs,
    inputSizeChars
  });
  
  runRecords.push(runAResult.record);
  
  // 如果A侧失败，直接返回
  if (!runAResult.success) {
    return {
      success: false,
      runRecords,
      error: runAResult.error,
      errorDebugInfo: runAResult.errorDebugInfo
    };
  }
  
  // 执行B侧评测
  const runBResult = await runModelEvaluation({
    side: 'B',
    modelConfig: modelBConfig,
    normalizedResult: trimmedResult,
    systemPrompt,
    timeoutMs: abTestTimeoutMs,
    inputSizeChars
  });
  
  runRecords.push(runBResult.record);
  
  // 如果B侧失败，返回部分结果
  if (!runBResult.success) {
    return {
      success: false,
      runRecords,
      error: runBResult.error,
      errorDebugInfo: runBResult.errorDebugInfo
    };
  }
  
  // 计算A/B测试差异
  const abDifferences = calculateABDifferences(runAResult.result, runBResult.result);
  
  // 构建最终结果
  const finalResult = {
    scoring_version: "xm_score_v_llm_proxy_1",
    input_schema_version: "xm_eval_v1",
    ab_test: {
      enabled: true,
      model_a: {
        provider: modelAConfig.provider,
        model: modelAConfig.endpointId,
        temperature: modelAConfig.temperature
      },
      model_b: {
        provider: modelBConfig.provider,
        model: modelBConfig.endpointId,
        temperature: modelBConfig.temperature
      },
      top_differences: abDifferences
    },
    weights: runAResult.result.weights || {
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
    model_a_result: runAResult.result,
    model_b_result: runBResult.result,
    handoff_to_next_step: {
      recommended_next_node: "RCA",
      rca_triggers: generateRCATriggers(runAResult.result, runBResult.result)
    }
  };
  
  return {
    success: true,
    result: finalResult,
    runRecords
  };
}

/**
 * 执行单侧模型评测
 * @param {Object} params - 参数
 * @returns {Promise<Object>} 评测结果
 */
async function runModelEvaluation({
  side,
  modelConfig,
  normalizedResult,
  systemPrompt,
  timeoutMs,
  inputSizeChars
}) {
  const startTime = Date.now();
  const attemptRecords = [];
  const maxRetries = 2;
  const backoffDelays = [800, 1600];
  
  // 构建用户输入
  const userContent = JSON.stringify({ 
    normalized_result: normalizedResult,
    model_context: {
      provider: modelConfig.provider,
      model: modelConfig.endpointId,
      temperature: modelConfig.temperature
    }
  });
  
  // 构建消息
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];
  
  let lastError = null;
  let abTestResult = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await callVolcArkChatEnhanced({
        baseUrl: modelConfig.baseUrl,
        endpointId: modelConfig.endpointId,
        apiKey: modelConfig.apiKey,
        temperature: modelConfig.temperature,
        messages,
        taskType: 'score',
        maxRetries: 0,
        timeoutMs
      });
      
      // 记录尝试信息
      attemptRecords.push({
        attempt: attempt + 1,
        errorCode: 'SUCCESS',
        durationMs: result.durationMs,
        timeoutMs: result.timeoutMs,
        inputSizeChars: result.inputSizeChars,
        message: '成功'
      });
      
      // 使用安全解析器解析JSON
      try {
        const parsedResult = safeParseJson(result.content);
        
        // 创建运行记录
        const record = {
          runSide: side,
          ok: true,
          parsed: true,
          rawText: result.content.substring(0, 1500),
          parsedObject: parsedResult,
          formattedResult: formatEvaluationResult(parsedResult),
          debugInfo: {
            attempt: attempt + 1,
            durationMs: result.durationMs,
            timeoutMs: result.timeoutMs,
            inputSizeChars: result.inputSizeChars,
            attemptRecords
          },
          error: null
        };
        
        return {
          success: true,
          result: parsedResult,
          record
        };
      } catch (parseError) {
        // JSON解析失败
        const parseErrorMessage = `模型输出无法解析为JSON格式: ${parseError.message}`;
        
        // 记录尝试信息
        attemptRecords.push({
          attempt: attempt + 1,
          errorCode: 'PARSE_ERROR',
          durationMs: result.durationMs,
          timeoutMs: result.timeoutMs,
          inputSizeChars: result.inputSizeChars,
          message: parseErrorMessage
        });
        
        // 创建运行记录
        const record = {
          runSide: side,
          ok: false,
          parsed: false,
          rawText: result.content.substring(0, 1500),
          parsedObject: null,
          formattedResult: null,
          debugInfo: {
            attempt: attempt + 1,
            durationMs: result.durationMs,
            timeoutMs: result.timeoutMs,
            inputSizeChars: result.inputSizeChars,
            attemptRecords
          },
          error: {
            message: parseErrorMessage,
            code: 'PARSE_ERROR',
            status: 'n/a',
            responseText: result.content.substring(0, 300),
            durationMs: result.durationMs,
            timeoutMs: result.timeoutMs,
            inputSizeChars: result.inputSizeChars,
            attemptRecords
          }
        };
        
        return {
          success: false,
          error: parseErrorMessage,
          errorDebugInfo: {
            code: 'PARSE_ERROR',
            message: parseErrorMessage,
            durationMs: result.durationMs,
            timeoutMs: result.timeoutMs,
            inputSizeChars: result.inputSizeChars,
            attemptRecords
          },
          record
        };
      }
    } catch (error) {
      // 记录尝试信息
      attemptRecords.push({
        attempt: attempt + 1,
        errorCode: error.code || 'UNKNOWN_ERROR',
        durationMs: error.durationMs || (Date.now() - startTime),
        timeoutMs: error.timeoutMs || timeoutMs,
        inputSizeChars: error.inputSizeChars || inputSizeChars,
        message: error.message || '未知错误'
      });
      
      // 如果是可重试的错误，且还有重试机会，则继续重试
      if (["CLIENT_TIMEOUT", "SERVER_408", "NETWORK_ERROR"].includes(error.code) && attempt < maxRetries) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, backoffDelays[attempt]));
        continue;
      }
      
      // 不可重试的错误或重试次数用完，创建运行记录
      const record = {
        runSide: side,
        ok: false,
        parsed: false,
        rawText: '',
        parsedObject: null,
        formattedResult: null,
        debugInfo: {
          attempt: attempt + 1,
          durationMs: error.durationMs || (Date.now() - startTime),
          timeoutMs: error.timeoutMs || timeoutMs,
          inputSizeChars: error.inputSizeChars || inputSizeChars,
          attemptRecords
        },
        error: {
          message: error.message || '模型调用失败',
          code: error.code || 'UNKNOWN_ERROR',
          status: error.status || 'n/a',
          responseText: error.responseText || '',
          durationMs: error.durationMs || (Date.now() - startTime),
          timeoutMs: error.timeoutMs || timeoutMs,
          inputSizeChars: error.inputSizeChars || inputSizeChars,
          attemptRecords
        }
      };
      
      return {
        success: false,
        error: error.message || '模型调用失败',
        errorDebugInfo: {
          code: error.code || 'UNKNOWN_ERROR',
          message: error.message || '模型调用失败',
          status: error.status || 'n/a',
          responseText: error.responseText || '',
          durationMs: error.durationMs || (Date.now() - startTime),
          timeoutMs: error.timeoutMs || timeoutMs,
          inputSizeChars: error.inputSizeChars || inputSizeChars,
          attemptRecords
        },
        record
      };
    }
  }
  
  // 理论上不会执行到这里
  return {
    success: false,
    error: lastError?.message || '未知错误',
    errorDebugInfo: {
      code: lastError?.code || 'UNKNOWN_ERROR',
      message: lastError?.message || '未知错误',
      durationMs: lastError?.durationMs || (Date.now() - startTime),
      timeoutMs: lastError?.timeoutMs || timeoutMs,
      inputSizeChars: lastError?.inputSizeChars || inputSizeChars,
      attemptRecords
    },
    record: {
      runSide: side,
      ok: false,
      parsed: false,
      rawText: '',
      parsedObject: null,
      formattedResult: null,
      debugInfo: {
        attempt: maxRetries + 1,
        durationMs: lastError?.durationMs || (Date.now() - startTime),
        timeoutMs: lastError?.timeoutMs || timeoutMs,
        inputSizeChars: lastError?.inputSizeChars || inputSizeChars,
        attemptRecords
      },
      error: {
        message: lastError?.message || '未知错误',
        code: lastError?.code || 'UNKNOWN_ERROR',
        status: lastError?.status || 'n/a',
        responseText: lastError?.responseText || '',
        durationMs: lastError?.durationMs || (Date.now() - startTime),
        timeoutMs: lastError?.timeoutMs || timeoutMs,
        inputSizeChars: lastError?.inputSizeChars || inputSizeChars,
        attemptRecords
      }
    }
  };
}

/**
 * 计算A/B测试差异
 * @param {Object} resultA - A侧结果
 * @param {Object} resultB - B侧结果
 * @returns {Array} 差异数组
 */
function calculateABDifferences(resultA, resultB) {
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

/**
 * 生成RCA触发器
 * @param {Object} resultA - A侧结果
 * @param {Object} resultB - B侧结果
 * @returns {Array} RCA触发器数组
 */
function generateRCATriggers(resultA, resultB) {
  const triggers = [];
  
  // 从A侧结果中提取低分维度
  const metricsA = resultA.metrics || [];
  metricsA.forEach(metric => {
    if (metric.score_0_5 < 3) {
      triggers.push({
        metric: metric.name,
        score_0_5: metric.score_0_5,
        turn_ids: (metric.evidence || []).map(e => e.turn_id)
      });
    }
  });
  
  // 从B侧结果中提取低分维度
  const metricsB = resultB.metrics || [];
  metricsB.forEach(metric => {
    if (metric.score_0_5 < 3) {
      triggers.push({
        metric: metric.name,
        score_0_5: metric.score_0_5,
        turn_ids: (metric.evidence || []).map(e => e.turn_id)
      });
    }
  });
  
  return triggers;
}
