import React, { useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, Copy, CheckCircle, AlertTriangle, Target, TrendingUp, RotateCcw, ArrowRight } from 'lucide-react';
import { sanitizeConfig } from '../utils/sanitize';

const ScoreResults = ({ result, stabilityStats = null }) => {
  const [expandedSections, setExpandedSections] = useState({
    rawJson: false,
    abDifferences: false,
    stabilityDetails: false
  });
  const [copied, setCopied] = useState(false);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const copyToClipboard = async () => {
    try {
      // 脱敏配置信息
      const sanitizedResult = sanitizeConfig(result);
      const sanitizedStabilityStats = sanitizeConfig(stabilityStats);
      
      const dataToCopy = {
        result: sanitizedResult,
        stabilityStats: sanitizedStabilityStats,
        exportedAt: new Date().toISOString()
      };
      await navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 获取评分等级
  const getScoreLevel = (score) => {
    if (score >= 80) return { level: '优秀', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' };
    if (score >= 60) return { level: '良好', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
    if (score >= 40) return { level: '一般', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' };
    return { level: '需改进', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' };
  };

  // 获取维度颜色
  const getMetricColor = (score) => {
    if (score >= 4) return 'text-green-600';
    if (score >= 3) return 'text-blue-600';
    if (score >= 2) return 'text-yellow-600';
    return 'text-red-600';
  };

  // 处理格式化错误的情况
  if (result.format_error) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center space-x-2 mb-6">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <h2 className="text-xl font-semibold text-gray-800">评测结果格式化失败</h2>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-red-800 mb-2">格式化错误</h3>
              <p className="text-sm text-red-700 mb-3">{result.format_error}</p>
              
              {result.raw_preview && (
                <div>
                  <h4 className="text-sm font-medium text-red-800 mb-1">原始输出预览:</h4>
                  <pre className="text-xs bg-red-100 p-2 rounded overflow-auto max-h-32">
                    {result.raw_preview}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalScore = result.model_a_result?.total_score_0_100 || 0;
  const scoreLevel = getScoreLevel(totalScore);
  const metrics = result.model_a_result?.metrics || [];
  const hasABTest = result.ab_test?.enabled || false;
  const abDifferences = result.ab_test?.top_differences || [];

  // 获取低分维度
  const lowMetrics = metrics.filter(metric => metric.score_0_5 < 3);

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

  // 添加额外保护：确保 stabilityStats 和 total 字段都存在
  const stabilityAssessment = (stabilityStats && stabilityStats.total) 
    ? getStabilityAssessment(stabilityStats) 
    : null;

  return (
    <div className="space-y-6">
      {/* 总分卡片 */}
      <div className={`bg-white rounded-lg shadow-lg p-6 border-l-4 ${scoreLevel.border}`}>
        <div className="flex items-center space-x-2 mb-4">
          <Target className="h-5 w-5 text-blue-500" />
          <h2 className="text-xl font-semibold text-gray-800">总分概览</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600 mb-2">
              {totalScore.toFixed(1)}
            </div>
            <div className="text-sm text-gray-600">总分 (100分制)</div>
          </div>
          
          <div className="text-center">
            <div className={`text-2xl font-semibold ${scoreLevel.color} mb-2`}>
              {scoreLevel.level}
            </div>
            <div className="text-sm text-gray-600">评级</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-semibold text-purple-600 mb-2">
              {result.model_a_result?.scenario || '未知场景'}
            </div>
            <div className="text-sm text-gray-600">场景分类</div>
          </div>
        </div>

        {/* 总分进度条 */}
        <div className="mt-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>评分进度</span>
            <span>{totalScore.toFixed(1)}/100</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className={`h-3 rounded-full ${scoreLevel.color.replace('text-', 'bg-')}`}
              style={{ width: `${Math.min(totalScore, 100)}%` }}
            />
          </div>
        </div>

        {/* 稳定性信息 */}
        {stabilityStats && stabilityStats.total && (
          <div className="mt-6">
            <div className="flex items-center space-x-2 mb-3">
              <RotateCcw className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium text-gray-700">稳定性统计 (N={stabilityStats.n})</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded-md">
                <div className="text-sm text-gray-600 mb-1">总分稳定性</div>
                <div className="font-medium">
                  {stabilityStats.total.mean} ± {stabilityStats.total.std} / Range {stabilityStats.total.range[0]}~{stabilityStats.total.range[1]}
                </div>
              </div>
              {stabilityAssessment && (
                <div className={`p-3 rounded-md ${stabilityAssessment.bg}`}>
                  <div className="text-sm text-gray-600 mb-1">稳定性评估</div>
                  <div className={`font-medium ${stabilityAssessment.color}`}>
                    {stabilityAssessment.level}
                  </div>
                </div>
              )}
            </div>
            {stabilityAssessment && stabilityAssessment.level !== '稳定' && (
              <div className={`mt-3 p-3 rounded-md ${stabilityAssessment.bg}`}>
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-yellow-800">{stabilityAssessment.message}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* A/B测试差异摘要 */}
      {hasABTest && abDifferences.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggleSection('abDifferences')}
          >
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <h2 className="text-xl font-semibold text-gray-800">A/B测试差异</h2>
            </div>
            {expandedSections.abDifferences ? 
              <ChevronUp className="h-5 w-5 text-gray-400" /> : 
              <ChevronDown className="h-5 w-5 text-gray-400" />
            }
          </div>

          {expandedSections.abDifferences && (
            <div className="mt-4 space-y-4">
              {abDifferences.map((diff, index) => (
                <div key={index} className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-800">
                      {diff.type === 'total_score' ? '总分差异' : diff.metric}
                    </span>
                    <span className={`font-semibold ${
                      diff.delta > 0 ? 'text-green-600' : diff.delta < 0 ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {diff.delta > 0 ? '+' : ''}{diff.delta.toFixed(1)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Model A: </span>
                      <span className="font-medium">{diff.a.toFixed(1)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Model B: </span>
                      <span className="font-medium">{diff.b.toFixed(1)}</span>
                    </div>
                  </div>
                  {diff.evidence_turn_ids && diff.evidence_turn_ids.length > 0 && (
                    <div className="mt-2">
                      <span className="text-gray-600 text-sm">关联轮次: </span>
                      <span className="text-sm">
                        {diff.evidence_turn_ids.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 维度评分列表 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <BarChart3 className="h-5 w-5 text-blue-500" />
          <h2 className="text-xl font-semibold text-gray-800">维度评分详情</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metrics.map((metric, index) => (
            <div key={index} className="bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-3">
                <span className="font-medium text-gray-800">{metric.name}</span>
                <span className={`text-lg font-bold ${getMetricColor(metric.score_0_5)}`}>
                  {metric.score_0_5?.toFixed(1) || 'N/A'}
                </span>
              </div>
              
              {/* 评分进度条 */}
              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                <div 
                  className={`h-2 rounded-full ${getMetricColor(metric.score_0_5).replace('text-', 'bg-')}`}
                  style={{ width: `${((metric.score_0_5 || 0) / 5) * 100}%` }}
                />
              </div>
              
              {/* 置信度 */}
              <div className="text-xs text-gray-500 mb-2">
                置信度: {((metric.confidence_0_1 || 0) * 100).toFixed(0)}%
              </div>

              {/* 稳定性信息 */}
              {stabilityStats && stabilityStats.metrics && stabilityStats.metrics[metric.name] && (
                <div className="text-xs text-gray-600 mb-2">
                  稳定性: {stabilityStats.metrics[metric.name].mean.toFixed(1)} ({stabilityStats.metrics[metric.name].range[0]}~{stabilityStats.metrics[metric.name].range[1]})
                </div>
              )}
              
              {/* 扣分原因 */}
              {metric.deductions && metric.deductions.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-red-600 font-medium">扣分原因:</div>
                  <ul className="text-xs text-red-600 mt-1">
                    {metric.deductions.map((deduction, i) => (
                      <li key={i}>• {deduction}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 低分维度警告 */}
      {lowMetrics.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center space-x-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h2 className="text-xl font-semibold text-gray-800">需关注维度</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {lowMetrics.map((metric, index) => (
              <div key={index} className="bg-red-50 border border-red-200 p-3 rounded-lg">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-red-800">{metric.name}</span>
                  <span className="text-red-600 font-bold">{metric.score_0_5?.toFixed(1)}</span>
                </div>
                <div className="text-xs text-red-600">
                  需要重点关注和改进
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 原始JSON数据 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection('rawJson')}
        >
          <div className="flex items-center space-x-2">
            <Copy className="h-5 w-5 text-blue-500" />
            <h2 className="text-xl font-semibold text-gray-800">原始评测数据</h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard();
              }}
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
            {expandedSections.rawJson ? 
              <ChevronUp className="h-5 w-5 text-gray-400" /> : 
              <ChevronDown className="h-5 w-5 text-gray-400" />
            }
          </div>
        </div>

        {expandedSections.rawJson && (
          <div className="mt-4">
            <pre className="bg-gray-50 p-4 rounded-lg text-xs overflow-auto max-h-96 border">
              {JSON.stringify({ result, stabilityStats }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScoreResults;
