/**
 * 稳定性评估计算工具
 * 用于计算多次运行结果的统计指标（均值、标准差、范围等）
 */

/**
 * 计算基础统计数据
 * @param {Array} values - 数值数组
 * @returns {Object} 统计结果
 */
function calculateStats(values) {
  if (!values || values.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0, range: [0, 0] };
  }

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    mean: parseFloat(mean.toFixed(1)),
    std: parseFloat(std.toFixed(1)),
    min: parseFloat(min.toFixed(1)),
    max: parseFloat(max.toFixed(1)),
    range: [parseFloat(min.toFixed(1)), parseFloat(max.toFixed(1))]
  };
}

/**
 * 计算稳定性统计数据
 * @param {Array} runRecords - 多次评测结果记录数组
 * @returns {Object} 稳定性统计数据
 */
export function calculateStabilityStats(runRecords) {
  if (!runRecords || runRecords.length === 0) {
    throw new Error('无可用结果，无法计算稳定性统计');
  }

  const stats = {
    n: runRecords.length,
    n_valid: 0,
    skipped_runs: [],
    total: {},
    metrics: {},
    notes: []
  };

  // 过滤有效结果
  const validResults = [];
  const skipReasons = {
    parse_failed: 0,
    missing_total_score: 0,
    missing_metrics: 0
  };

  runRecords.forEach((record, index) => {
    // 检查是否解析成功
    if (!record.parsed || !record.formattedResult) {
      stats.skipped_runs.push({
        runIndex: index + 1,
        reason: '解析失败',
        error: record.error?.message || '未知错误'
      });
      skipReasons.parse_failed++;
      return;
    }

    const result = record.formattedResult;
    
    // 检查总分
    const totalScore = result.model_a_result?.total_score_0_100;
    if (typeof totalScore !== 'number') {
      stats.skipped_runs.push({
        runIndex: index + 1,
        reason: '缺少总分',
        error: 'model_a_result.total_score_0_100 不是有效数字'
      });
      skipReasons.missing_total_score++;
      return;
    }

    // 检查metrics
    const metrics = result.model_a_result?.metrics;
    if (!Array.isArray(metrics)) {
      stats.skipped_runs.push({
        runIndex: index + 1,
        reason: '缺少metrics',
        error: 'model_a_result.metrics 不是数组'
      });
      skipReasons.missing_metrics++;
      return;
    }

    // 如果通过了所有检查，添加到有效结果
    validResults.push(result);
  });

  stats.n_valid = validResults.length;
  stats.skip_reasons = skipReasons;

  // 如果没有有效结果，返回详细错误信息
  if (validResults.length === 0) {
    const lastRecord = runRecords[runRecords.length - 1];
    const rawPreview = lastRecord?.rawText ? lastRecord.rawText.substring(0, 200) : '无原始数据';
    
    throw new Error(
      `0/${runRecords.length} 次结果可用于统计。` +
      `解析失败: ${skipReasons.parse_failed}次, ` +
      `缺总分: ${skipReasons.missing_total_score}次, ` +
      `缺metrics: ${skipReasons.missing_metrics}次。` +
      `最近一次原始输出: ${rawPreview}`
    );
  }

  // 计算总分统计
  const totalScores = validResults.map(r => r.model_a_result.total_score_0_100);
  stats.total = calculateStats(totalScores);

  // 获取所有维度名称
  const metricsNames = new Set();
  validResults.forEach(result => {
    if (result.model_a_result.metrics) {
      result.model_a_result.metrics.forEach(metric => {
        if (metric.name) {
          metricsNames.add(metric.name);
        }
      });
    }
  });

  // 计算各维度统计
  metricsNames.forEach(metricName => {
    const metricScores = validResults.map(result => {
      const metric = result.model_a_result.metrics.find(m => m.name === metricName);
      return metric && typeof metric.score_0_5 === 'number' ? metric.score_0_5 : 0;
    });
    
    stats.metrics[metricName] = calculateStats(metricScores);
  });

  // 样本不足提示
  if (validResults.length < 2) {
    stats.notes.push('样本不足，波动仅供参考');
  }

  return stats;
}
