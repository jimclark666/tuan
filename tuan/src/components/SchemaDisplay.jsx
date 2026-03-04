import React from 'react';
import { FileText, Database, Shield, Target } from 'lucide-react';

const SchemaDisplay = () => {
  const schemaInfo = {
    version: "xm_eval_v1",
    turnFields: [
      { name: "turn_id", type: "number", required: true, description: "对话轮次ID，从1开始" },
      { name: "role", type: "string", required: true, description: "角色：user/assistant/tool/system" },
      { name: "content", type: "string", required: true, description: "消息内容，空则用''" },
      { name: "timestamp", type: "string|null", required: true, description: "时间戳，无则为null" },
      { name: "tool_call", type: "object|null", required: true, description: "工具调用信息" },
      { name: "kb_hit", type: "object|null", required: true, description: "知识库检索结果" },
      { name: "derived", type: "object", required: true, description: "派生字段" }
    ],
    dialogueFields: [
      { name: "scenario", type: "string", required: true, description: "场景分类" },
      { name: "user_goal", type: "string", required: true, description: "用户目标总结" },
      { name: "goal_confidence_0_1", type: "number", required: true, description: "目标置信度0-1" },
      { name: "success_criteria", type: "array", required: true, description: "成功标准数组" },
      { name: "privacy_risk_flag", type: "object", required: true, description: "隐私风险标识" }
    ],
    scenarios: [
      { name: "外卖下单", keywords: "下单/配送/地址/备注/餐品/骑手/预计送达" },
      { name: "到店团购核销", keywords: "团购/核销/券码/二维码/门店核销/预约到店" },
      { name: "退款售后", keywords: "退款/退单/售后/投诉/催单/错送/漏送/赔付" },
      { name: "酒店预订", keywords: "入住/退房/房型/预订/取消/价格/发票" },
      { name: "其他", keywords: "不满足以上场景" }
    ]
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center space-x-2 mb-6">
        <Database className="h-5 w-5 text-blue-500" />
        <h2 className="text-xl font-semibold text-gray-800">标准Schema定义</h2>
        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
          v{schemaInfo.version}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 轮次级别字段 */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <FileText className="h-4 w-4 text-gray-600" />
            <h3 className="text-lg font-medium text-gray-700">对话轮次字段 (turns)</h3>
          </div>
          
          <div className="space-y-3">
            {schemaInfo.turnFields.map((field) => (
              <div key={field.name} className="border border-gray-200 rounded-md p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-800">{field.name}</span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    field.required ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {field.type}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{field.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 对话级别字段 */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Shield className="h-4 w-4 text-gray-600" />
            <h3 className="text-lg font-medium text-gray-700">对话级别字段 (dialogue_summary)</h3>
          </div>
          
          <div className="space-y-3">
            {schemaInfo.dialogueFields.map((field) => (
              <div key={field.name} className="border border-gray-200 rounded-md p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-800">{field.name}</span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    field.required ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {field.type}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{field.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 场景识别规则 */}
      <div className="mt-6">
        <div className="flex items-center space-x-2 mb-4">
          <Target className="h-4 w-4 text-gray-600" />
          <h3 className="text-lg font-medium text-gray-700">场景识别规则</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {schemaInfo.scenarios.map((scenario) => (
            <div key={scenario.name} className="bg-gray-50 p-3 rounded-md">
              <div className="font-medium text-gray-800 mb-1">{scenario.name}</div>
              <div className="text-xs text-gray-600">{scenario.keywords}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 派生字段说明 */}
      <div className="mt-6 bg-blue-50 p-4 rounded-md">
        <h4 className="font-medium text-blue-800 mb-2">派生字段说明 (derived)</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <strong>intent_candidate:</strong> 该轮最可能意图<br/>
            <strong>needs_tool:</strong> 是否需要工具/系统动作<br/>
          </div>
          <div>
            <strong>key_entities:</strong> 关键实体抽取<br/>
            <strong>system_instruction:</strong> 是否为系统指令<br/>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchemaDisplay;
