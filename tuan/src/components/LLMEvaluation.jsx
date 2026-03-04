import ErrorAlert from './ErrorAlert';
import ABTestConfig from './ABTestConfig';
import { calculateStabilityStats } from '../utils/stability';
import { Brain, Play, BarChart3, RotateCw, Copy, Loader2, ChevronDown, CheckCircle, ChevronUp, AlertCircle, Info } from 'lucide-react';
import { formatEvaluationResult } from '../utils/formatters';
import StabilityConfig from './StabilityConfig';
import React, { useEffect, useState } from 'react';
import { sanitizeConfig, sanitizeDebugInfo } from '../utils/sanitize';
import { validateConfig, getConfigSummary } from '../utils/configValidator';
import { getErrorAdvice, evaluateWithLLMEnhanced, checkHealth, evaluateWithLLM } from '../utils/api';
import { executeABTest } from '../utils/abTestExecutor';

const LLMEvaluation = ({ normalizedData, onScoreResult }) => {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [stabilityStats, setStabilityStats] = useState(null);
  const [error, setError] = useState('');
  const [errorDebugInfo, setErrorDebugInfo] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);
  const [healthError, setHealthError] = useState('');
  const [healthDebugInfo, setHealthDebugInfo] = useState(null);
  const [abTestConfig, setAbTestConfig] = useState({
    mode: 'single',
    modelA: {
      provider: 'volc_ark',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      endpointId: '',
      apiKey: '',
      temperature: 0.2
    },
    modelB: {
      provider: 'volc_ark',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      endpointId: '',
      apiKey: '',
      temperature: 0.2
    }
  });
  const [stabilityConfig, setStabilityConfig] = useState({
    enabled: true,
    runs: 3,
    temperature: 0.2
  });
  const [evaluationHistory, setEvaluationHistory] = useState([]);
  const [configValidation, setConfigValidation] = useState({ ok: false, missing: [], reasons: [] });
  const [runRecords, setRunRecords] = useState([]);
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [retryStatus, setRetryStatus] = useState(null);

  // 实时校验配置
  useEffect(() => {
    const validation = validateConfig(abTestConfig, normalizedData);
    setConfigValidation(validation);
  }, [abTestConfig, normalizedData]);

  // 检查API健康状态
  const handleHealthCheck = async () => {
    if (!configValidation.ok) {
      setHealthError('请先完成配置再检查健康状态');
      setHealthDebugInfo(null);
      return;
    }

    try {
      setHealthError('');
      setHealthDebugInfo(null);
      
      // 使用Model A配置进行健康检查
      const status = await checkHealth(abTestConfig.modelA);
      setHealthStatus(status);
    } catch (err) {
      setHealthError(err.message);
      setHealthDebugInfo(err.debugInfo || null);
    }
  };

  // 执行评测
  const handleEvaluate = async () => {
    if (!configValidation.ok) {
      setError(`配置不完整: ${configValidation.reasons.join(', ')}`);
      setErrorDebugInfo({ missing: configValidation.missing });
      return;
    }

    setIsEvaluating(true);
    setError('');
    setErrorDebugInfo(null);
    setEvaluationResult(null);
    setStabilityStats(null);
    setRunRecords([]);
    setRetryStatus(null);

    try {
      const records = [];
      const runs = stabilityConfig.enabled ? stabilityConfig.runs : 1;

      // 多次运行获取稳定性数据
      for (let i = 0; i < runs; i++) {
        const modelConfig = {
          ...abTestConfig.modelA,
          temperature: stabilityConfig.enabled ? stabilityConfig.temperature : abTestConfig.modelA.temperature
        };

        const abTest = abTestConfig.mode === 'ab' ? {
          enabled: true,
          model_a: {
            provider: abTestConfig.modelA.provider,
            model: abTestConfig.modelA.endpointId,
            temperature: stabilityConfig.enabled ? stabilityConfig.temperature : abTestConfig.modelA.temperature
          },
          model_b: {
            provider: abTestConfig.modelB.provider,
            model: abTestConfig.modelB.endpointId,
            temperature: stabilityConfig.enabled ? stabilityConfig.temperature : abTestConfig.modelB.temperature
          }
        } : { enabled: false };

        try {
          let rawResponse;
          let formattedResult;
          
          // 如果是A/B测试模式，使用专门的AB测试执行器
          if (abTestConfig.mode === 'ab') {
            const abTestResultData = await executeABTest({
              normalizedResult: normalizedData,
              abTestConfig,
              modelAConfig: {
                ...abTestConfig.modelA,
                temperature: stabilityConfig.enabled ? stabilityConfig.temperature : abTestConfig.modelA.temperature
              },
              modelBConfig: {
                ...abTestConfig.modelB,
                temperature: stabilityConfig.enabled ? stabilityConfig.temperature : abTestConfig.modelB.temperature
              },
              stabilityConfig
            });
            
            if (abTestResultData.success) {
              formattedResult = formatEvaluationResult(abTestResultData.result);
              
              // 将AB测试的运行记录添加到总记录中
              abTestResultData.runRecords.forEach((record) => {
                records.push({
                  runIndex: i + 1,
                  runSide: record.runSide,
                  ok: record.ok,
                  parsed: record.parsed,
                  rawText: record.rawText,
                  parsedObject: record.parsedObject,
                  formattedResult: record.formattedResult,
                  debugInfo: record.debugInfo,
                  error: record.error
                });
              });
            } else {
              // AB测试失败
              throw new Error(abTestResultData.error);
            }
          } else {
            // 单模型模式，使用原有的评测函数
            rawResponse = await evaluateWithLLMEnhanced(
              normalizedData, 
              abTest, 
              modelConfig,
              stabilityConfig
            );
            
            // 格式化结果
            formattedResult = formatEvaluationResult(rawResponse.content);
            
            // 创建运行记录 - 结构化存储
            const record = {
              runIndex: i + 1,
              ok: true,
              parsed: !formattedResult.format_error,
              rawText: rawResponse.content.substring(0, 1500),
              parsedObject: formattedResult,
              formattedResult: formattedResult,
              debugInfo: rawResponse.debugInfo || {},
              error: formattedResult.format_error ? { message: formattedResult.format_error } : null
            };
            
            records.push(record);
          }
          
          // 如果是A/B测试且成功，使用最后一次运行的结果
          if (abTestConfig.mode === 'ab' && abTestResultData && abTestResultData.success) {
            // 使用AB测试的结果
            formattedResult = formatEvaluationResult(abTestResultData.result);
          } else if (abTestConfig.mode !== 'ab') {
            // 单模型模式，使用最后一次运行的结果
            const lastRecord = records[records.length - 1];
            if (lastRecord && lastRecord.parsed && !lastRecord.error) {
              formattedResult = lastRecord.formattedResult;
            }
          }
        } catch (err) {
          // 记录失败的运行 - 结构化存储
          const record = {
            runIndex: i + 1,
            ok: false,
            parsed: false,
            rawText: '',
            parsedObject: null,
            formattedResult: null,
            debugInfo: err.debugInfo || {},
            error: {
              message: err.message,
              status: err.debugInfo?.status,
              responseText: err.debugInfo?.responseText,
              attempt: err.debugInfo?.attempt,
              durationMs: err.debugInfo?.durationMs,
              timeoutMs: err.debugInfo?.timeoutMs,
              inputSizeChars: err.debugInfo?.inputSizeChars,
              code: err.debugInfo?.code || 'UNKNOWN_ERROR',
              attemptRecords: err.debugInfo?.attemptRecords || []
            }
          };
          
          records.push(record);
        }
      }

      // 保存运行记录
      setRunRecords(records);

      // 计算稳定性统计
      let stats = null;
      if (stabilityConfig.enabled) {
        try {
          stats = calculateStabilityStats(records);
          setStabilityStats(stats);
        } catch (statsError) {
          setError(statsError.message);
        }
      }

      // 使用最后一次成功运行的结果作为主要结果
      const lastSuccessfulRecord = records.filter(r => r.ok && r.parsed).pop();
      if (lastSuccessfulRecord) {
        setEvaluationResult(lastSuccessfulRecord.formattedResult);
        
        // 添加到历史记录
        const historyEntry = {
          id: Date.now(),
          timestamp: new Date().toISOString(),
          scenario: lastSuccessfulRecord.formattedResult.model_a_result?.scenario || '未知场景',
          total_score: lastSuccessfulRecord.formattedResult.model_a_result?.total_score_0_100 || 0,
          ab_config: {
            mode: abTestConfig.mode,
            modelA: {
              provider: abTestConfig.modelA.provider,
              endpointId: abTestConfig.modelA.endpointId,
              temperature: stabilityConfig.enabled ? stabilityConfig.temperature : abTestConfig.modelA.temperature
            },
            modelB: abTestConfig.mode === 'ab' ? {
              provider: abTestConfig.modelB.provider,
              endpointId: abTestConfig.modelB.endpointId,
              temperature: stabilityConfig.enabled ? stabilityConfig.temperature : abTestConfig.modelB.temperature
            } : null
          },
          stability_stats: stats,
          result: lastSuccessfulRecord.formattedResult
        };

        setEvaluationHistory(prev => [historyEntry, ...prev.slice(0, 9)]);

        // 如果有回调函数，调用它传递结果
        if (onScoreResult) {
          // 传递模型配置，用于RCA分析
          const configForRCA = {
            baseUrl: abTestConfig.modelA.baseUrl,
            endpointId: abTestConfig.modelA.endpointId,
            apiKey: abTestConfig.modelA.apiKey,
            temperature: stabilityConfig.enabled ? stabilityConfig.temperature : abTestConfig.modelA.temperature
          };
          
          onScoreResult(lastSuccessfulRecord.formattedResult, stats, configForRCA);
        }
      } else {
        setError('所有运行均失败，请查看调试信息');
      }
    } catch (err) {
      setError(err.message);
      setErrorDebugInfo({
        ...err.debugInfo,
        abTestConfig: abTestConfig,
        stabilityConfig: stabilityConfig
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  // 获取评分等级
  const getScoreLevel = (score) => {
    if (score >= 80) return { level: '优秀', color: 'text-green-600', bg: 'bg-green-50' };
    if (score >= 60) return { level: '良好', color: 'text-blue-600', bg: 'bg-blue-50' };
    if (score >= 40) return { level: '一般', color: 'text-yellow-600', bg: 'bg-yellow-50' };
    return { level: '需改进', color: 'text-red-600', bg: 'bg-red-50' };
  };

  // 格式化错误信息
  const formatError = (errorObj) => {
    if (!errorObj) return '';
    
    const parts = [];
    
    if (errorObj.provider && errorObj.endpointId) {
      parts.push(`请求目标: ${errorObj.provider}/${errorObj.endpointId}`);
    }
    
    if (errorObj.status) {
      parts.push(`HTTP状态: ${errorObj.status}`);
    }
    
    if (errorObj.responseText) {
      parts.push(`响应内容: ${errorObj.responseText.substring(0, 300)}`);
    }
    
    const advice = getErrorAdvice(errorObj);
    if (advice) {
      parts.push(`建议: ${advice}`);
    }
    
    return parts.join('\n');
  };

  // 复制调试信息（脱敏处理）
  const copyDebugInfo = async () => {
    try {
      // 脱敏配置信息
      const sanitizedAbTestConfig = sanitizeConfig(abTestConfig);
      const sanitizedStabilityConfig = sanitizeConfig(stabilityConfig);
      
      const debugInfo = {
        timestamp: new Date().toISOString(),
        runRecords: runRecords.map(record => ({
          runIndex: record.runIndex,
          runSide: record.runSide,
          ok: record.ok,
          parsed: record.parsed,
          error: record.error,
          rawText: record.rawText
        })),
        stabilityStats,
        error,
        config: {
          abTestConfig: sanitizedAbTestConfig,
          stabilityConfig: sanitizedStabilityConfig
        }
      };
      
      await navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
      // 这里可以添加一个提示，告知用户已复制
    } catch (err) {
      console.error('复制调试信息失败:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* A/B测试配置 */}
      <ABTestConfig onConfigChange={setAbTestConfig} />

      {/* 稳定性评估配置 */}
      <StabilityConfig onConfigChange={setStabilityConfig} />

      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center space-x-2 mb-6">
          <Brain className="h-5 w-5 text-purple-500" />
          <h2 className="text-xl font-semibold text-gray-800">LLM智能评测</h2>
        </div>

        {/* 配置状态提示区 */}
        <div className="mb-6">
          <div className={`p-4 rounded-lg border ${
            configValidation.ok 
              ? 'bg-green-50 border-green-200' 
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-start space-x-3">
              {configValidation.ok ? (
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h3 className={`font-medium ${
                  configValidation.ok ? 'text-green-800' : 'text-red-800'
                }`}>
                  {configValidation.ok ? '配置完整，可开始评测' : '配置不完整，无法开始评测'}
                </h3>
                
                {!configValidation.ok && (
                  <div className="mt-2 space-y-2">
                    {configValidation.reasons.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-red-700">前置条件:</div>
                        <ul className="text-sm text-red-600 mt-1">
                          {configValidation.reasons.map((reason, index) => (
                            <li key={index}>• {reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {configValidation.missing.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-red-700">缺失字段:</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {configValidation.missing.map((field, index) => (
                            <span key={index} className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">
                              {field}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {configValidation.ok && (
                  <div className="mt-2 text-sm text-green-700">
                    配置摘要: {getConfigSummary(abTestConfig)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* API状态检查 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-gray-700">模型服务状态检查</h3>
            <button
              onClick={handleHealthCheck}
              disabled={!configValidation.ok}
              className="flex items-center space-x-2 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 rounded-md transition-colors"
            >
              <BarChart3 className="h-4 w-4" />
              <span>检查状态</span>
            </button>
          </div>
          
          {healthError && (
            <ErrorAlert 
              error={healthError} 
              debugInfo={healthDebugInfo}
              title="健康检查失败"
            />
          )}
          
          {healthStatus && (
            <div className="flex items-center space-x-2 text-green-600 bg-green-50 p-3 rounded-md">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">
                模型服务正常 - {healthStatus.timestamp ? new Date(healthStatus.timestamp).toLocaleString() : new Date().toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* 评测按钮 */}
        <div className="mb-6">
          <button
            onClick={handleEvaluate}
            disabled={isEvaluating || !configValidation.ok}
            className="w-full flex items-center justify-center space-x-2 bg-purple-500 text-white py-3 px-4 rounded-md hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isEvaluating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>评测中... ({stabilityConfig.enabled ? `${stabilityConfig.runs}次运行` : '单次运行'})</span>
                {retryStatus && (
                  <span className="ml-2 text-sm bg-purple-400 px-2 py-1 rounded">
                    {retryStatus}
                  </span>
                )}
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                <span>开始智能评测</span>
              </>
            )}
          </button>
        </div>

        {/* 错误信息 */}
        {error && (
          <ErrorAlert 
            error={error} 
            debugInfo={errorDebugInfo}
            title="评测失败"
          />
        )}

        {/* 评测结果预览 */}
        {evaluationResult && (
          <div className="space-y-6">
            {/* 总体评分 */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-lg">
              <h3 className="text-lg font-medium text-gray-800 mb-3">评测完成</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">
                    {evaluationResult.model_a_result?.total_score_0_100?.toFixed(1) || '0.0'}
                  </div>
                  <div className="text-sm text-gray-600">总分 (100分制)</div>
                </div>
                
                <div className="text-center">
                  <div className={`text-2xl font-semibold ${getScoreLevel(evaluationResult.model_a_result?.total_score_0_100 || 0).color}`}>
                    {getScoreLevel(evaluationResult.model_a_result?.total_score_0_100 || 0).level}
                  </div>
                  <div className="text-sm text-gray-600">评级</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-semibold text-blue-600">
                    {evaluationResult.model_a_result?.scenario || '未知场景'}
                  </div>
                  <div className="text-sm text-gray-600">场景分类</div>
                </div>
              </div>

              {/* 稳定性信息 */}
              {stabilityStats && (
                <div className="mt-4 p-3 bg-white rounded-md">
                  <div className="flex items-center space-x-2 mb-2">
                    <RotateCw className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium text-gray-700">
                      稳定性统计 (有效样本: {stabilityStats.n_valid}/{stabilityStats.n})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">总分稳定性:</span>
                      <span className="ml-2 font-medium">
                        {stabilityStats.total.mean} ± {stabilityStats.total.std} / Range {stabilityStats.total.range[0]}~{stabilityStats.total.range[1]}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">波动评估:</span>
                      <span className={`ml-2 font-medium ${stabilityStats.total.std > 3 ? 'text-red-600' : 'text-green-600'}`}>
                        {stabilityStats.total.std > 3 ? '波动较大' : '稳定'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">跳过原因:</span>
                      <span className="ml-2 font-medium">
                        解析失败{stabilityStats.skip_reasons?.parse_failed || 0}次, 
                        缺总分{stabilityStats.skip_reasons?.missing_total_score || 0}次, 
                        缺metrics{stabilityStats.skip_reasons?.missing_metrics || 0}次
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 快速操作 */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-700 mb-3">快速操作</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onScoreResult && onScoreResult(evaluationResult, stabilityStats)}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>查看详细评分</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 稳定性评估调试信息 */}
        {runRecords.length > 0 && (
          <div className="mt-6">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setDebugExpanded(!debugExpanded)}
            >
              <div className="flex items-center space-x-2">
                <Info className="h-5 w-5 text-blue-500" />
                <h3 className="text-lg font-medium text-gray-800">稳定性评估调试</h3>
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                  {runRecords.filter(r => r.ok && r.parsed).length}/{runRecords.length} 次成功
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyDebugInfo();
                  }}
                  className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md transition-colors"
                >
                  <Copy className="h-4 w-4" />
                  <span>复制调试信息</span>
                </button>
                {debugExpanded ? 
                  <ChevronUp className="h-5 w-5 text-gray-400" /> : 
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                }
              </div>
            </div>

            {debugExpanded && (
              <div className="mt-4 space-y-4">
                {runRecords.map((record) => (
                  <div key={`${record.runIndex}-${record.runSide || 'single'}`} className={`border rounded-lg p-4 ${record.ok && record.parsed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        {record.ok && record.parsed ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-red-500" />
                        )}
                        <span className="font-medium">
                          第 {record.runIndex} 次运行 {record.runSide ? `(Side ${record.runSide})` : ''} - {record.ok && record.parsed ? '成功' : '失败'}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        record.ok && record.parsed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {record.parsed ? '已解析' : '解析失败'}
                      </span>
                    </div>
                    
                    {/* 显示调试信息 */}
                    {record.debugInfo && (
                      <div className="mb-2 text-xs text-gray-600">
                        <div>尝试次数: {record.debugInfo.attempt || 'N/A'}</div>
                        <div>耗时: {record.debugInfo.durationMs || 'N/A'}ms</div>
                        <div>超时阈值: {record.debugInfo.timeoutMs || 'N/A'}ms</div>
                        <div>输入大小: {record.debugInfo.inputSizeChars || 'N/A'}字符</div>
                        {record.debugInfo.attemptRecords && record.debugInfo.attemptRecords.length > 0 && (
                          <div className="mt-1">
                            <div className="font-medium">重试记录:</div>
                            {record.debugInfo.attemptRecords.map((attempt, idx) => (
                              <div key={idx} className="ml-2">
                                尝试 {attempt.attempt}: {attempt.errorCode} - {attempt.durationMs}ms
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {record.error && (
                      <div className="mb-2">
                        <div className="text-sm font-medium text-red-700">错误信息:</div>
                        <div className="text-sm text-red-600">
                          {record.error.code ? `[${record.error.code}] ` : ''}{record.error.message}
                        </div>
                        {record.error.durationMs && (
                          <div className="text-xs text-gray-500 mt-1">
                            耗时: {record.error.durationMs}ms, 超时: {record.error.timeoutMs}ms, 输入: {record.error.inputSizeChars}字符
                          </div>
                        )}
                        {record.error.attemptRecords && record.error.attemptRecords.length > 0 && (
                          <div className="mt-1 text-xs text-gray-500">
                            <div className="font-medium">重试记录:</div>
                            {record.error.attemptRecords.map((attempt, idx) => (
                              <div key={idx} className="ml-2">
                                尝试 {attempt.attempt}: {attempt.errorCode} - {attempt.durationMs}ms
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {record.rawText && (
                      <div>
                        <div className="text-sm font-medium text-gray-700 mb-1">原始输出:</div>
                        <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                          {record.rawText}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 评测历史 */}
        {evaluationHistory.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-medium text-gray-800 mb-3">评测历史</h3>
            <div className="space-y-2">
              {evaluationHistory.slice(0, 5).map((entry) => (
                <div key={entry.id} className="bg-gray-50 p-3 rounded-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-medium text-gray-800">
                        {entry.scenario} - {entry.total_score.toFixed(1)}分
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setEvaluationResult(entry.result);
                        setStabilityStats(entry.stability_stats);
                        if (onScoreResult) {
                          onScoreResult(entry.result, entry.stability_stats);
                        }
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      恢复展示
                    </button>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {entry.ab_config.mode === 'ab' ? 'A/B测试' : '单模型'} - 
                    {entry.ab_config.modelA.provider}/{entry.ab_config.modelA.endpointId}
                    {entry.ab_config.modelB && ` vs ${entry.ab_config.modelB.provider}/${entry.ab_config.modelB.endpointId}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LLMEvaluation;
