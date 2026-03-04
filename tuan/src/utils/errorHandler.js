// API错误处理工具 - 简化版本，仅保留基础功能

/**
 * 处理API错误的简化版本
 * @param {string} url - 请求URL
 * @param {Response|null} response - 响应对象
 * @param {Error|null} error - 错误对象
 * @returns {Object} 错误信息对象
 */
export const handleApiError = async (url, response, error) => {
  let errorMessage = '';
  let debugInfo = {};
  let userFriendlyMessage = '';

  try {
    if (response) {
      // 有响应的情况
      debugInfo.url = url;
      debugInfo.status = response.status;
      
      try {
        const responseText = await response.text();
        debugInfo.responseText = responseText.substring(0, 300);
        
        // 尝试解析JSON获取更详细的错误信息
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.detail || errorData.error || response.statusText;
        } catch {
          errorMessage = responseText || response.statusText;
        }
      } catch (textError) {
        errorMessage = response.statusText;
        debugInfo.responseText = '无法读取响应内容';
      }

      // 根据状态码提供友好提示
      switch (response.status) {
        case 401:
          userFriendlyMessage = '未登录或登录态失效，请先在同域页面登录后重试';
          break;
        case 403:
          userFriendlyMessage = '权限不足，请联系管理员';
          break;
        case 404:
          userFriendlyMessage = '接口不存在，请检查API配置';
          break;
        case 500:
          userFriendlyMessage = '服务器内部错误，请稍后重试';
          break;
        case 502:
        case 503:
        case 504:
          userFriendlyMessage = '服务暂时不可用，请稍后重试';
          break;
        default:
          userFriendlyMessage = `请求失败 (${response.status})`;
      }
    } else if (error) {
      // 网络错误或异常情况
      debugInfo.url = url;
      debugInfo.error = error.message;
      errorMessage = error.message;
      userFriendlyMessage = '接口不可达/被拦截，请检查网络连接或浏览器Network面板';
    }

    return {
      errorMessage,
      debugInfo,
      userFriendlyMessage,
      timestamp: new Date().toISOString()
    };
  } catch (parseError) {
    // 错误处理本身的异常
    return {
      errorMessage: '错误处理失败',
      debugInfo: { url, parseError: parseError.message },
      userFriendlyMessage: '系统错误，请联系技术支持',
      timestamp: new Date().toISOString()
    };
  }
};

// 创建带有错误处理的fetch函数 - 保留但不再使用
export const fetchWithErrorHandling = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorInfo = await handleApiError(url, response);
      throw new Error(errorInfo.userFriendlyMessage);
    }
    
    return response;
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      // 网络错误
      const errorInfo = await handleApiError(url, null, error);
      throw new Error(errorInfo.userFriendlyMessage);
    }
    throw error;
  }
};
