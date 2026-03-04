/**
 * 数据脱敏工具
 * 用于在复制/导出数据时移除或脱敏敏感信息
 */

/**
 * 脱敏API Key（只保留前4位）
 * @param {string} apiKey - 原始API Key
 * @returns {string} 脱敏后的API Key
 */
export function sanitizeApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return '';
  }
  
  if (apiKey.length <= 4) {
    return '****';
  }
  
  return apiKey.substring(0, 4) + '****';
}

/**
 * 移除配置对象中的API Key字段
 * @param {Object} config - 配置对象
 * @returns {Object} 移除API Key后的配置对象
 */
export function removeApiKeys(config) {
  if (!config || typeof config !== 'object') {
    return config;
  }
  
  const sanitized = { ...config };
  
  // 移除modelA的apiKey
  if (sanitized.modelA && sanitized.modelA.apiKey) {
    sanitized.modelA = { ...sanitized.modelA };
    delete sanitized.modelA.apiKey;
  }
  
  // 移除modelB的apiKey
  if (sanitized.modelB && sanitized.modelB.apiKey) {
    sanitized.modelB = { ...sanitized.modelB };
    delete sanitized.modelB.apiKey;
  }
  
  // 移除顶层的apiKey
  if (sanitized.apiKey) {
    delete sanitized.apiKey;
  }
  
  return sanitized;
}

/**
 * 脱敏配置对象中的API Key（保留前4位）
 * @param {Object} config - 配置对象
 * @returns {Object} 脱敏后的配置对象
 */
export function sanitizeConfig(config) {
  if (!config || typeof config !== 'object') {
    return config;
  }
  
  const sanitized = { ...config };
  
  // 脱敏modelA的apiKey
  if (sanitized.modelA && sanitized.modelA.apiKey) {
    sanitized.modelA = { ...sanitized.modelA };
    sanitized.modelA.apiKey = sanitizeApiKey(sanitized.modelA.apiKey);
  }
  
  // 脱敏modelB的apiKey
  if (sanitized.modelB && sanitized.modelB.apiKey) {
    sanitized.modelB = { ...sanitized.modelB };
    sanitized.modelB.apiKey = sanitizeApiKey(sanitized.modelB.apiKey);
  }
  
  // 脱敏顶层的apiKey
  if (sanitized.apiKey) {
    sanitized.apiKey = sanitizeApiKey(sanitized.apiKey);
  }
  
  return sanitized;
}

/**
 * 清理调试信息中的敏感数据
 * @param {Object} debugInfo - 调试信息对象
 * @returns {Object} 清理后的调试信息
 */
export function sanitizeDebugInfo(debugInfo) {
  if (!debugInfo || typeof debugInfo !== 'object') {
    return debugInfo;
  }
  
  const sanitized = { ...debugInfo };
  
  // 移除完整的API Key
  if (sanitized.apiKey) {
    sanitized.apiKey = sanitizeApiKey(sanitized.apiKey);
  }
  
  // 脱敏配置对象
  if (sanitized.config) {
    sanitized.config = sanitizeConfig(sanitized.config);
  }
  
  // 脱敏abTestConfig
  if (sanitized.abTestConfig) {
    sanitized.abTestConfig = sanitizeConfig(sanitized.abTestConfig);
  }
  
  // 脱敏modelConfig
  if (sanitized.modelConfig) {
    sanitized.modelConfig = sanitizeConfig(sanitized.modelConfig);
  }
  
  return sanitized;
}
