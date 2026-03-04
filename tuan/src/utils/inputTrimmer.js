/**
 * 评测输入瘦身工具
 * 用于减少传递给大模型的token数量，降低超时概率
 */

/**
 * 瘦身处理标准化结果
 * @param {Object} normalizedResult - 原始标准化结果
 * @param {number} maxTurns - 最大轮次数，默认12
 * @returns {Object} 瘦身后的结果
 */
export function trimNormalizedResult(normalizedResult, maxTurns = 12) {
  if (!normalizedResult || typeof normalizedResult !== 'object') {
    return normalizedResult;
  }

  // 瘦身dialogue_summary
  const trimmedSummary = {};
  if (normalizedResult.dialogue_summary) {
    const summary = normalizedResult.dialogue_summary;
    trimmedSummary.scenario = summary.scenario;
    trimmedSummary.user_goal = summary.user_goal;
    trimmedSummary.success_criteria = summary.success_criteria;
    trimmedSummary.privacy_risk_flag = summary.privacy_risk_flag;
  }

  // 瘦身turns
  let trimmedTurns = [];
  if (Array.isArray(normalizedResult.turns)) {
    // 限制轮次数
    const turnsToProcess = normalizedResult.turns.slice(0, maxTurns);
    
    trimmedTurns = turnsToProcess.map(turn => {
      const trimmedTurn = {
        turn_id: turn.turn_id,
        role: turn.role,
        content: turn.content ? turn.content.substring(0, 200) : '',
        tool_call: null,
        kb_hit: null
      };

      // 瘦身tool_call
      if (turn.tool_call) {
        trimmedTurn.tool_call = {
          name: turn.tool_call.name,
          status: turn.tool_call.status
        };
      }

      // 瘦身kb_hit
      if (turn.kb_hit) {
        trimmedTurn.kb_hit = {
          top_hits_count: turn.kb_hit.top_hits_count
        };
      }

      return trimmedTurn;
    });

    // 如果超过最大轮次数，添加虚拟轮次
    if (normalizedResult.turns.length > maxTurns) {
      trimmedTurns.push({
        turn_id: "tail",
        role: "system",
        content: "后续轮次省略，用于缩短评测输入"
      });
    }
  }

  return {
    ...normalizedResult,
    dialogue_summary: trimmedSummary,
    turns: trimmedTurns
  };
}

/**
 * 计算输入大小（字符数）
 * @param {Object} data - 要计算的数据
 * @returns {number} 字符数
 */
export function calculateInputSize(data) {
  try {
    return JSON.stringify(data).length;
  } catch (error) {
    return 0;
  }
}
