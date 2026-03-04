import React, { useState } from 'react';
import { BarChart3, RotateCcw, Settings } from 'lucide-react';

const StabilityConfig = ({ onConfigChange }) => {
  const [config, setConfig] = useState({
    enabled: true,
    runs: 3,
    temperature: 0.2
  });

  const handleConfigChange = (newConfig) => {
    setConfig(newConfig);
    onConfigChange(newConfig);
  };

  const updateConfig = (field, value) => {
    handleConfigChange({ ...config, [field]: value });
  };

  const runOptions = [
    { value: 1, label: '1次 (快速测试)' },
    { value: 3, label: '3次 (推荐)' },
    { value: 5, label: '5次 (高精度)' }
  ];

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center space-x-2 mb-6">
        <BarChart3 className="h-5 w-5 text-purple-500" />
        <h2 className="text-xl font-semibold text-gray-800">稳定性评估配置</h2>
      </div>

      <div className="space-y-6">
        {/* 启用稳定性评估 */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-800">启用稳定性评估</h3>
            <p className="text-sm text-gray-600">通过多次运行评估结果的一致性</p>
          </div>
          <button
            onClick={() => updateConfig('enabled', !config.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.enabled ? 'bg-purple-500' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {config.enabled && (
          <>
            {/* 重复运行次数 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                重复运行次数
              </label>
              <div className="grid grid-cols-3 gap-3">
                {runOptions.map(option => (
                  <button
                    key={option.value}
                    onClick={() => updateConfig('runs', option.value)}
                    className={`p-3 rounded-lg border text-center transition-colors ${
                      config.runs === option.value
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium">{option.value}次</div>
                    <div className="text-xs text-gray-500 mt-1">{option.label.split(' ')[1]}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 固定温度 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                固定Temperature (确保结果一致性)
              </label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={config.temperature}
                onChange={(e) => updateConfig('temperature', parseFloat(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                建议设置为0.2以下以确保结果稳定性
              </p>
            </div>

            {/* 说明信息 */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex items-start space-x-2">
                <Settings className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">稳定性评估说明</p>
                  <ul className="space-y-1 text-xs">
                    <li>• 使用相同的输入和配置进行多次评测</li>
                    <li>• 计算总分和各维度的均值、标准差、范围</li>
                    <li>• 波动范围大的结果会提示"差异不稳定"</li>
                    <li>• 建议对重要评测使用3次或5次重复运行</li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StabilityConfig;
