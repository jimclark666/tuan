import React from 'react';
import { Lightbulb, Star, Shield, AlertTriangle } from 'lucide-react';

const UIHints = ({ hints }) => {
  const getBadgeColor = (type) => {
    switch (type) {
      case 'scenario':
        return 'bg-blue-100 text-blue-800';
      case 'risk':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskIcon = (level) => {
    switch (level) {
      case 'high':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'medium':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Shield className="h-4 w-4 text-green-500" />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center space-x-2 mb-6">
        <Lightbulb className="h-5 w-5 text-yellow-500" />
        <h2 className="text-xl font-semibold text-gray-800">UI展示提示</h2>
      </div>

      <div className="space-y-6">
        {/* 推荐区块 */}
        <div>
          <h3 className="text-lg font-medium text-gray-700 mb-3">推荐展示区块</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {hints.recommended_sections.map((section, index) => (
              <div key={index} className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <div className="flex items-center space-x-2">
                  <Star className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-blue-800">{section}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 高亮轮次 */}
        {hints.highlight_turn_ids && hints.highlight_turn_ids.length > 0 && (
          <div>
            <h3 className="text-lg font-medium text-gray-700 mb-3">高亮轮次</h3>
            <div className="flex flex-wrap gap-2">
              {hints.highlight_turn_ids.map((turnId) => (
                <span key={turnId} className="bg-yellow-100 text-yellow-800 text-sm px-3 py-1 rounded-full">
                  第 {turnId} 轮
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 全局徽章 */}
        {hints.badges && hints.badges.length > 0 && (
          <div>
            <h3 className="text-lg font-medium text-gray-700 mb-3">全局徽章</h3>
            <div className="flex flex-wrap gap-2">
              {hints.badges.map((badge, index) => (
                <div key={index} className={`flex items-center space-x-2 px-3 py-2 rounded-full text-sm ${getBadgeColor(badge.type)}`}>
                  {badge.type === 'risk' && getRiskIcon(badge.level)}
                  <span className="font-medium">{badge.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 轮次徽章 */}
        {hints.turn_badges && hints.turn_badges.length > 0 && (
          <div>
            <h3 className="text-lg font-medium text-gray-700 mb-3">轮次徽章</h3>
            <div className="space-y-3">
              {hints.turn_badges.map((turnBadge) => (
                <div key={turnBadge.turn_id} className="bg-gray-50 p-3 rounded-md">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800">第 {turnBadge.turn_id} 轮</span>
                    <div className="flex flex-wrap gap-1">
                      {turnBadge.tags.map((tag, index) => (
                        <span key={index} className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 展示建议 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <h4 className="font-medium text-yellow-800 mb-2">展示建议</h4>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• 使用不同颜色区分不同角色的消息</li>
            <li>• 高亮显示关键信息轮次</li>
            <li>• 在工具调用失败时显示错误提示</li>
            <li>• 为隐私风险高的对话添加警告标识</li>
            <li>• 提供展开/收起功能以优化长对话的展示</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default UIHints;
