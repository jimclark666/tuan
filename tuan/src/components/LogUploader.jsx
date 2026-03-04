import React, { useState } from 'react';
import { Upload, FileText, AlertTriangle, CheckCircle, Coffee, Ticket, RefreshCw } from 'lucide-react';
import { processLogData } from '../utils/logProcessor';
import ErrorAlert from './ErrorAlert';

const LogUploader = ({ onLogProcessed, onInputChange }) => {
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [errorDebugInfo, setErrorDebugInfo] = useState(null);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputText(value);
    onInputChange(value);
    setError('');
    setErrorDebugInfo(null);
  };

  const handleProcess = async () => {
    if (!inputText.trim()) {
      setError('请输入对话日志内容');
      setErrorDebugInfo(null);
      return;
    }

    setIsProcessing(true);
    setError('');
    setErrorDebugInfo(null);

    try {
      const result = await processLogData(inputText);
      onLogProcessed(result);
    } catch (err) {
      setError(err.message);
      setErrorDebugInfo({
        inputLength: inputText.length,
        inputPreview: inputText.substring(0, 200),
        error: err.message
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 示例数据
  const exampleData = {
    takeout: `{
  "messages": [
    {
      "role": "user",
      "content": "我要订外卖，想吃麻辣香锅",
      "timestamp": "2024-01-15T12:00:00Z"
    },
    {
      "role": "assistant",
      "content": "好的，我来帮您查找附近的麻辣香锅店铺",
      "timestamp": "2024-01-15T12:00:05Z",
      "tool_calls": [
        {
          "name": "search_restaurants",
          "args": {"cuisine": "麻辣香锅"},
          "status": "success"
        }
      ]
    },
    {
      "role": "user",
      "content": "这家店不错，我要下单",
      "timestamp": "2024-01-15T12:01:00Z"
    },
    {
      "role": "assistant",
      "content": "请确认您的配送地址和联系方式",
      "timestamp": "2024-01-15T12:01:05Z"
    }
  ]
}`,
    store: `{
  "messages": [
    {
      "role": "user",
      "content": "我要核销团购券",
      "timestamp": "2024-01-15T14:00:00Z"
    },
    {
      "role": "assistant",
      "content": "请提供您的团购券码",
      "timestamp": "2024-01-15T14:00:05Z"
    },
    {
      "role": "user",
      "content": "券码是：ABC123456",
      "timestamp": "2024-01-15T14:01:00Z"
    },
    {
      "role": "assistant",
      "content": "正在为您核销券码...",
      "timestamp": "2024-01-15T14:01:05Z",
      "tool_calls": [
        {
          "name": "verify_coupon",
          "args": {"coupon_code": "ABC123456"},
          "status": "success"
        }
      ]
    }
  ]
}`,
    refund: `{
  "messages": [
    {
      "role": "user",
      "content": "我要申请退款",
      "timestamp": "2024-01-15T16:00:00Z"
    },
    {
      "role": "assistant",
      "content": "请提供您的订单号",
      "timestamp": "2024-01-15T16:00:05Z"
    },
    {
      "role": "user",
      "content": "订单号是：ORDER987654321",
      "timestamp": "2024-01-15T16:01:00Z"
    },
    {
      "role": "assistant",
      "content": "正在为您查询订单信息...",
      "timestamp": "2024-01-15T16:01:05Z",
      "tool_calls": [
        {
          "name": "query_order",
          "args": {"order_id": "ORDER987654321"},
          "status": "success"
        }
      ]
    },
    {
      "role": "user",
      "content": "怎么还没退款？",
      "timestamp": "2024-01-15T16:02:00Z"
    },
    {
      "role": "assistant",
      "content": "抱歉让您久等了，我帮您催一下退款进度",
      "timestamp": "2024-01-15T16:02:05Z",
      "tool_calls": [
        {
          "name": "expedite_refund",
          "args": {"order_id": "ORDER987654321"},
          "status": "success"
        }
      ]
    }
  ]
}`
  };

  // 填充示例数据
  const fillExample = (type) => {
    setInputText(exampleData[type]);
    onInputChange(exampleData[type]);
    setError('');
    setErrorDebugInfo(null);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center space-x-2 mb-4">
        <Upload className="h-5 w-5 text-blue-500" />
        <h2 className="text-xl font-semibold text-gray-800">上传对话日志</h2>
      </div>

      {/* 示例数据按钮 */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => fillExample('takeout')}
            className="flex items-center space-x-2 px-3 py-2 bg-orange-100 hover:bg-orange-200 text-orange-800 rounded-md transition-colors"
          >
            <Coffee className="h-4 w-4" />
            <span>示例：外卖下单</span>
          </button>
          <button
            onClick={() => fillExample('store')}
            className="flex items-center space-x-2 px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-md transition-colors"
          >
            <Ticket className="h-4 w-4" />
            <span>示例：到店核销</span>
          </button>
          <button
            onClick={() => fillExample('refund')}
            className="flex items-center space-x-2 px-3 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-md transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>示例：退款售后</span>
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          点击上方按钮快速填充示例数据，然后点击"开始标准化处理"
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 输入区域 */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              对话日志输入 (JSON格式)
            </label>
            <textarea
              value={inputText}
              onChange={handleInputChange}
              placeholder="请粘贴您的对话日志JSON数据..."
              className="w-full h-64 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
          </div>

          {error && (
            <ErrorAlert 
              error={error} 
              debugInfo={errorDebugInfo}
              title="处理失败"
            />
          )}

          <button
            onClick={handleProcess}
            disabled={isProcessing || !inputText.trim()}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? '处理中...' : '开始标准化处理'}
          </button>
        </div>

        {/* 示例区域 */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <FileText className="h-4 w-4 text-gray-500" />
            <h3 className="text-lg font-medium text-gray-700">输入格式示例</h3>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-md">
            <pre className="text-xs text-gray-600 overflow-auto max-h-64">
              {exampleData.takeout}
            </pre>
          </div>

          <div className="bg-blue-50 p-4 rounded-md">
            <h4 className="font-medium text-blue-800 mb-2">支持的消息字段：</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• role: user/assistant/tool/system</li>
              <li>• content: 消息内容</li>
              <li>• timestamp: 时间戳</li>
              <li>• tool_calls: 工具调用记录</li>
              <li>• kb_hits: 知识库检索结果</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogUploader;
