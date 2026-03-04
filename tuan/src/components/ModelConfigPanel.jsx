import React, { useState } from 'react';
import { Settings, Eye, EyeOff, Trash2, AlertCircle, Shield } from 'lucide-react';

const ModelConfigPanel = ({ onConfigChange }) => {
  const [config, setConfig] = useState({
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    endpointId: '',
    apiKey: '',
    temperature: 0.2
  });
  const [showApiKey, setShowApiKey] = useState(false);

  const handleConfigChange = (field, value) => {
    const newConfig = { ...config, [field]: value };
    setConfig(newConfig);
    onConfigChange(newConfig);
  };

  const clearApiKey = () => {
    handleConfigChange('apiKey', '');
  };

  const isConfigValid = config.endpointId.trim() !== '' && config.apiKey.trim() !== '';

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center space-x-2 mb-6">
        <Settings className="h-5 w-5 text-blue-500" />
        <h2 className="text-xl font-semibold text-gray-800">模型API配置</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Base URL
          </label>
          <input
            type="text"
            value={config.baseUrl}
            onChange={(e) => handleConfigChange('baseUrl', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://ark.cn-beijing.volces.com/api/v3"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Endpoint ID / Model <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={config.endpointId}
            onChange={(e) => handleConfigChange('endpointId', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="请输入Endpoint ID或模型名称"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API Key <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={config.apiKey}
              onChange={(e) => handleConfigChange('apiKey', e.target.value)}
              className="w-full p-2 pr-20 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="请输入API Key"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex justify-between mt-2">
            <button
              onClick={clearApiKey}
              className="flex items-center space-x-1 text-sm text-red-600 hover:text-red-800"
            >
              <Trash2 className="h-3 w-3" />
              <span>清空Key</span>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Temperature
          </label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={config.temperature}
            onChange={(e) => handleConfigChange('temperature', parseFloat(e.target.value))}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* 安全提示 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
          <div className="flex items-start space-x-2">
            <Shield className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">安全提示</p>
              <ul className="mt-1 space-y-1">
                <li>• API Key仅保存在内存中，刷新即清空，不写入本地存储</li>
                <li>• 请勿在公开场景分享包含API Key的截图/JSON</li>
              </ul>
            </div>
          </div>
        </div>

        {!isConfigValid && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800">
                请先填写完整的配置信息（Endpoint ID和API Key为必填项）
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelConfigPanel;
