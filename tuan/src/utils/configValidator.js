import { isEmpty, isNil } from 'lodash';

/**
 * 统一的配置校验工具
 * 返回详细的缺失字段和原因，便于UI展示
 */

/**
 * 验证配置完整性
 * @param {Object} config - A/B测试配置对象
 * @param {Object} normalizedResult - 标准化结果
 * @returns {Object} 校验结果 { ok, missing, reasons }
 */
export const validateConfig = (config, normalizedResult) => {
  const missing = [];
  const reasons = [];

  // 检查前置条件：Step1是否完成
  if (!normalizedResult || !normalizedResult.turns || normalizedResult.turns.length === 0) {
    reasons.push('请先完成 Step1：日志标准化处理（生成 turns）');
    return { ok: false, missing, reasons };
  }

  // 检查配置对象是否存在
  if (!config) {
    missing.push('config');
    reasons.push('配置对象不存在');
    return { ok: false, missing, reasons };
  }

  // 检查模式
  if (!config.mode || !['single', 'ab'].includes(config.mode)) {
    missing.push('config.mode');
    reasons.push('请选择评测模式（单模型/A/B测试）');
    return { ok: false, missing, reasons };
  }

  // 校验Model A（单模型和A/B模式都需要）
  const modelAValidation = validateModelConfig('modelA', config.modelA);
  if (!modelAValidation.ok) {
    missing.push(...modelAValidation.missing);
    reasons.push(...modelAValidation.reasons);
  }

  // A/B模式还需要校验Model B
  if (config.mode === 'ab') {
    const modelBValidation = validateModelConfig('modelB', config.modelB);
    if (!modelBValidation.ok) {
      missing.push(...modelBValidation.missing);
      reasons.push(...modelBValidation.reasons);
    }
  }

  return {
    ok: missing.length === 0 && reasons.length === 0,
    missing: [...new Set(missing)], // 去重
    reasons: [...new Set(reasons)]  // 去重
  };
};

/**
 * 校验单个模型配置
 * @param {string} modelName - 模型名称（modelA/modelB）
 * @param {Object} modelConfig - 模型配置对象
 * @returns {Object} 校验结果 { ok, missing, reasons }
 */
const validateModelConfig = (modelName, modelConfig) => {
  const missing = [];
  const reasons = [];

  if (!modelConfig) {
    missing.push(`${modelName}`);
    reasons.push(`${modelName} 配置对象不存在`);
    return { ok: false, missing, reasons };
  }

  // 检查provider
  if (isEmpty(modelConfig.provider)) {
    missing.push(`${modelName}.provider`);
    reasons.push(`${modelName} 请选择 Provider`);
  }

  // 检查baseUrl
  if (isEmpty(modelConfig.baseUrl)) {
    missing.push(`${modelName}.baseUrl`);
    reasons.push(`${modelName} 请填写 Base URL`);
  } else if (!isValidUrl(modelConfig.baseUrl)) {
    missing.push(`${modelName}.baseUrl`);
    reasons.push(`${modelName} Base URL 格式不正确`);
  }

  // 检查endpointId（火山方舟）或model（其他provider）
  if (modelConfig.provider === 'volc_ark') {
    if (isEmpty(modelConfig.endpointId)) {
      missing.push(`${modelName}.endpointId`);
      reasons.push(`${modelName} 请填写 Endpoint ID`);
    }
  } else {
    if (isEmpty(modelConfig.model)) {
      missing.push(`${modelName}.model`);
      reasons.push(`${modelName} 请填写 Model 名称`);
    }
  }

  // 检查apiKey
  if (isEmpty(modelConfig.apiKey)) {
    missing.push(`${modelName}.apiKey`);
    reasons.push(`${modelName} 请填写 API Key`);
  }

  // temperature可选，默认为0.2
  if (isNil(modelConfig.temperature) || modelConfig.temperature === '') {
    modelConfig.temperature = 0.2;
  }

  return {
    ok: missing.length === 0 && reasons.length === 0,
    missing,
    reasons
  };
};

/**
 * 简单的URL格式验证
 */
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * 获取配置的摘要信息（用于UI展示）
 * @param {Object} config - A/B测试配置
 * @returns {string} 配置摘要文本
 */
export const getConfigSummary = (config) => {
  if (!config) return '配置未初始化';

  const parts = [];
  
  if (config.mode === 'single') {
    parts.push('单模型模式');
    if (config.modelA) {
      const modelA = config.modelA;
      parts.push(`${modelA.provider || '未设置'}/${modelA.endpointId || modelA.model || '未设置'}`);
    }
  } else if (config.mode === 'ab') {
    parts.push('A/B测试模式');
    if (config.modelA) {
      const modelA = config.modelA;
      parts.push(`A: ${modelA.provider || '未设置'}/${modelA.endpointId || modelA.model || '未设置'}`);
    }
    if (config.modelB) {
      const modelB = config.modelB;
      parts.push(`B: ${modelB.provider || '未设置'}/${modelB.endpointId || modelB.model || '未设置'}`);
    }
  }

  return parts.join(' - ') || '配置不完整';
};

/**
 * 清理配置对象，确保字段一致性
 * @param {Object} config - 原始配置
 * @returns {Object} 清理后的配置
 */
export const cleanConfig = (config) => {
  if (!config) return null;

  const cleaned = {
    mode: config.mode || 'single',
    modelA: cleanModelConfig(config.modelA),
    modelB: cleanModelConfig(config.modelB)
  };

  return cleaned;
};

/**
 * 清理单个模型配置
 */
const cleanModelConfig = (modelConfig) => {
  if (!modelConfig) return null;

  return {
    provider: modelConfig.provider || '',
    baseUrl: modelConfig.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3',
    endpointId: modelConfig.endpointId || modelConfig.model || '', // 兼容旧字段
    model: modelConfig.model || modelConfig.endpointId || '', // 兼容旧字段
    apiKey: modelConfig.apiKey || '',
    temperature: modelConfig.temperature || 0.2
  };
};
