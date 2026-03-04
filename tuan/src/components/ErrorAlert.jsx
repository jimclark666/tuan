import React from 'react';
import { AlertTriangle, Copy, CheckCircle } from 'lucide-react';
import { sanitizeDebugInfo } from '../utils/sanitize';

const ErrorAlert = ({ error, debugInfo, title = '错误' }) => {
  const [copied, setCopied] = React.useState(false);

  const copyDebugInfo = async () => {
    try {
      const sanitizedDebugInfo = sanitizeDebugInfo(debugInfo);
      const debugData = {
        error,
        debugInfo: sanitizedDebugInfo,
        timestamp: new Date().toISOString()
      };
      await navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制调试信息失败:', err);
    }
  };

  // 确保错误码不被覆盖
  const errorCode = debugInfo?.code || debugInfo?.errorCode || 'UNKNOWN_ERROR';
  const status = debugInfo?.status || 'n/a';
  const durationMs = debugInfo?.durationMs || 'n/a';
  const timeoutMs = debugInfo?.timeoutMs || 'n/a';
  const inputSizeChars = debugInfo?.inputSizeChars || 'n/a';
  const attemptRecords = debugInfo?.attemptRecords || [];

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
      case 'PARSE_ERROR':
        return '模型输出包含代码块，已启用安全解析/请重试';
      default:
        return '请检查网络连接和API配置';
    }
  };

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-start space-x-3">
        <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800 mb-2">{title}</h3>
          <p className="text-sm text-red-700 mb-3">{error}</p>
          
          {/* 错误详情 */}
          <div className="space-y-2 text-xs text-red-600">
            <div className="flex items-center space-x-2">
              <span className="font-medium">错误代码:</span>
              <span className="bg-red-100 px-2 py-1 rounded">{errorCode}</span>
            </div>
            
            {status !== 'n/a' && (
              <div className="flex items-center space-x-2">
                <span className="font-medium">状态:</span>
                <span>{status}</span>
              </div>
            )}
            
            {durationMs !== 'n/a' && (
              <div className="flex items-center space-x-2">
                <span className="font-medium">耗时:</span>
                <span>{durationMs}ms</span>
              </div>
            )}
            
            {timeoutMs !== 'n/a' && (
              <div className="flex items-center space-x-2">
                <span className="font-medium">超时:</span>
                <span>{timeoutMs}ms</span>
              </div>
            )}
            
            {inputSizeChars !== 'n/a' && (
              <div className="flex items-center space-x-2">
                <span className="font-medium">输入大小:</span>
                <span>{inputSizeChars}字符</span>
              </div>
            )}
            
            {attemptRecords.length > 0 && (
              <div className="mt-2">
                <div className="font-medium mb-1">重试记录:</div>
                <div className="space-y-1">
                  {attemptRecords.map((attempt, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <span className="bg-gray-100 px-2 py-1 rounded text-xs">
                        尝试 {attempt.attempt}
                      </span>
                      <span className="text-xs">{attempt.errorCode}</span>
                      <span className="text-xs text-gray-500">
                        ({attempt.durationMs}ms)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 错误建议 */}
            <div className="mt-2">
              <div className="font-medium mb-1">建议:</div>
              <div className="text-xs text-red-600">
                {getErrorAdvice(errorCode)}
              </div>
            </div>
          </div>
          
          {/* 调试信息 */}
          {debugInfo && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-medium text-red-700">调试信息</h4>
                <button
                  onClick={copyDebugInfo}
                  className="flex items-center space-x-1 px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="h-3 w-3" />
                      <span>已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>复制</span>
                    </>
                  )}
                </button>
              </div>
              
              <pre className="text-xs bg-red-100 p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorAlert;
