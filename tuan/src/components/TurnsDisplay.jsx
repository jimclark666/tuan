import React, { useState } from 'react';
import { MessageCircle, User, Bot, Wrench, Settings, ChevronDown, ChevronUp } from 'lucide-react';

const TurnsDisplay = ({ turns }) => {
  const [expandedTurns, setExpandedTurns] = useState(new Set());

  const toggleTurn = (turnId) => {
    const newExpanded = new Set(expandedTurns);
    if (newExpanded.has(turnId)) {
      newExpanded.delete(turnId);
    } else {
      newExpanded.add(turnId);
    }
    setExpandedTurns(newExpanded);
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'user':
        return <User className="h-4 w-4 text-blue-500" />;
      case 'assistant':
        return <Bot className="h-4 w-4 text-green-500" />;
      case 'tool':
        return <Wrench className="h-4 w-4 text-orange-500" />;
      case 'system':
        return <Settings className="h-4 w-4 text-purple-500" />;
      default:
        return <MessageCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'user':
        return 'bg-blue-50 border-blue-200';
      case 'assistant':
        return 'bg-green-50 border-green-200';
      case 'tool':
        return 'bg-orange-50 border-orange-200';
      case 'system':
        return 'bg-purple-50 border-purple-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '无时间戳';
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center space-x-2 mb-6">
        <MessageCircle className="h-5 w-5 text-blue-500" />
        <h2 className="text-xl font-semibold text-gray-800">对话轮次</h2>
        <span className="bg-gray-100 text-gray-600 text-sm px-2 py-1 rounded-full">
          共 {turns.length} 轮
        </span>
      </div>

      <div className="space-y-4">
        {turns.map((turn) => (
          <div key={turn.turn_id} className={`border rounded-lg ${getRoleColor(turn.role)}`}>
            {/* 轮次头部 */}
            <div 
              className="p-4 cursor-pointer hover:bg-opacity-80 transition-colors"
              onClick={() => toggleTurn(turn.turn_id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getRoleIcon(turn.role)}
                  <div>
                    <span className="font-medium text-gray-800">
                      第 {turn.turn_id} 轮 - {turn.role}
                    </span>
                    <span className="text-sm text-gray-500 ml-2">
                      {formatTimestamp(turn.timestamp)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {turn.derived.needs_tool && (
                    <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded">
                      需要工具
                    </span>
                  )}
                  {turn.derived.system_instruction && (
                    <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">
                      系统指令
                    </span>
                  )}
                  {expandedTurns.has(turn.turn_id) ? 
                    <ChevronUp className="h-4 w-4 text-gray-400" /> : 
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  }
                </div>
              </div>
            </div>

            {/* 展开内容 */}
            {expandedTurns.has(turn.turn_id) && (
              <div className="border-t px-4 py-4 space-y-4">
                {/* 消息内容 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">消息内容</label>
                  <p className="text-gray-800 bg-white p-3 rounded border">
                    {turn.content || '无内容'}
                  </p>
                </div>

                {/* 工具调用 */}
                {turn.tool_call && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">工具调用</label>
                    <div className="bg-white p-3 rounded border">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="text-sm text-gray-600">工具名称:</span>
                          <p className="font-medium">{turn.tool_call.name}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">状态:</span>
                          <span className={`ml-2 px-2 py-1 rounded text-xs ${
                            turn.tool_call.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {turn.tool_call.status}
                          </span>
                        </div>
                      </div>
                      {turn.tool_call.args && (
                        <div className="mt-2">
                          <span className="text-sm text-gray-600">参数:</span>
                          <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-auto">
                            {JSON.stringify(turn.tool_call.args, null, 2)}
                          </pre>
                        </div>
                      )}
                      {turn.tool_call.error && (
                        <div className="mt-2">
                          <span className="text-sm text-gray-600">错误:</span>
                          <p className="text-red-600 text-sm mt-1">{turn.tool_call.error}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 知识库检索 */}
                {turn.kb_hit && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">知识库检索</label>
                    <div className="bg-white p-3 rounded border">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="text-sm text-gray-600">查询:</span>
                          <p className="font-medium">{turn.kb_hit.query}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">命中数量:</span>
                          <p className="font-medium">{turn.kb_hit.top_hits_count}</p>
                        </div>
                      </div>
                      {turn.kb_hit.top_sources && turn.kb_hit.top_sources.length > 0 && (
                        <div className="mt-2">
                          <span className="text-sm text-gray-600">来源:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {turn.kb_hit.top_sources.map((source, index) => (
                              <span key={index} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                                {source}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 派生字段 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">派生字段</label>
                  <div className="bg-white p-3 rounded border">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm text-gray-600">意图候选:</span>
                        <p className="font-medium">{turn.derived.intent_candidate}</p>
                      </div>
                      <div>
                        <span className="text-sm text-gray-600">需要工具:</span>
                        <span className={`ml-2 px-2 py-1 rounded text-xs ${
                          turn.derived.needs_tool ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {turn.derived.needs_tool ? '是' : '否'}
                        </span>
                      </div>
                    </div>
                    {turn.derived.key_entities && turn.derived.key_entities.length > 0 && (
                      <div className="mt-2">
                        <span className="text-sm text-gray-600">关键实体:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {turn.derived.key_entities.map((entity, index) => (
                            <span key={index} className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                              {entity}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TurnsDisplay;
