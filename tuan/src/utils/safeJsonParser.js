/**
 * 通用安全JSON解析器
 * 用于处理模型输出中包含代码块标记的情况
 */

import { sanitizeDebugInfo } from './sanitize';

/**
 * 安全解析JSON字符串
 * @param {string} rawText - 原始文本
 * @returns {Object} 解析后的对象
 * @throws {Error} 解析失败时抛出错误
 */
export function safeParseJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('输入为空或不是字符串');
  }

  try {
    // 步骤1: trim
    const trimmed = rawText.trim();
    
    let jsonCandidate = '';
    
    // 步骤2: 检查是否包含 ```json 或 ```
    if (trimmed.includes('```json') || trimmed.includes('```')) {
      // 优先提取 ```json 与下一个 ``` 之间的内容
      if (trimmed.includes('```json')) {
        const startIndex = trimmed.indexOf('```json') + 7; // 跳过 ```json
        const endIndex = trimmed.indexOf('```', startIndex);
        
        if (endIndex !== -1) {
          jsonCandidate = trimmed.substring(startIndex, endIndex);
        } else {
          // 如果没有找到结束标记，取从 ```json 开始到末尾
          jsonCandidate = trimmed.substring(startIndex);
        }
      } else {
        // 提取第一个 ``` 与下一个 ``` 之间内容
        const startIndex = trimmed.indexOf('```') + 3; // 跳过 ```
        const endIndex = trimmed.indexOf('```', startIndex);
        
        if (endIndex !== -1) {
          jsonCandidate = trimmed.substring(startIndex, endIndex);
        } else {
          // 如果没有找到结束标记，取从 ``` 开始到末尾
          jsonCandidate = trimmed.substring(startIndex);
        }
      }
    } else {
      // 步骤3: 提取从第一个 '{' 到最后一个 '}' 的子串
      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
        jsonCandidate = trimmed.substring(firstBrace, lastBrace + 1);
      } else {
        throw new Error('未找到有效的JSON结构');
      }
    }
    
    // 步骤4: 对 jsonCandidate 再 trim，然后 JSON.parse
    jsonCandidate = jsonCandidate.trim();
    
    try {
      return JSON.parse(jsonCandidate);
    } catch (parseError) {
      // 如果解析失败，提供更详细的错误信息
      const sanitizedRawText = sanitizeDebugInfo({ rawText }).rawText || rawText;
      const preview = sanitizedRawText.substring(0, 200);
      
      throw new Error(`无法解析JSON: ${parseError.message}。原始输出前200字: ${preview}`);
    }
    
  } catch (error) {
    // 如果所有解析策略都失败
    const sanitizedRawText = sanitizeDebugInfo({ rawText }).rawText || rawText;
    const preview = sanitizedRawText.substring(0, 200);
    
    const parseError = new Error(`JSON解析失败: ${error.message}。原始输出前200字: ${preview}`);
    parseError.code = 'PARSE_ERROR';
    parseError.rawText = rawText;
    
    throw parseError;
  }
}

/**
 * 检查字符串是否包含代码块标记
 * @param {string} text - 要检查的文本
 * @returns {boolean} 是否包含代码块标记
 */
export function containsCodeBlock(text) {
  if (!text || typeof text !== 'string') return false;
  return text.includes('```json') || text.includes('```');
}

/**
 * 清理代码块标记
 * @param {string} text - 原始文本
 * @returns {string} 清理后的文本
 */
export function cleanCodeBlocks(text) {
  if (!text || typeof text !== 'string') return text;
  
  // 移除 ```json 和 ``` 标记
  return text
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();
}
