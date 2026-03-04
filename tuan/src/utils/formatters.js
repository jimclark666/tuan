/**
 * 评测结果格式化工具
 * 用于将模型输出的原始结果转换为标准格式
 */

import { safeParseJson } from './safeJsonParser';

/**
 * 格式化评测结果
 * @param {string|Object} raw - 原始评测结果（字符串或对象）
 * @returns {Object} 格式化后的评测结果
 */
export function formatEvaluationResult(raw) {
  try {
    let parsedResult;

    // 如果输入是字符串，使用安全解析器
    if (typeof raw === 'string') {
      try {
        parsedResult = safeParseJson(raw);
      } catch (parseError) {
        throw new Error(`模型输出包含无效JSON格式，无法解析: ${parseError.message}`);
      }
    } else if (typeof raw === 'object' && raw !== null) {
      // 如果已经是对象，直接使用
      parsedResult = raw;
    } else {
      throw new Error('评测结果格式不支持，必须是字符串或对象');
    }

    // 检查是否为轻量JSON格式（回归评测专用）
    if (typeof parsedResult.total_score_0_100 === 'number' && Array.isArray(parsedResult.key_metrics)) {
      // 轻量JSON格式，转换为标准格式
      return {
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
          weight_reason: '轻量回归评测结果'
        },
        model_a_result: {
          scenario: '回归评测',
          metrics: parsedResult.key_metrics.map(metric => ({
            name: metric.name,
            score_0_5: metric.score_0_5,
            confidence_0_1: 0.8,
            evidence: [],
            deductions: []
          })),
          total_score_0_100: parsedResult.total_score_0_100,
          dashboard: {
            radar: parsedResult.key_metrics.map(metric => ({
              metric: metric.name,
              value_0_5: metric.score_0_5
            })),
            low_metrics: parsedResult.key_metrics.filter(metric => metric.score_0_5 <= 2),
            critical_turn_ids: [],
            notes: [parsedResult.one_sentence_summary || '回归评测完成']
          }
        },
        handoff_to_next_step: {
          recommended_next_node: "RCA",
          rca_triggers: []
        },
        formatted_at: new Date().toISOString()
      };
    }

    // 确保基本结构存在
    const result = {
      scoring_version: parsedResult.scoring_version || 'unknown',
      input_schema_version: parsedResult.input_schema_version || 'xm_eval_v1',
      ab_test: parsedResult.ab_test || { enabled: false },
      weights: parsedResult.weights || {
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
        weight_reason: parsedResult.weights?.weight_reason || '默认权重配置'
      },
      model_a_result: formatModelResult(parsedResult.model_a_result, parsedResult),
      handoff_to_next_step: parsedResult.handoff_to_next_step || {
        recommended_next_node: "RCA",
        rca_triggers: []
      }
    };

    // 如果有Model B结果，添加它
    if (parsedResult.model_b_result) {
      result.model_b_result = formatModelResult(parsedResult.model_b_result, parsedResult);
    }

    // 添加格式化时间戳
    result.formatted_at = new Date().toISOString();

    return result;

  } catch (error) {
    console.error('格式化评测结果失败:', error);
    
    // 返回错误结构，便于UI展示
    return {
      scoring_version: 'error',
      input_schema_version: 'xm_eval_v1',
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
        weight_reason: '格式化失败，使用默认权重'
      },
      model_a_result: {
        scenario: '格式化错误',
        metrics: [],
        total_score_0_100: 0,
        dashboard: {
          radar: [],
          low_metrics: [],
          critical_turn_ids: [],
          notes: [`格式化失败: ${error.message}`]
        }
      },
      handoff_to_next_step: {
        recommended_next_node: "RCA",
        rca_triggers: []
      },
      format_error: error.message,
      raw_preview: typeof raw === 'string' ? raw.substring(0, 200) : '非字符串输入'
    };
  }
}

/**
 * 格式化单个模型结果
 * @param {Object} modelResult - 模型结果对象
 * @param {Object} fullResult - 完整结果对象（用于兼容性处理）
 * @returns {Object} 格式化后的模型结果
 */
function formatModelResult(modelResult, fullResult) {
  if (!modelResult) {
    // 尝试从完整结果中提取兼容字段
    const totalScore = extractTotalScore(fullResult);
    const metrics = extractMetrics(fullResult);
    
    return {
      scenario: fullResult.scenario || '未知场景',
      metrics,
      total_score_0_100: totalScore,
      dashboard: {
        radar: [],
        low_metrics: [],
        critical_turn_ids: [],
        notes: ['缺少模型结果数据，使用兼容字段提取']
      }
    };
  }

  // 处理总分兼容性
  let totalScore = 0;
  if (modelResult.total_score_0_100 !== undefined) {
    totalScore = modelResult.total_score_0_100;
  } else {
    totalScore = extractTotalScore(fullResult);
  }

  // 处理metrics
  let metrics = [];
  if (Array.isArray(modelResult.metrics)) {
    metrics = modelResult.metrics.map(formatMetric);
  } else {
    metrics = extractMetrics(fullResult);
  }

  // 处理dashboard
  const dashboard = modelResult.dashboard || {
    radar: [],
    low_metrics: [],
    critical_turn_ids: [],
    notes: []
  };

  // 如果缺少metrics字段，添加提示
  if (metrics.length === 0) {
    dashboard.notes.push('缺少metrics字段，无法显示维度评分');
  }

  return {
    scenario: modelResult.scenario || fullResult.scenario || '未知场景',
    metrics,
    total_score_0_100: totalScore,
    dashboard
  };
}

/**
 * 从完整结果中提取总分（兼容性处理）
 */
function extractTotalScore(fullResult) {
  if (fullResult.model_a_result?.total_score_0_100 !== undefined) {
    return fullResult.model_a_result.total_score_0_100;
  }
  if (fullResult.total_score_0_100 !== undefined) {
    return fullResult.total_score_0_100;
  }
  if (fullResult.total_score !== undefined) {
    return fullResult.total_score;
  }
  if (fullResult.modelA?.total_score_0_100 !== undefined) {
    return fullResult.modelA.total_score_0_100;
  }
  if (fullResult.modelA?.total_score !== undefined) {
    return fullResult.modelA.total_score;
  }
  return 0;
}

/**
 * 从完整结果中提取metrics（兼容性处理）
 */
function extractMetrics(fullResult) {
  if (Array.isArray(fullResult.model_a_result?.metrics)) {
    return fullResult.model_a_result.metrics.map(formatMetric);
  }
  if (Array.isArray(fullResult.metrics)) {
    return fullResult.metrics.map(formatMetric);
  }
  if (Array.isArray(fullResult.modelA?.metrics)) {
    return fullResult.modelA.metrics.map(formatMetric);
  }
  return [];
}

/**
 * 格式化单个metric
 * @param {Object} metric - 原始metric对象
 * @returns {Object} 格式化后的metric
 */
function formatMetric(metric) {
  if (!metric) {
    return {
      name: '未知维度',
      score_0_5: 0,
      confidence_0_1: 0,
      evidence: [],
      deductions: []
    };
  }

  return {
    name: metric.name || '未知维度',
    score_0_5: metric.score_0_5 || 0,
    confidence_0_1: metric.confidence_0_1 || 0,
    rubric: metric.rubric || {},
    evidence: Array.isArray(metric.evidence) ? metric.evidence : [],
    deductions: Array.isArray(metric.deductions) ? metric.deductions : []
  };
}
