import React, { useState, useEffect } from 'react';
import { Settings, Plus, Minus, AlertCircle, Shield } from 'lucide-react';
import { cleanConfig } from '../utils/configValidator';

const ABTestConfig = ({ onConfigChange }) => {
  const [config, setConfig] = useState({
    mode: 'single', // 'single' or 'ab'
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

  const providers = [
    { id: 'volc_ark', name: '火山方舟', available: true },
    { id: 'openai', name: 'OpenAI', available: false },
    { id: 'gemini', name: 'Google Gemini', available: false },
    { id: 'aliyun', name: '阿里云', available: false },
    { id: 'deepseek', name: 'DeepSeek', available: false }
  ];

  // 清理并标准化配置
  useEffect(() => {
    const cleanedConfig = cleanConfig(config);
    if (JSON.stringify(cleanedConfig) !== JSON.stringify(config)) {
      handleConfigChange(cleanedConfig);
    }
  }, []);

  const handleConfigChange = (newConfig) => {
    setConfig(newConfig);
    onConfigChange(newConfig);
  };

  const updateModelA = (field, value) => {
    const newConfig = {
      ...config,
      modelA: { ...config.modelA, [field]: value }
    };
    handleConfigChange(newConfig);
  };

  const updateModelB = (field, value) => {
    const newConfig = {
      ...config,
      modelB: { ...config.modelB, [field]: value }
    };
    handleConfigChange(newConfig);
  };

  const toggleMode = () => {
    const newMode = config.mode === 'single' ? 'ab' : 'single';
    const newConfig = { ...config, mode: newMode };
    handleConfigChange(newConfig);
  };

  const getProviderName = (providerId) => {
    const provider = providers.find(p => p.id === providerId);
    return provider ? provider.name : providerId;
  };

  const isProviderAvailable = (providerId) => {
    const provider = providers.find(p => p.id === providerId);
    return provider ? provider.available : false;
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center space-x-2 mb-6">
        <Settings className="h-5 w-5 text-blue-500" />
        <h2 className="text-xl font-semibold text-gray-800">A/B测试配置</h2>
      </div>

      {/* 安全提示 */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-6">
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

      {/* 模式切换 */}
      <div className="mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={toggleMode}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
              config.mode === 'single' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <span>单模型模式</span>
          </button>
          <button
            onClick={toggleMode}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
              config.mode === 'ab' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <span>A/B测试模式</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Model A 配置 */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
              A
            </div>
            <h3 className="text-lg font-medium text-gray-800">Model A</h3>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Provider
            </label>
            <select
              value={config.modelA.provider}
              onChange={(e) => updateModelA('provider', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {providers.map(provider => (
                <option key={provider.id} value={provider.id} disabled={!provider.available}>
                  {provider.name} {!provider.available && '(Coming soon)'}
                </option>
              ))}
            </select>
          </div>

          {config.modelA.provider === 'volc_ark' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Base URL
                </label>
                <input
                  type="text"
                  value={config.modelA.baseUrl}
                  onChange={(e) => updateModelA('baseUrl', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://ark.cn-beijing.volces.com/api/v3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Endpoint ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={config.modelA.endpointId}
                  onChange={(e) => updateModelA('endpointId', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="请输入Endpoint ID (如 ep-xxxx)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={config.modelA.apiKey}
                  onChange={(e) => updateModelA('apiKey', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="请输入API Key"
                />
              </div>
            </>
          )}

          {config.modelA.provider !== 'volc_ark' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Base URL
                </label>
                <input
                  type="text"
                  value={config.modelA.baseUrl}
                  onChange={(e) => updateModelA('baseUrl', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="请输入API Base URL"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Model Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={config.modelA.endpointId} // 为了兼容性，其他provider也用endpointId字段存储
                  onChange={(e) => updateModelA('endpointId', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="请输入Model名称"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={config.modelA.apiKey}
                  onChange={(e) => updateModelA('apiKey', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="请输入API Key"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Temperature
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={config.modelA.temperature}
              onChange={(e) => updateModelA('temperature', parseFloat(e.target.value))}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {!isProviderAvailable(config.modelA.provider) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-yellow-800">
                  {getProviderName(config.modelA.provider)} 即将支持，敬请期待
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Model B 配置 */}
        {config.mode === 'ab' && (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                B
              </div>
              <h3 className="text-lg font-medium text-gray-800">Model B</h3>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Provider
              </label>
              <select
                value={config.modelB.provider}
                onChange={(e) => updateModelB('provider', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                {providers.map(provider => (
                  <option key={provider.id} value={provider.id} disabled={!provider.available}>
                    {provider.name} {!provider.available && '(Coming soon)'}
                  </option>
                ))}
              </select>
            </div>

            {config.modelB.provider === 'volc_ark' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Base URL
                  </label>
                  <input
                    type="text"
                    value={config.modelB.baseUrl}
                    onChange={(e) => updateModelB('baseUrl', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="https://ark.cn-beijing.volces.com/api/v3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Endpoint ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={config.modelB.endpointId}
                    onChange={(e) => updateModelB('endpointId', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="请输入Endpoint ID (如 ep-xxxx)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    API Key <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={config.modelB.apiKey}
                    onChange={(e) => updateModelB('apiKey', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="请输入API Key"
                  />
                </div>
              </>
            )}

            {config.modelB.provider !== 'volc_ark' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Base URL
                  </label>
                  <input
                    type="text"
                    value={config.modelB.baseUrl}
                    onChange={(e) => updateModelB('baseUrl', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="请输入API Base URL"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Model Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={config.modelB.endpointId} // 为了兼容性，其他provider也用endpointId字段存储
                    onChange={(e) => updateModelB('endpointId', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="请输入Model名称"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    API Key <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={config.modelB.apiKey}
                    onChange={(e) => updateModelB('apiKey', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="请输入API Key"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Temperature
              </label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={config.modelB.temperature}
                onChange={(e) => updateModelB('temperature', parseFloat(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {!isProviderAvailable(config.modelB.provider) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-yellow-800">
                    {getProviderName(config.modelB.provider)} 即将支持，敬请期待
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 配置摘要 */}
      <div className="mt-6 bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium text-gray-700 mb-3">配置摘要</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-800">Model A:</span>
            <span className="ml-2 text-gray-600">
              {getProviderName(config.modelA.provider)} / {config.modelA.endpointId || '未设置'} / T={config.modelA.temperature}
            </span>
          </div>
          {config.mode === 'ab' && (
            <div>
              <span className="font-medium text-gray-800">Model B:</span>
              <span className="ml-2 text-gray-600">
                {getProviderName(config.modelB.provider)} / {config.modelB.endpointId || '未设置'} / T={config.modelB.temperature}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ABTestConfig;
