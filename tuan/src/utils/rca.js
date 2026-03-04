/**
 * RCA 归因诊断工具
 * 用于分析评分结果并生成根因分析报告
 */

import { callVolcArkChatEnhanced } from './api';
import { trimNormalizedResult, calculateInputSize } from './inputTrimmer';
import { safeParseJson } from './safeJsonParser';

/**
 * RCA 归因提示词 - 加强约束
 */
const RCA_SYSTEM_PROMPT = `# System Role
你是美团生活服务场景的小美智能体评测专家（Evaluation Engineer），专注于 RCA 归因诊断。你的输出将被程序直接 JSON.parse 解析，用于看板展示与后续优化。

# Input
你会收到一个 JSON 对象，字段包括：
- normalizedResult：Step1 标准化结果（schema_version=xm_eval_v1），包含 dialogue_summary、turns、input_validation 等
- scoreResult：Step2 评分结果，包含 metrics、total_score、dashboard、stabilityStats(如有) 等

# Task (Step3 only)
只做"RCA 归因诊断"，不要做修复建议的具体实现。
1) 分析每个低分维度（score_0_5 <= 2 或 low_metrics 中的维度）
2) 为每个低分维度生成 RCA 条目，包含：根因、置信度、证据、诊断、修复建议
3) 汇总 Top 根因和 P0/P1/P2 建议清单

# Root Cause Categories (must map to one of these)
1. 知识缺失/信息不足（需要追问关键字段）
2. 工具调用缺失（该调未调）
3. 工具调用失败/超时（需重试/降级/兜底）
4. 参数抽取错误（地址/时间/订单号等）
5. 上下文丢失/多轮记忆失败
6. 幻觉/无依据承诺（与 tool_call/kb_hit 不一致）
7. 流程死循环/反复确认无进展
8. 意图多跳未拆解（未分步骤、未澄清）
9. 交付不收口（未给下一步可执行动作/未完成闭环）
10. 合规/隐私风险（敏感信息处理不当）
11. 表达不清导致误解（信息组织差）
12. 评测证据不足（缺 tool_call/kb_hit 导致置信度下降）

# Priority Rules
- P0：导致任务失败/合规风险/工具失败（直接影响 Task Completion/Policy）
- P1：明显影响效率/体验（Turn Efficiency/Helpfulness）
- P2：优化表达与细节

# Evidence Requirements
- 每条 RCA 必须引用 turns 的证据：turn_id + quote<=30字
- 必须指出"与哪个评分维度的 deductions/证据对齐"

# Output JSON schema (strict)
{
  "rca_version": "xm_rca_v1",
  "scenario": "...",
  "summary": {
    "top_root_causes": [{"root_cause":"...","count":2}],
    "p0_actions": 1,
    "p1_actions": 2,
    "p2_actions": 1
  },
  "items": [
    {
      "trigger_metric": "Task Completion",
      "trigger_score_0_5": 2,
      "root_cause": "流程未闭环/缺少收口动作",
      "confidence_0_1": 0.78,
      "evidence": [{"turn_id": 2, "quote": "..." }],
      "diagnosis": "一句话解释为什么判定为该根因",
      "fix": [
        {"action":"补齐下单收口：确认地址/支付/提交订单", "priority":"P0", "expected_gain":"提升Task Completion与Helpfulness"}
      ],
      "stability_note": "若稳定性波动大，提示该问题可能与随机性相关"
    }
  ],
  "handoff": {
    "recommended_next_step": "Optimization Plan",
    "quick_wins": ["...","..."]
  }
}

# Rules
- 严格 JSON 输出：禁止 markdown、禁止解释性文本
- 若所有维度>=4：仍生成 RCA，但提示"当前表现较好，归因为优化建议"
- 信息不足不允许臆测：降低 confidence，并写明"信息不足"
- 证据必须来自 turns 字段，quote 必须<=30字
- 根因必须从上述12类中选择或映射
- 优先级必须符合 P0/P1/P2 规则
- 修复建议必须具体可执行，包含 expected_gain
- 若 stabilityStats 波动大，必须添加 stability_note
- items 最多 5 条（Top root causes）
- 每条 evidence 最多 2 条
- fix 建议最多 2 条

# 重要约束
- 只输出合法JSON，不要输出任何解释文字
- 不要使用 Markdown 代码块，不要 \`\`\`json\`\`\`
- 输出必须以 { 开头，以 } 结尾`;

/**
 * 瘦身处理RCA输入
 * @param {Object} normalizedResult - 原始标准化结果
 * @param {Object} scoreResult - 原始评分结果
 * @returns {Object} 瘦身后的RCA输入
 */
function trimRCAInput(normalizedResult, scoreResult) {
  // 瘦身normalizedResult
  const trimmedNormalized = trimNormalizedResult(normalizedResult, 12);
  
  // 瘦身scoreResult
  const trimmedScore = {};
  
  if (scoreResult) {
    // 保留总分
    if (scoreResult.model_a_result?.total_score_0_100 !== undefined) {
      trimmedScore.total_score_0_100 = scoreResult.model_a_result.total_score_0_100;
    } else if (scoreResult.total_score_0_100 !== undefined) {
      trimmedScore.total_score_0_100 = scoreResult.total_score_0_100;
    }
    
    // 保留低分维度（score<=2的Top3）
    let metrics = [];
    if (Array.isArray(scoreResult.model_a_result?.metrics)) {
      metrics = scoreResult.model_a_result.metrics;
    } else if (Array.isArray(scoreResult.metrics)) {
      metrics = scoreResult.metrics;
    }
    
    const lowMetrics = metrics
      .filter(metric => metric.score_0_5 <= 2)
      .sort((a, b) => a.score_0_5 - b.score_0_5)
      .slice(0, 3)
      .map(metric => ({
        name: metric.name,
        score_0_5: metric.score_0_5,
        confidence_0_1: metric.confidence_0_1,
        deductions: (metric.deductions || []).slice(0, 3),
        evidence: (metric.evidence || []).slice(0, 2).map(e => ({
          turn_id: e.turn_id,
          quote: e.quote ? e.quote.substring(0, 30) : ''
        }))
      }));
    
    if (lowMetrics.length > 0) {
      trimmedScore.low_metrics = lowMetrics;
    }
    
    // 保留稳定性统计（仅total）
    if (scoreResult.stabilityStats?.total) {
      trimmedScore.stabilityStats = {
        total: {
          mean: scoreResult.stabilityStats.total.mean,
          std: scoreResult.stabilityStats.total.std,
          range: scoreResult.stabilityStats.total.range
        }
      };
    }
  }
  
  return {
    normalizedResult: trimmedNormalized,
    scoreResult: trimmedScore
  };
}

/**
 * 执行 RCA 归因诊断
 * @param {Object} normalizedResult - 标准化结果
 * @param {Object} scoreResult - 评分结果
 * @param {Object} modelConfig - 模型配置
 * @returns {Promise<Object>} RCA 归因结果
 */
export async function performRCADiagnosis(normalizedResult, scoreResult, modelConfig) {
  try {
    // 输入瘦身
    const trimmedInput = trimRCAInput(normalizedResult, scoreResult);
    const rcaInputSizeChars = calculateInputSize(trimmedInput);
    
    // 构建用户输入
    const userContent = JSON.stringify(trimmedInput);

    // 调用火山方舟模型 - 使用统一调用函数，60秒超时
    const messages = [
      { role: 'system', content: RCA_SYSTEM_PROMPT },
      { role: 'user', content: userContent }
    ];

    let response;
    try {
      const result = await callVolcArkChatEnhanced({
        baseUrl: modelConfig.baseUrl,
        endpointId: modelConfig.endpointId,
        apiKey: modelConfig.apiKey,
        temperature: 0.1, // 使用较低温度确保结果一致性
        messages,
        taskType: 'rca',
        maxRetries: 2
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
          rcaInputSizeChars: rcaInputSizeChars,
          attemptRecords: result.attemptRecords
        }
      };
      
      // 使用安全解析器解析JSON
      try {
        const parsedResult = safeParseJson(response);
        return {
          ...parsedResult,
          debugInfo: responseWithDebugInfo.debugInfo
        };
      } catch (parseError) {
        console.log('第一次JSON解析失败，进行纠错重试...');
        
        // 纠错重试：追加"只输出JSON"指令
        const retryMessages = [
          ...messages,
          { role: 'assistant', content: response },
          { role: 'user', content: '请只输出JSON格式，不要包含任何其他文本或markdown格式。' }
        ];
        
        const retryResult = await callVolcArkChatEnhanced({
          baseUrl: modelConfig.baseUrl,
          endpointId: modelConfig.endpointId,
          apiKey: modelConfig.apiKey,
          temperature: 0.1,
          messages: retryMessages,
          taskType: 'rca',
          maxRetries: 0 // 重试时不再重试
        });
        
        try {
          const parsedResult = safeParseJson(retryResult.content);
          return {
            ...parsedResult,
            debugInfo: {
              ...responseWithDebugInfo.debugInfo,
              attempt: retryResult.attempt,
              durationMs: retryResult.durationMs,
              timeoutMs: retryResult.timeoutMs,
              inputSizeChars: retryResult.inputSizeChars,
              attemptRecords: retryResult.attemptRecords
            }
          };
        } catch (retryParseError) {
          throw new Error('模型输出无法解析为JSON格式');
        }
      }
    } catch (error) {
      // 提供更详细的错误信息
      const detailedError = new Error(`RCA模型调用失败: ${error.code || 'Unknown'} - ${error.message || error.statusText}`);
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
        rcaInputSizeChars: rcaInputSizeChars,
        attemptRecords: error.attemptRecords,
        timestamp: new Date().toISOString()
      };
      throw detailedError;
    }

  } catch (error) {
    console.error('RCA诊断错误:', error);
    
    // 创建包含详细调试信息的错误对象
    const rcaError = new Error(error.message || 'RCA诊断调用失败');
    rcaError.debugInfo = {
      error: error.message,
      debugInfo: error.debugInfo,
      timestamp: new Date().toISOString()
    };
    
    throw rcaError;
  }
}

/**
 * 检查是否可以进行 RCA 归因
 * @param {Object} scoreResult - 评分结果
 * @returns {Object} 检查结果 { canPerform, reason }
 */
export function canPerformRCA(scoreResult) {
  if (!scoreResult || !scoreResult.model_a_result) {
    return { canPerform: false, reason: '评分结果不存在' };
  }

  const metrics = scoreResult.model_a_result.metrics || [];
  const lowMetrics = scoreResult.model_a_result.dashboard?.low_metrics || [];
  
  // 检查是否有低分维度
  const hasLowScoreMetrics = metrics.some(metric => metric.score_0_5 <= 2);
  const hasLowMetrics = lowMetrics.length > 0;
  
  if (hasLowScoreMetrics || hasLowMetrics) {
    return { canPerform: true, reason: '存在低分维度，建议进行归因分析' };
  }
  
  // 检查是否所有维度都较高
  const allHighScore = metrics.every(metric => metric.score_0_5 >= 4);
  if (allHighScore) {
    return { canPerform: true, reason: '当前表现较好，归因为优化建议' };
  }
  
  return { canPerform: true, reason: '可以进行归因分析' };
}

/**
 * 格式化 RCA 结果用于展示
 * @param {Object} rcaResult - RCA 结果
 * @returns {Object} 格式化后的结果
 */
export function formatRCAResult(rcaResult) {
  if (!rcaResult) return null;
  
  return {
    ...rcaResult,
    formatted_at: new Date().toISOString(),
    items_count: rcaResult.items?.length || 0,
    p0_count: rcaResult.summary?.p0_actions || 0,
    p1_count: rcaResult.summary?.p1_actions || 0,
    p2_count: rcaResult.summary?.p2_actions || 0
  };
}

/**
 * 获取 RCA 根因分类列表
 * @returns {Array} 根因分类列表
 */
export function getRCACategories() {
  return [
    "知识缺失/信息不足（需要追问关键字段）",
    "工具调用缺失（该调未调）",
    "工具调用失败/超时（需重试/降级/兜底）",
    "参数抽取错误（地址/时间/订单号等）",
    "上下文丢失/多轮记忆失败",
    "幻觉/无依据承诺（与 tool_call/kb_hit 不一致）",
    "流程死循环/反复确认无进展",
    "意图多跳未拆解（未分步骤、未澄清）",
    "交付不收口（未给下一步可执行动作/未完成闭环）",
    "合规/隐私风险（敏感信息处理不当）",
    "表达不清导致误解（信息组织差）",
    "评测证据不足（缺 tool_call/kb_hit 导致置信度下降）"
  ];
}

/**
 * 获取优先级列表
 * @returns {Array} 优先级列表
 */
export function getPriorities() {
  return [
    { value: "P0", label: "P0 - 关键问题", description: "导致任务失败/合规风险/工具失败" },
    { value: "P1", label: "P1 - 重要问题", description: "明显影响效率/体验" },
    { value: "P2", label: "P2 - 优化建议", description: "优化表达与细节" }
  ];
}
