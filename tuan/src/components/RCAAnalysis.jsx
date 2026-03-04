import ErrorAlert from './ErrorAlert';
import { formatRCAResult, getRCACategories, canPerformRCA, performRCADiagnosis } from '../utils/rca';
import { Brain, RefreshCw, Shield, ChevronDown, BookOpen, Lightbulb, CheckCircle, AlertTriangle, ArrowRight, MessageCircle, Target, Copy, TrendingUp, ChevronUp } from 'lucide-react';
import { formatEvaluationResult } from '../utils/formatters';
import React, { useRef, useState } from 'react';
import { sanitizeConfig } from '../utils/sanitize';
import { evaluateWithLLMEnhanced, evaluateWithLLM, callVolcArkChatEnhanced } from '../utils/api';

const RCAAnalysis = ({ normalizedData, scoreResult, modelConfig, onTurnSelect }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [rcaResult, setRcaResult] = useState(null);
  const [error, setError] = useState('');
  const [errorDebugInfo, setErrorDebugInfo] = useState(null);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [copied, setCopied] = useState(false);
  const [strategyTexts, setStrategyTexts] = useState({});
  const [isGeneratingStrategy, setIsGeneratingStrategy] = useState({});
  const [isReEvaluating, setIsReEvaluating] = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [showRootCauseLibrary, setShowRootCauseLibrary] = useState(false);
  const [regressionError, setRegressionError] = useState(null);
  const [regressionLogs, setRegressionLogs] = useState([]);
  const [regressionProgress, setRegressionProgress] = useState('');
  const [regressionTarget, setRegressionTarget] = useState('A'); // 新增：回归目标选择器
  
  // 用于组件卸载保护
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef(null);

  // 检查是否可以进行 RCA
  const rcaCheck = canPerformRCA(scoreResult);
  const canPerform = rcaCheck.canPerform;

  // 执行 RCA 分析
  const handleRCAnalysis = async () => {
    if (!normalizedData || !scoreResult) {
      setError('缺少必要的数据：标准化结果或评分结果');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setErrorDebugInfo(null);
    setRcaResult(null);

    try {
      const result = await performRCADiagnosis(normalizedData, scoreResult, modelConfig);
      const formattedResult = formatRCAResult(result);
      setRcaResult(formattedResult);
    } catch (err) {
      setError(err.message);
      setErrorDebugInfo(err.debugInfo || null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 生成优化策略文本
  const generateStrategyText = async (item, index) => {
    if (!item.fix || item.fix.length === 0) {
      return;
    }

    setIsGeneratingStrategy(prev => ({ ...prev, [index]: true }));

    try {
      // 构建策略生成提示词
      const systemPrompt = `你是一个AI系统优化专家，请根据以下RCA修复建议生成可直接落地的策略文本：

RCA问题: ${item.trigger_metric} (${item.trigger_score_0_5}分)
根因: ${item.root_cause}
修复建议: ${item.fix[0].action}
预期收益: ${item.fix[0].expected_gain}

请生成一段可直接用于system prompt / policy / tool-calling rule的文本，包含：
A. 触发条件（When）：什么情况下需要执行此策略
B. 动作步骤（Do）：具体的执行步骤
C. 兜底/降级（Fallback）：失败或异常情况的处理
D. 合规边界（Policy）：什么情况下应该拒绝或需要特别注意
E. 验收指标（Metrics）：如何衡量策略效果

输出要求：
- 不写代码，只写规则
- 语言简洁明确
- 可直接复制到系统提示词中使用
- 长度控制在150-250字`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '请生成优化策略文本' }
      ];

      // 使用增强版API调用
      let response;
      try {
        const result = await callVolcArkChatEnhanced({
          baseUrl: modelConfig.baseUrl,
          endpointId: modelConfig.endpointId,
          apiKey: modelConfig.apiKey,
          temperature: 0.1, // 使用较低温度确保结果一致性
          messages,
          taskType: 'strategy',
          maxRetries: 2
        });
        
        response = result.content;
      } catch (error) {
        // 模型调用失败，降级为使用 RCA fix 文本生成"简化策略文本"
        console.error('策略生成模型调用失败，使用简化策略:', error);
        
        const simplifiedStrategy = `当${item.trigger_metric}评分较低时（当前${item.trigger_score_0_5}分），执行以下优化：
        
【触发条件】检测到${item.trigger_metric}维度评分≤2分
【执行动作】${item.fix[0].action}
【预期收益】${item.fix[0].expected_gain}
【注意事项】${item.root_cause}

（此为简化策略，建议后续完善具体执行细节）`;
        
        setStrategyTexts(prev => ({ ...prev, [index]: simplifiedStrategy }));
        return;
      }

      // 策略生成输出改为"纯文本"，不要 JSON.parse
      if (!response || typeof response !== 'string' || response.trim() === '') {
        throw new Error('策略生成失败：返回内容为空');
      }

      setStrategyTexts(prev => ({ ...prev, [index]: response }));
    } catch (err) {
      console.error('生成策略文本失败:', err);
      
      // 错误处理与可诊断信息
      const errorInfo = {
        message: err.message || '策略生成失败',
        debugInfo: err.debugInfo || {
          status: err.status,
          responseText: err.responseText ? err.responseText.substring(0, 300) : '无响应内容',
          suggestion: '请检查API Key、Endpoint ID配置，或稍后重试'
        }
      };
      
      setStrategyTexts(prev => ({ 
        ...prev, 
        [index]: `策略生成失败: ${errorInfo.message}` 
      }));
      
      // 在UI中显示错误信息
      setError(errorInfo.message);
      setErrorDebugInfo(errorInfo.debugInfo);
    } finally {
      setIsGeneratingStrategy(prev => ({ ...prev, [index]: false }));
    }
  };

  // 瘦身处理回归评测输入 - 强制瘦身
  const trimRegressionInput = (normalizedResult, scoreResult, strategyText, maxTurns = 8, maxContentLength = 160) => {
    // 瘦身normalizedResult
    const trimmedNormalized = { ...normalizedResult };
    
    // 瘦身dialogue_summary - 只保留关键字段
    if (trimmedNormalized.dialogue_summary) {
      const summary = trimmedNormalized.dialogue_summary;
      trimmedNormalized.dialogue_summary = {
        scenario: summary.scenario,
        user_goal: summary.user_goal,
        success_criteria: summary.success_criteria
      };
    }
    
    // 瘦身turns - 优先保留关键轮次
    if (Array.isArray(trimmedNormalized.turns)) {
      // 获取关键轮次ID
      const criticalTurnIds = scoreResult?.model_a_result?.dashboard?.critical_turn_ids || [];
      const evidenceTurnIds = [];
      
      // 收集RCA证据轮次
      if (rcaResult?.items) {
        rcaResult.items.forEach(item => {
          if (item.evidence) {
            item.evidence.forEach(ev => {
              if (ev.turn_id) evidenceTurnIds.push(ev.turn_id);
            });
          }
        });
      }
      
      // 获取tool_call相关轮次
      const toolCallTurnIds = [];
      trimmedNormalized.turns.forEach(turn => {
        if (turn.tool_call) {
          toolCallTurnIds.push(turn.turn_id);
        }
      });
      
      // 优先保留的轮次：用户目标首轮、关键轮次、证据轮次、工具调用轮次
      const priorityTurnIds = new Set([
        1, // 用户目标首轮
        ...criticalTurnIds,
        ...evidenceTurnIds,
        ...toolCallTurnIds
      ]);
      
      // 按优先级排序并限制数量
      const sortedTurns = [...trimmedNormalized.turns].sort((a, b) => {
        const aPriority = priorityTurnIds.has(a.turn_id) ? 1 : 0;
        const bPriority = priorityTurnIds.has(b.turn_id) ? 1 : 0;
        return bPriority - aPriority;
      });
      
      // 限制轮次数
      const turnsToKeep = sortedTurns.slice(0, maxTurns);
      
      // 瘦身每条轮次的内容
      trimmedNormalized.turns = turnsToKeep.map(turn => {
        const trimmedTurn = {
          turn_id: turn.turn_id,
          role: turn.role,
          content: turn.content ? turn.content.substring(0, maxContentLength) : '',
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
      if (trimmedNormalized.turns.length > maxTurns) {
        trimmedNormalized.turns.push({
          turn_id: "tail",
          role: "system",
          content: "后续轮次省略，用于缩短评测输入"
        });
      }
    }
    
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
      
      // 保留关键轮次ID
      if (scoreResult.model_a_result?.dashboard?.critical_turn_ids) {
        trimmedScore.critical_turn_ids = scoreResult.model_a_result.dashboard.critical_turn_ids;
      }
    }
    
    // 瘦身策略文本 - 强制截断
    let trimmedStrategy = strategyText;
    if (strategyText && strategyText.length > 300) {
      trimmedStrategy = strategyText.substring(0, 300) + '...（已截断以加速回归评测）';
    }
    
    return {
      normalizedResult: trimmedNormalized,
      scoreResult: trimmedScore,
      strategyText: trimmedStrategy
    };
  };

  // 执行回归评测 - 修改核心逻辑
  const handleReEvaluation = async () => {
    if (!rcaResult || !normalizedData || !modelConfig) {
      setRegressionError({ message: '缺少必要的数据进行回归评测' });
      return;
    }

    // 重置状态
    setIsReEvaluating(true);
    setRegressionError(null);
    setComparisonResult(null);
    setRegressionLogs([]);
    setRegressionProgress('');

    try {
      // 创建AbortController用于取消保护
      abortControllerRef.current = new AbortController();
      
      // 添加日志
      const addLog = (status, message) => {
        if (!isMountedRef.current) return;
        setRegressionLogs(prev => [...prev, {
          timestamp: new Date().toISOString(),
          status,
          message
        }]);
      };

      addLog('started', '开始回归评测');

      // 构建优化后的提示词
      const strategyText = Object.values(strategyTexts).join('\n\n');
      
      // 与回归评测对齐（避免"空策略还能回归"）
      let optimizedPrompt;
      if (strategyText && strategyText.trim() !== '' && !strategyText.includes('策略生成失败')) {
        optimizedPrompt = `${normalizedData.dialogue_summary?.system_prompt || ''}\n\n优化策略:\n${strategyText}`;
        addLog('strategy_ready', '使用策略文本进行回归评测');
      } else {
        // 如果 strategyText 为空，则退回使用 RCA fix 文本
        const fallbackText = rcaResult.items.map(item => 
          `修复建议: ${item.fix?.[0]?.action || '无具体建议'}`
        ).join('\n');
        optimizedPrompt = `${normalizedData.dialogue_summary?.system_prompt || ''}\n\n优化建议:\n${fallbackText}`;
        
        addLog('strategy_fallback', '策略文本为空，使用简化建议进行回归评测');
      }

      // 创建优化后的标准化数据 - 输入瘦身
      const trimmedInput = trimRegressionInput(normalizedData, scoreResult, optimizedPrompt);
      const optimizedData = {
        ...trimmedInput.normalizedResult,
        dialogue_summary: {
          ...trimmedInput.normalizedResult.dialogue_summary,
          system_prompt: trimmedInput.strategyText
        }
      };

      addLog('calling_model', '调用模型进行回归评测');

      // 重新调用评测 - 使用增强版API，90秒超时
      // 修改：AB模式下回归评测只针对单侧模型执行，不触发AB对比
      const targetModelConfig = regressionTarget === 'B' ? 
        { 
          ...modelConfig, 
          endpointId: modelConfig.modelB?.endpointId || modelConfig.endpointId,
          temperature: modelConfig.modelB?.temperature || modelConfig.temperature
        } : 
        modelConfig;

      let rawResponse;
      let fallbackMode = false;
      
      try {
        // 检查是否已取消
        if (abortControllerRef.current.signal.aborted) {
          throw new Error('评测已取消');
        }
        
        // 第一次尝试 - 使用90秒超时
        rawResponse = await evaluateWithLLMEnhanced(
          optimizedData, 
          { enabled: false }, // 修改：回归评测不启用AB测试
          targetModelConfig,
          { enabled: false }, // 回归评测不使用稳定性模式
          90000 // 90秒超时
        );
        
        addLog('parsing', '解析评测结果');
      } catch (error) {
        // 检查是否已取消
        if (abortControllerRef.current.signal.aborted) {
          throw new Error('评测已取消');
        }
        
        // 检查是否为可重试错误
        const retryableErrors = ['CLIENT_TIMEOUT', 'SERVER_408', 'NETWORK_ERROR'];
        if (retryableErrors.includes(error.code)) {
          addLog('retry', `首次评测失败 (${error.code})，尝试快速回归模式`);
          
          // 启用快速回归模式
          fallbackMode = true;
          const fastTrimmedInput = trimRegressionInput(normalizedData, scoreResult, optimizedPrompt, 6, 120);
          const fastOptimizedData = {
            ...fastTrimmedInput.normalizedResult,
            dialogue_summary: {
              ...fastTrimmedInput.normalizedResult.dialogue_summary,
              system_prompt: fastTrimmedInput.strategyText ? fastTrimmedInput.strategyText.substring(0, 180) : ''
            }
          };
          
          addLog('fallback_fast_mode', '已启用快速回归模式：turns限制6轮，temperature=0.1，策略文本180字');
          
          try {
            // 快速回归模式 - 使用更严格的瘦身和更低温度
            rawResponse = await evaluateWithLLMEnhanced(
              fastOptimizedData, 
              { enabled: false }, // 修改：回归评测不启用AB测试
              { ...targetModelConfig, temperature: 0.1 },
              { enabled: false },
              90000 // 90秒超时
            );
            
            addLog('retry_success', '快速回归模式评测成功');
          } catch (retryError) {
            addLog('retry_failed', `快速回归模式失败: ${retryError.code || 'Unknown'} - ${retryError.message}`);
            
            // 保留原始错误码，不覆盖为UNKNOWN_ERROR
            const finalError = {
              message: '回归评测重试失败',
              code: retryError.code || 'UNKNOWN_ERROR',
              status: retryError.status || 'n/a',
              responseText: (retryError.responseText || '').substring(0, 300),
              durationMs: retryError.durationMs || 'n/a',
              timeoutMs: retryError.timeoutMs || 'n/a',
              inputSizeChars: retryError.inputSizeChars || 'n/a',
              suggestion: getErrorAdvice(retryError.code || 'UNKNOWN_ERROR')
            };
            
            throw finalError;
          }
        } else {
          // 非可重试错误，直接抛出
          addLog('error', `评测失败: ${error.code || 'Unknown'} - ${error.message}`);
          
          // 保留原始错误码，不覆盖为UNKNOWN_ERROR
          const finalError = {
            message: error.message || '回归评测失败',
            code: error.code || 'UNKNOWN_ERROR',
            status: error.status || 'n/a',
            responseText: (error.responseText || '').substring(0, 300),
            durationMs: error.durationMs || 'n/a',
            timeoutMs: error.timeoutMs || 'n/a',
            inputSizeChars: error.inputSizeChars || 'n/a',
            suggestion: getErrorAdvice(error.code || 'UNKNOWN_ERROR')
          };
          
          throw finalError;
        }
      }
      
      // 修改：回归评测使用轻量JSON解析
      let formattedResult;
      try {
        // 尝试解析为轻量JSON
        const parsed = JSON.parse(rawResponse.content);
        
        // 验证轻量JSON结构
        if (typeof parsed.total_score_0_100 === 'number' && Array.isArray(parsed.key_metrics)) {
          formattedResult = {
            model_a_result: {
              total_score_0_100: parsed.total_score_0_100,
              metrics: parsed.key_metrics.map(metric => ({
                name: metric.name,
                score_0_5: metric.score_0_5,
                confidence_0_1: 0.8,
                evidence: [],
                deductions: []
              }))
            },
            summary: parsed.one_sentence_summary || '回归评测完成'
          };
        } else {
          // 如果轻量JSON结构不完整，尝试使用完整格式化
          formattedResult = formatEvaluationResult(rawResponse.content);
        }
      } catch (parseError) {
        // 如果解析失败，尝试使用完整格式化
        formattedResult = formatEvaluationResult(rawResponse.content);
      }
      
      addLog('computing_diff', '计算对比结果');

      // 计算对比结果
      const originalScore = scoreResult.model_a_result?.total_score_0_100 || 0;
      const newScore = formattedResult.model_a_result?.total_score_0_100 || 0;
      const scoreDelta = newScore - originalScore;

      // 计算维度变化
      const originalMetrics = scoreResult.model_a_result?.metrics || [];
      const newMetrics = formattedResult.model_a_result?.metrics || [];
      
      const topMetricChanges = originalMetrics.map((origMetric, index) => {
        const newMetric = newMetrics[index];
        if (!newMetric) return null;
        
        return {
          name: origMetric.name,
          original: origMetric.score_0_5,
          new: newMetric.score_0_5,
          delta: newMetric.score_0_5 - origMetric.score_0_5
        };
      }).filter(Boolean).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);

      // 检查根因是否消失
      const originalLowMetrics = originalMetrics.filter(m => m.score_0_5 <= 2);
      const newLowMetrics = newMetrics.filter(m => m.score_0_5 <= 2);
      const resolvedIssues = originalLowMetrics.filter(orig => 
        !newLowMetrics.some(newM => newM.name === orig.name)
      );

      const result = {
        delta_total_score: scoreDelta,
        resolved_root_causes: resolvedIssues.length,
        total_root_causes: originalLowMetrics.length,
        top_metric_deltas: topMetricChanges,
        used_strategy_source: strategyText && strategyText.trim() !== '' && !strategyText.includes('策略生成失败') ? 'strategy_text' : 'rca_fix_fallback',
        debug: {
          beforeScoreSummary: {
            total_score: originalScore,
            low_metrics_count: originalLowMetrics.length
          },
          afterScoreSummary: {
            total_score: newScore,
            low_metrics_count: newLowMetrics.length
          },
          fallback_mode: fallbackMode,
          input_size_chars: rawResponse.debugInfo?.inputSizeChars || 'n/a',
          duration_ms: rawResponse.debugInfo?.durationMs || 'n/a',
          timeout_ms: rawResponse.debugInfo?.timeoutMs || 'n/a'
        }
      };

      // 检查是否已取消
      if (abortControllerRef.current.signal.aborted) {
        throw new Error('评测已取消');
      }

      setComparisonResult(result);
      addLog('done', '回归评测完成');
    } catch (err) {
      console.error('回归评测错误:', err);
      
      // 检查是否已取消
      if (err.message === '评测已取消') {
        setRegressionError({ message: '评测已取消' });
      } else {
        // 确保错误码不被覆盖
        setRegressionError({
          message: err.message || '回归评测失败',
          code: err.code || 'UNKNOWN_ERROR',
          status: err.status || 'n/a',
          responseText: err.responseText || '',
          durationMs: err.durationMs || 'n/a',
          timeoutMs: err.timeoutMs || 'n/a',
          inputSizeChars: err.inputSizeChars || 'n/a',
          suggestion: err.suggestion || getErrorAdvice(err.code || 'UNKNOWN_ERROR')
        });
      }
    } finally {
      // 清理AbortController
      abortControllerRef.current = null;
      
      // 检查组件是否仍然挂载
      if (isMountedRef.current) {
        setIsReEvaluating(false);
      }
    }
  };

  // 获取错误建议
  const getErrorAdvice = (errorCode) => {
    switch (errorCode) {
      case 'CLIENT_TIMEOUT':
        return '请求超时，请重试或检查网络连接';
      case 'SERVER_408':
        return '服务端超时，请稍后重试';
      case 'NETWORK_ERROR':
        return '网络连接问题，请检查网络设置';
      case 'HTTP_401':
        return 'API Key无效或已过期，请检查Key权限';
      case 'HTTP_403':
        return '权限不足，请检查Endpoint ID是否有访问权限';
      case 'HTTP_429':
        return '请求频率超限或额度不足，请稍后重试';
      case 'HTTP_404':
        return 'Endpoint ID不存在，请检查配置是否正确';
      case 'HTTP_500':
      case 'HTTP_502':
      case 'HTTP_503':
      case 'HTTP_504':
        return '服务暂时不可用，请稍后重试';
      default:
        return '请检查网络连接和API配置';
    }
  };

  // 组件卸载时清理
  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 切换 RCA 条目的展开状态
  const toggleItem = (index) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  // 复制 RCA 结果（脱敏处理）
  const copyRCAResult = async () => {
    try {
      // 脱敏配置信息
      const sanitizedRcaResult = sanitizeConfig(rcaResult);
      await navigator.clipboard.writeText(JSON.stringify(sanitizedRcaResult, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 跳转到指定轮次
  const jumpToTurn = (turnId) => {
    if (onTurnSelect) {
      onTurnSelect(turnId);
    }
  };

  // 获取优先级颜色
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'P0': return 'bg-red-100 text-red-800';
      case 'P1': return 'bg-yellow-100 text-yellow-800';
      case 'P2': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // 获取根因分类颜色
  const getRootCauseColor = (rootCause) => {
    if (rootCause.includes('工具')) return 'bg-orange-100 text-orange-800';
    if (rootCause.includes('知识') || rootCause.includes('信息')) return 'bg-purple-100 text-purple-800';
    if (rootCause.includes('流程') || rootCause.includes('闭环')) return 'bg-green-100 text-green-800';
    if (rootCause.includes('幻觉') || rootCause.includes('承诺')) return 'bg-red-100 text-red-800';
    if (rootCause.includes('上下文') || rootCause.includes('记忆')) return 'bg-blue-100 text-blue-800';
    if (rootCause.includes('合规') || rootCause.includes('隐私')) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  // 获取稳定性评估 - 修复空值引用错误
  const getStabilityAssessment = (stats) => {
    if (!stats) return null;
    
    // 修复：使用 stats.total 而不是 stats.total_score（与第155行一致）
    const totalScoreStats = stats.total;
    
    // 添加防御性检查
    if (!totalScoreStats || typeof totalScoreStats.std !== 'number') {
      return null;
    }
    
    if (totalScoreStats.std > 3) {
      return { 
        level: '不稳定', 
        color: 'text-red-600', 
        bg: 'bg-red-50', 
        message: '差异不稳定，建议增加样本/降低temperature/固定策略' 
      };
    } else if (totalScoreStats.std > 1.5) {
      return { 
        level: '一般稳定', 
        color: 'text-yellow-600', 
        bg: 'bg-yellow-50', 
        message: '结果有一定波动，建议增加运行次数' 
      };
    } else {
      return { 
        level: '稳定', 
        color: 'text-green-600', 
        bg: 'bg-green-50', 
        message: '结果稳定可靠' 
      };
    }
  };

  // 检查稳定性是否影响置信度 - 修复空值引用
  const isStabilityLow = scoreResult.stabilityStats && 
    scoreResult.stabilityStats.total &&
    (scoreResult.stabilityStats.total.std > 3 || 
     (scoreResult.stabilityStats.total.range && scoreResult.stabilityStats.total.range[1] - scoreResult.stabilityStats.total.range[0] > 6));

  // 添加额外保护：确保 stabilityStats 和 total 字段都存在
  const stabilityAssessment = (scoreResult.stabilityStats && scoreResult.stabilityStats.total) 
    ? getStabilityAssessment(scoreResult.stabilityStats) 
    : null;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center space-x-2 mb-6">
        <Brain className="h-5 w-5 text-purple-500" />
        <h2 className="text-xl font-semibold text-gray-800">RCA归因诊断</h2>
      </div>

      {/* 前置条件检查 */}
      <div className="mb-6">
        <div className={`p-4 rounded-lg border ${
          canPerform 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start space-x-3">
            {canPerform ? (
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <h3 className={`font-medium ${
                canPerform ? 'text-green-800' : 'text-red-800'
              }`}>
                {canPerform ? '可以进行归因分析' : '无法进行归因分析'}
              </h3>
              <p className={`text-sm mt-1 ${
                canPerform ? 'text-green-700' : 'text-red-700'
              }`}>
                {rcaCheck.reason}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* RCA 分析按钮 */}
      <div className="mb-6">
        <button
          onClick={handleRCAnalysis}
          disabled={isAnalyzing || !canPerform}
          className="w-full flex items-center justify-center space-x-2 bg-purple-500 text-white py-3 px-4 rounded-md hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isAnalyzing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>归因分析中...</span>
            </>
          ) : (
            <>
              <Brain className="h-4 w-4" />
              <span>开始归因诊断</span>
            </>
          )}
        </button>
      </div>

      {/* 错误信息 */}
      {error && (
        <ErrorAlert 
          error={error} 
          debugInfo={errorDebugInfo}
          title="归因分析失败"
        />
      )}

      {/* RCA 结果展示 */}
      {rcaResult && (
        <div className="space-y-6">
          {/* 总体摘要 */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-800 mb-3">归因分析完成</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {rcaResult.items?.length || 0}
                </div>
                <div className="text-sm text-gray-600">发现问题</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {rcaResult.summary?.p0_actions || 0}
                </div>
                <div className="text-sm text-gray-600">P0关键问题</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {rcaResult.summary?.p1_actions || 0}
                </div>
                <div className="text-sm text-gray-600">P1重要问题</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {rcaResult.summary?.p2_actions || 0}
                </div>
                <div className="text-sm text-gray-600">P2优化建议</div>
              </div>
            </div>
          </div>

          {/* Top 根因 */}
          {rcaResult.summary?.top_root_causes && rcaResult.summary.top_root_causes.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-medium text-gray-800 mb-3">Top 根因</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rcaResult.summary.top_root_causes.map((cause, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                    <span className="text-sm font-medium text-gray-800">{cause.root_cause}</span>
                    <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">
                      {cause.count}次
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 快速胜利 */}
          {rcaResult.handoff?.quick_wins && rcaResult.handoff.quick_wins.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Lightbulb className="h-5 w-5 text-green-600" />
                <h3 className="text-lg font-medium text-green-800">快速胜利</h3>
              </div>
              <ul className="space-y-2">
                {rcaResult.handoff.quick_wins.map((win, index) => (
                  <li key={index} className="flex items-start space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-green-700">{win}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 根因分类库 */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setShowRootCauseLibrary(!showRootCauseLibrary)}
            >
              <div className="flex items-center space-x-2">
                <BookOpen className="h-5 w-5 text-blue-500" />
                <h3 className="text-lg font-medium text-gray-800">根因分类库 v1</h3>
              </div>
              {showRootCauseLibrary ? 
                <ChevronUp className="h-5 w-5 text-gray-400" /> : 
                <ChevronDown className="h-5 w-5 text-gray-400" />
              }
            </div>

            {showRootCauseLibrary && (
              <div className="mt-4 space-y-3">
                {getRCACategories().map((category, index) => (
                  <div key={index} className="bg-gray-50 p-3 rounded-md">
                    <div className="flex items-start space-x-2">
                      <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                        {index + 1}
                      </span>
                      <span className="text-sm text-gray-800">{category}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RCA 详情列表 */}
          {rcaResult.items && rcaResult.items.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-800">归因详情</h3>
              <div className="space-y-3">
                {rcaResult.items.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg">
                    {/* 条目头部 */}
                    <div 
                      className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleItem(index)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="font-medium text-gray-800">
                            {item.trigger_metric} ({item.trigger_score_0_5}分)
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${getRootCauseColor(item.root_cause)}`}>
                            {item.root_cause}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(item.fix?.[0]?.priority || 'P2')}`}>
                            {item.fix?.[0]?.priority || 'P2'}
                          </span>
                          {/* 稳定性提示 */}
                          {isStabilityLow && (
                            <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded flex items-center space-x-1">
                              <AlertTriangle className="h-3 w-3" />
                              <span>稳定性低</span>
                            </span>
                          )}
                        </div>
                        {expandedItems.has(index) ? 
                          <ChevronUp className="h-4 w-4 text-gray-400" /> : 
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        }
                      </div>
                    </div>

                    {/* 展开内容 */}
                    {expandedItems.has(index) && (
                      <div className="border-t px-4 py-4 space-y-4">
                        {/* 置信度 */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">置信度</label>
                          <div className="flex items-center space-x-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  item.confidence_0_1 >= 0.8 ? 'bg-green-500' : 
                                  item.confidence_0_1 >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${item.confidence_0_1 * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">
                              {(item.confidence_0_1 * 100).toFixed(0)}%
                            </span>
                          </div>
                          {/* 稳定性影响提示 */}
                          {isStabilityLow && (
                            <div className="mt-2 text-xs text-yellow-600 flex items-center space-x-1">
                              <AlertTriangle className="h-3 w-3" />
                              <span>结论可能受随机性影响，建议降低temperature或增加N</span>
                            </div>
                          )}
                        </div>

                        {/* 证据 */}
                        {item.evidence && item.evidence.length > 0 && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">证据</label>
                            <div className="space-y-2">
                              {item.evidence.map((evidence, i) => (
                                <div key={i} className="bg-gray-50 p-3 rounded-md">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="text-sm text-gray-600 mb-1">
                                        第 {evidence.turn_id} 轮
                                      </div>
                                      <div className="text-sm text-gray-800">
                                        "{evidence.quote}"
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => jumpToTurn(evidence.turn_id)}
                                      className="ml-2 flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800"
                                    >
                                      <ArrowRight className="h-3 w-3" />
                                      <span>跳转</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 诊断 */}
                        {item.diagnosis && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">诊断</label>
                            <p className="text-sm text-gray-800 bg-blue-50 p-3 rounded-md">
                              {item.diagnosis}
                            </p>
                          </div>
                        )}

                        {/* 修复建议 */}
                        {item.fix && item.fix.length > 0 && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">修复建议</label>
                            <div className="space-y-2">
                              {item.fix.map((fix, i) => (
                                <div key={i} className="bg-green-50 border border-green-200 p-3 rounded-md">
                                  <div className="flex items-start space-x-2">
                                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1">
                                      <div className="text-sm font-medium text-green-800">
                                        {fix.action}
                                      </div>
                                      <div className="text-xs text-green-700 mt-1">
                                        预期收益: {fix.expected_gain}
                                      </div>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(fix.priority)}`}>
                                      {fix.priority}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 优化策略生成 */}
                        <div className="border-t pt-4">
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700">优化策略文本</label>
                            <button
                              onClick={() => generateStrategyText(item, index)}
                              disabled={isGeneratingStrategy[index] || !item.fix || item.fix.length === 0}
                              className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400 text-blue-700 rounded-md transition-colors"
                            >
                              {isGeneratingStrategy[index] ? (
                                <>
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-700"></div>
                                  <span>生成中...</span>
                                </>
                              ) : (
                                <>
                                  <Lightbulb className="h-3 w-3" />
                                  <span>生成可落地策略</span>
                                </>
                              )}
                            </button>
                          </div>
                          
                          {strategyTexts[index] && (
                            <div className="bg-gray-50 p-3 rounded-md">
                              {/* UI 改进：显示当前用于生成的 root_cause / trigger_metric */}
                              <div className="mb-2 text-xs text-gray-600">
                                基于: {item.trigger_metric} - {item.root_cause}
                              </div>
                              <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                                {strategyTexts[index]}
                              </pre>
                              {/* UI 改进：一键复制策略文本按钮 */}
                              <button
                                onClick={() => navigator.clipboard.writeText(strategyTexts[index])}
                                className="mt-2 flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800"
                              >
                                <Copy className="h-3 w-3" />
                                <span>复制策略文本</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* 稳定性提示 */}
                        {item.stability_note && (
                          <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-md">
                            <div className="flex items-start space-x-2">
                              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-yellow-800">{item.stability_note}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 回归评测 */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium text-gray-800">回归对比</h3>
              <div className="flex items-center space-x-2">
                {/* 新增：回归目标选择器 */}
                <div className="flex items-center space-x-1">
                  <span className="text-sm text-gray-600">回归目标:</span>
                  <select
                    value={regressionTarget}
                    onChange={(e) => setRegressionTarget(e.target.value)}
                    className="text-sm border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="A">Model A</option>
                    <option value="B">Model B</option>
                  </select>
                </div>
                <button
                  onClick={handleReEvaluation}
                  disabled={isReEvaluating || Object.keys(strategyTexts).length === 0}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {isReEvaluating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>回归评测中...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      <span>应用建议并回归评测</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            
            {/* UI 改进："使用该策略回归评测"按钮旁边提示当前是否有策略文本 */}
            <div className="mb-3 text-sm text-gray-600">
              {Object.values(strategyTexts).some(text => text && text.trim() !== '' && !text.includes('策略生成失败')) ? (
                <span className="text-green-600">✓ 已生成策略文本，将使用策略文本进行回归评测</span>
              ) : (
                <span className="text-yellow-600">⚠ 未生成有效策略文本，将使用简化建议进行回归评测</span>
              )}
            </div>
            
            {/* 回归评测日志 */}
            {regressionLogs.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center space-x-2 mb-2">
                  <MessageCircle className="h-4 w-4 text-blue-500" />
                  <h4 className="text-sm font-medium text-gray-700">回归评测日志</h4>
                </div>
                <div className="bg-gray-50 p-3 rounded-md max-h-32 overflow-y-auto">
                  {regressionLogs.map((log, index) => (
                    <div key={index} className="text-xs text-gray-600 mb-1">
                      <span className="text-gray-500">
                        {new Date(log.timestamp).toLocaleTimeString()} - 
                      </span>
                      <span className={`ml-1 ${
                        log.status === 'done' ? 'text-green-600' : 
                        log.status === 'retry_failed' ? 'text-red-600' : 
                        log.status === 'fallback_fast_mode' ? 'text-purple-600' : 'text-blue-600'
                      }`}>
                        {log.status}:
                      </span>
                      <span className="ml-1">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 回归评测进度 */}
            {regressionProgress && (
              <div className="mb-4">
                <div className="text-sm text-gray-600">{regressionProgress}</div>
              </div>
            )}
            
            {/* 回归评测错误 */}
            {regressionError && (
              <div className="mb-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-red-800">
                        回归评测失败
                      </div>
                      <div className="text-sm text-red-700 mt-1">
                        {regressionError.message}
                      </div>
                      {regressionError.code && (
                        <div className="text-xs text-red-600 mt-1">
                          错误代码: {regressionError.code}
                        </div>
                      )}
                      {regressionError.status && regressionError.status !== 'n/a' && (
                        <div className="text-xs text-red-600 mt-1">
                          状态: {regressionError.status}
                        </div>
                      )}
                      {regressionError.durationMs && regressionError.durationMs !== 'n/a' && (
                        <div className="text-xs text-red-600 mt-1">
                          耗时: {regressionError.durationMs}ms
                        </div>
                      )}
                      {regressionError.timeoutMs && regressionError.timeoutMs !== 'n/a' && (
                        <div className="text-xs text-red-600 mt-1">
                          超时: {regressionError.timeoutMs}ms
                        </div>
                      )}
                      {regressionError.inputSizeChars && regressionError.inputSizeChars !== 'n/a' && (
                        <div className="text-xs text-red-600 mt-1">
                          输入大小: {regressionError.inputSizeChars}字符
                        </div>
                      )}
                      {regressionError.suggestion && (
                        <div className="text-xs text-red-600 mt-1">
                          建议: {regressionError.suggestion}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {comparisonResult && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {comparisonResult.delta_total_score > 0 ? '+' : ''}{comparisonResult.delta_total_score.toFixed(1)}
                    </div>
                    <div className="text-sm text-gray-600">总分变化</div>
                  </div>
                  
                  <div className="bg-green-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {comparisonResult.resolved_root_causes}
                    </div>
                    <div className="text-sm text-gray-600">已解决根因</div>
                  </div>
                  
                  <div className="bg-purple-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {comparisonResult.total_root_causes}
                    </div>
                    <div className="text-sm text-gray-600">总根因数</div>
                  </div>
                </div>
                
                {/* 显示使用的是"策略文本"还是"简化建议" */}
                <div className="text-sm text-gray-600">
                  回归评测使用: {comparisonResult.used_strategy_source === 'strategy_text' ? '策略文本' : '简化建议'}
                </div>
                
                {/* 显示是否启用了快速回归模式 */}
                {comparisonResult.debug?.fallback_mode && (
                  <div className="text-sm text-purple-600">
                    已启用快速回归模式
                  </div>
                )}
                
                {/* 显示调试信息 */}
                {comparisonResult.debug && (
                  <div className="text-xs text-gray-500">
                    输入大小: {comparisonResult.debug.input_size_chars}字符 | 
                    耗时: {comparisonResult.debug.duration_ms}ms | 
                    超时: {comparisonResult.debug.timeout_ms}ms
                  </div>
                )}
                
                {comparisonResult.top_metric_deltas && comparisonResult.top_metric_deltas.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">Top3维度变化</h4>
                    <div className="space-y-2">
                      {comparisonResult.top_metric_deltas.map((change, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                          <span className="text-sm font-medium text-gray-800">{change.name}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-600">
                              {change.original.toFixed(1)} → {change.new.toFixed(1)}
                            </span>
                            <span className={`text-sm font-medium ${
                              change.delta > 0 ? 'text-green-600' : change.delta < 0 ? 'text-red-600' : 'text-gray-600'
                            }`}>
                              {change.delta > 0 ? '+' : ''}{change.delta.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* 调试信息 */}
                {comparisonResult.debug && (
                  <div className="mt-4">
                    <h4 className="font-medium text-gray-800 mb-2">调试信息</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-gray-50 p-3 rounded-md">
                        <div className="text-sm font-medium text-gray-700 mb-1">优化前</div>
                        <div className="text-xs text-gray-600">
                          总分: {comparisonResult.debug.beforeScoreSummary.total_score.toFixed(1)}<br/>
                          低分维度: {comparisonResult.debug.beforeScoreSummary.low_metrics_count}
                        </div>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-md">
                        <div className="text-sm font-medium text-gray-700 mb-1">优化后</div>
                        <div className="text-xs text-gray-600">
                          总分: {comparisonResult.debug.afterScoreSummary.total_score.toFixed(1)}<br/>
                          低分维度: {comparisonResult.debug.afterScoreSummary.low_metrics_count}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 原始数据 */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium text-gray-800">原始归因数据</h3>
              <button
                onClick={copyRCAResult}
                className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md transition-colors"
              >
                {copied ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>复制JSON</span>
                  </>
                )}
              </button>
            </div>
            <pre className="bg-gray-50 p-4 rounded-lg text-xs overflow-auto max-h-96 border">
              {JSON.stringify(rcaResult, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default RCAAnalysis;
