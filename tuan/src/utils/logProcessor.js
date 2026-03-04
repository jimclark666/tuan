
// 对话日志标准化处理工具
export const processLogData = async (inputText) => {
  try {
    // 解析输入数据
    let inputData;
    try {
      inputData = JSON.parse(inputText);
    } catch (e) {
      throw new Error('输入数据不是有效的JSON格式');
    }

    // 初始化结果结构
    const result = {
      schema_version: "xm_eval_v1",
      schema_brief: {
        turn_required_fields: ["turn_id", "role", "content", "timestamp", "tool_call", "kb_hit", "derived"],
        dialogue_required_fields: ["scenario", "user_goal", "goal_confidence_0_1", "success_criteria", "privacy_risk_flag"]
      },
      input_validation: {
        is_valid: true,
        errors: [],
        warnings: [],
        missing_fields: [],
        normalization_actions: []
      },
      dialogue_summary: {},
      turns: [],
      ui_hints: {
        recommended_sections: ["校验结果", "场景与目标", "关键轮次", "对话轮次", "工具调用", "缺失信息"],
        highlight_turn_ids: [],
        badges: [],
        turn_badges: []
      },
      handoff_to_next_step: {
        recommended_next_node: "Scoring",
        critical_turn_ids: [],
        notes_for_scoring: []
      }
    };

    // 处理消息数据
    const messages = inputData.messages || inputData.conversation || inputData.dialogue || [];
    
    if (!Array.isArray(messages) || messages.length === 0) {
      result.input_validation.errors.push('未找到有效的消息数据');
      result.input_validation.is_valid = false;
      return result;
    }

    // 标准化处理每条消息
    const processedTurns = [];
    let turnId = 1;

    for (const message of messages) {
      const processedTurn = await processMessage(message, turnId);
      processedTurns.push(processedTurn);
      turnId++;
    }

    result.turns = processedTurns;

    // 生成对话摘要
    result.dialogue_summary = generateDialogueSummary(processedTurns);

    // 生成UI提示
    result.ui_hints = generateUIHints(processedTurns, result.dialogue_summary);

    // 生成交接信息
    result.handoff_to_next_step = generateHandoffInfo(processedTurns, result.dialogue_summary);

    // 执行输入验证
    validateInput(result, inputData);

    return result;

  } catch (error) {
    throw new Error(`处理失败: ${error.message}`);
  }
};

// 处理单条消息
const processMessage = async (message, turnId) => {
  const turn = {
    turn_id: turnId,
    role: normalizeRole(message.role),
    content: message.content || '',
    timestamp: message.timestamp || null,
    tool_call: null,
    kb_hit: null,
    derived: {
      intent_candidate: 'uncertain',
      needs_tool: false,
      key_entities: [],
      system_instruction: false
    }
  };

  // 处理工具调用
  if (message.tool_calls && Array.isArray(message.tool_calls)) {
    const toolCall = message.tool_calls[0]; // 取第一个工具调用
    turn.tool_call = {
      name: toolCall.name || 'unknown',
      args: toolCall.args || {},
      status: toolCall.status || 'unknown',
      error: toolCall.error || null
    };
    turn.derived.needs_tool = true;
  }

  // 处理知识库检索
  if (message.kb_hits && Array.isArray(message.kb_hits)) {
    const kbHit = message.kb_hits[0]; // 取第一个检索结果
    turn.kb_hit = {
      query: kbHit.query || '',
      top_hits_count: kbHit.top_hits_count || 0,
      top_sources: kbHit.top_sources || []
    };
  }

  // 生成派生字段
  turn.derived = generateDerivedFields(turn, message);

  return turn;
};

// 标准化角色
const normalizeRole = (role) => {
  const validRoles = ['user', 'assistant', 'tool', 'system'];
  const normalizedRole = role?.toLowerCase();
  return validRoles.includes(normalizedRole) ? normalizedRole : 'user';
};

// 生成派生字段
const generateDerivedFields = (turn, originalMessage) => {
  const derived = {
    intent_candidate: 'uncertain',
    needs_tool: turn.tool_call !== null,
    key_entities: extractKeyEntities(turn.content),
    system_instruction: turn.role === 'system' || isSystemInstruction(turn.content)
  };

  // 意图识别
  derived.intent_candidate = detectIntent(turn.content, turn.role);

  return derived;
};

// 提取关键实体
const extractKeyEntities = (content) => {
  const entities = [];
  
  // 简单的实体提取规则
  const patterns = [
    { pattern: /(\d{11})/g, type: '手机号' },
    { pattern: /(\d{5,})/g, type: '订单号' },
    { pattern: /([¥￥]?\d+(?:\.\d{2})?)/g, type: '金额' },
    { pattern: /(\d{4}-\d{2}-\d{2})/g, type: '日期' },
    { pattern: /(\d{1,2}:\d{2})/g, type: '时间' }
  ];

  patterns.forEach(({ pattern, type }) => {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(match => {
        entities.push(`${type}: ${match}`);
      });
    }
  });

  return entities;
};

// 检测是否为系统指令
const isSystemInstruction = (content) => {
  const systemKeywords = ['系统', '提示', '注意', '警告', 'error', 'warning'];
  return systemKeywords.some(keyword => content.toLowerCase().includes(keyword));
};

// 意图识别
const detectIntent = (content, role) => {
  if (role === 'system') return '系统指令';
  
  const intentPatterns = [
    { keywords: ['下单', '订购', '购买'], intent: '下单购买' },
    { keywords: ['退款', '退单', '退货'], intent: '退款退货' },
    { keywords: ['查询', '查找', '搜索'], intent: '信息查询' },
    { keywords: ['取消', '撤销'], intent: '取消操作' },
    { keywords: ['修改', '更改', '更新'], intent: '修改信息' },
    { keywords: ['帮助', '客服', '咨询'], intent: '寻求帮助' }
  ];

  for (const { keywords, intent } of intentPatterns) {
    if (keywords.some(keyword => content.includes(keyword))) {
      return intent;
    }
  }

  return 'uncertain';
};

// 生成对话摘要
const generateDialogueSummary = (turns) => {
  const summary = {
    scenario: detectScenario(turns),
    user_goal: extractUserGoal(turns),
    goal_confidence_0_1: calculateGoalConfidence(turns),
    success_criteria: generateSuccessCriteria(turns),
    privacy_risk_flag: assessPrivacyRisk(turns)
  };

  return summary;
};

// 场景检测
const detectScenario = (turns) => {
  const allContent = turns.map(turn => turn.content).join(' ');
  
  const scenarios = [
    { name: '外卖下单', keywords: ['下单', '配送', '地址', '餐品', '骑手', '预计送达'] },
    { name: '到店团购核销', keywords: ['团购', '核销', '券码', '二维码', '门店核销', '预约到店'] },
    { name: '退款售后', keywords: ['退款', '退单', '售后', '投诉', '催单', '错送', '漏送', '赔付'] },
    { name: '酒店预订', keywords: ['入住', '退房', '房型', '预订', '取消', '价格', '发票'] }
  ];

  for (const scenario of scenarios) {
    if (scenario.keywords.some(keyword => allContent.includes(keyword))) {
      return scenario.name;
    }
  }

  return '其他';
};

// 提取用户目标
const extractUserGoal = (turns) => {
  const userTurns = turns.filter(turn => turn.role === 'user');
  if (userTurns.length === 0) return 'uncertain';
  
  const firstUserTurn = userTurns[0];
  return firstUserTurn.content.length > 50 
    ? firstUserTurn.content.substring(0, 50) + '...'
    : firstUserTurn.content;
};

// 计算目标置信度
const calculateGoalConfidence = (turns) => {
  const userTurns = turns.filter(turn => turn.role === 'user');
  if (userTurns.length === 0) return 0.0;
  
  // 简单的置信度计算逻辑
  let confidence = 0.5;
  
  if (userTurns.length >= 2) confidence += 0.2;
  if (turns.some(turn => turn.tool_call)) confidence += 0.2;
  if (turns.some(turn => turn.kb_hit)) confidence += 0.1;
  
  return Math.min(confidence, 1.0);
};

// 生成成功标准
const generateSuccessCriteria = (turns) => {
  const criteria = [];
  
  if (turns.some(turn => turn.tool_call)) {
    criteria.push('工具调用成功完成');
  }
  
  if (turns.some(turn => turn.role === 'assistant' && turn.content.includes('完成'))) {
    criteria.push('用户请求得到满足');
  }
  
  criteria.push('对话流程自然流畅');
  criteria.push('信息传递准确完整');
  
  return criteria;
};

// 隐私风险评估
const assessPrivacyRisk = (turns) => {
  const allContent = turns.map(turn => turn.content).join(' ');
  const privacyKeywords = ['身份证', '银行卡', '密码', '手机号', '地址', '姓名'];
  
  const hasPrivacyInfo = privacyKeywords.some(keyword => allContent.includes(keyword));
  
  return {
    flag: hasPrivacyInfo,
    reason: hasPrivacyInfo ? '对话中包含个人敏感信息' : '未检测到明显的隐私风险'
  };
};

// 生成UI提示
const generateUIHints = (turns, summary) => {
  const hints = {
    recommended_sections: ["校验结果", "场景与目标", "关键轮次", "对话轮次", "工具调用", "缺失信息"],
    highlight_turn_ids: [],
    badges: [
      { type: "scenario", text: summary.scenario }
    ],
    turn_badges: []
  };

  // 添加风险徽章
  if (summary.privacy_risk_flag.flag) {
    hints.badges.push({
      type: "risk",
      level: "high",
      text: "隐私风险"
    });
  }

  // 高亮关键轮次
  turns.forEach(turn => {
    if (turn.role === 'user' && turn.turn_id === 1) {
      hints.highlight_turn_ids.push(turn.turn_id);
      hints.turn_badges.push({
        turn_id: turn.turn_id,
        tags: ["用户目标", "关键信息"]
      });
    }
    
    if (turn.tool_call && turn.tool_call.status === 'failed') {
      hints.turn_badges.push({
        turn_id: turn.turn_id,
        tags: ["工具调用", "失败"]
      });
    }
  });

  return hints;
};

// 生成交接信息
const generateHandoffInfo = (turns, summary) => {
  const criticalTurnIds = turns
    .filter(turn => turn.role === 'user' || turn.tool_call)
    .map(turn => turn.turn_id);

  const notes = [
    "本对话是否存在工具调用/检索证据，若缺失将降低相关维度置信度",
    "哪些信息不足会影响任务完成率/意图识别等评测维度"
  ];

  if (summary.privacy_risk_flag.flag) {
    notes.push("对话包含隐私信息，需要特别注意数据保护");
  }

  return {
    recommended_next_node: "Scoring",
    critical_turn_ids: criticalTurnIds,
    notes_for_scoring: notes
  };
};

// 输入验证
const validateInput = (result, inputData) => {
  const validation = result.input_validation;
  
  // 检查必需字段
  if (!inputData.messages && !inputData.conversation && !inputData.dialogue) {
    validation.missing_fields.push('messages/conversation/dialogue');
    validation.warnings.push('建议使用标准的消息字段名称');
  }

  // 记录标准化操作
  validation.normalization_actions.push('消息格式标准化');
  validation.normalization_actions.push('角色名称统一化');
  validation.normalization_actions.push('时间戳格式验证');
  
  if (result.turns.length > 0) {
    validation.normalization_actions.push('成功处理 ' + result.turns.length + ' 条消息');
  }

  // 添加数据质量检查
  if (result.turns.length === 0) {
    validation.errors.push('未能处理任何消息，请检查输入数据格式');
    validation.is_valid = false;
  }

  // 检查是否有严重的数据问题
  const hasEmptyContent = result.turns.some(turn => !turn.content || turn.content.trim() === '');
  if (hasEmptyContent) {
    validation.warnings.push('部分消息内容为空，可能影响分析质量');
  }

  // 检查时间戳格式
  const invalidTimestamps = result.turns.filter(turn => 
    turn.timestamp && isNaN(new Date(turn.timestamp).getTime())
  );
  if (invalidTimestamps.length > 0) {
    validation.warnings.push(`发现 ${invalidTimestamps.length} 条无效的时间戳格式`);
  }
};

