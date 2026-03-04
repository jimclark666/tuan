import React from 'react';
import { Target, Shield, CheckSquare, AlertCircle } from 'lucide-react';

const DialogueSummary = ({ summary }) => {
  const getScenarioColor = (scenario) => {
    const colors = {
      '外卖下单': 'bg-orange-100 text-orange-800',
      '到店团购核销': 'bg-purple-100 text-purple-800',
      '退款售后': 'bg-red-100 text-red-800',
      '酒店预订': 'bg-blue-100 text-blue-800',
      '其他': 'bg-gray-100 text-gray-800'
    };
    return colors[scenario] || colors['其他'];
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRiskLevel = (flag) => {
    if (!flag.flag) return { level: '低', color: 'text-green-600', bg: 'bg-green-50' };
    return { level: '高', color: 'text-red-600', bg: 'bg-red-50' };
  };

  const riskInfo = getRiskLevel(summary.privacy_risk_flag);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center space-x-2 mb-6">
        <Target className="h-5 w-5 text-blue-500" />
        <h2 className="text-xl font-semibold text-gray-800">对话摘要</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 基本信息 */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">场景分类</label>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getScenarioColor(summary.scenario)}`}>
              {summary.scenario}
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">用户目标</label>
            <p className="text-gray-800 bg-gray-50 p-3 rounded-md">
              {summary.user_goal}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">目标置信度</label>
            <div className="flex items-center space-x-2">
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${summary.goal_confidence_0_1 >= 0.8 ? 'bg-green-500' : summary.goal_confidence_0_1 >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${summary.goal_confidence_0_1 * 100}%` }}
                />
              </div>
              <span className={`text-sm font-medium ${getConfidenceColor(summary.goal_confidence_0_1)}`}>
                {(summary.goal_confidence_0_1 * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* 成功标准和隐私风险 */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">成功标准</label>
            <div className="space-y-2">
              {summary.success_criteria.map((criteria, index) => (
                <div key={index} className="flex items-start space-x-2 bg-gray-50 p-2 rounded">
                  <CheckSquare className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{criteria}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">隐私风险评估</label>
            <div className={`p-3 rounded-md ${riskInfo.bg}`}>
              <div className="flex items-center space-x-2 mb-1">
                <Shield className={`h-4 w-4 ${riskInfo.color}`} />
                <span className={`text-sm font-medium ${riskInfo.color}`}>
                  风险等级: {riskInfo.level}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                {summary.privacy_risk_flag.reason}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 关键指标卡片 */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <Target className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium text-blue-800">场景识别</span>
          </div>
          <p className="text-lg font-semibold text-blue-900 mt-1">{summary.scenario}</p>
        </div>

        <div className="bg-green-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <CheckSquare className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-800">成功标准</span>
          </div>
          <p className="text-lg font-semibold text-green-900 mt-1">
            {summary.success_criteria.length} 项
          </p>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-purple-500" />
            <span className="text-sm font-medium text-purple-800">置信度</span>
          </div>
          <p className="text-lg font-semibold text-purple-900 mt-1">
            {(summary.goal_confidence_0_1 * 100).toFixed(0)}%
          </p>
        </div>
      </div>
    </div>
  );
};

export default DialogueSummary;
