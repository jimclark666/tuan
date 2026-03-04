import React, { useState } from 'react';
import { Upload, FileText, Settings, AlertCircle, Brain, BarChart3, Target } from 'lucide-react';
import LogUploader from '../components/LogUploader';
import SchemaDisplay from '../components/SchemaDisplay';
import ValidationResults from '../components/ValidationResults';
import DialogueSummary from '../components/DialogueSummary';
import TurnsDisplay from '../components/TurnsDisplay';
import UIHints from '../components/UIHints';
import LLMEvaluation from '../components/LLMEvaluation';
import ScoreResults from '../components/ScoreResults';
import RCAAnalysis from '../components/RCAAnalysis';

const Index = () => {
  const [currentStep, setCurrentStep] = useState('upload');
  const [processedData, setProcessedData] = useState(null);
  const [rawInput, setRawInput] = useState('');
  const [scoreResult, setScoreResult] = useState(null);
  const [stabilityStats, setStabilityStats] = useState(null);
  const [modelConfig, setModelConfig] = useState(null);

  const handleLogProcessed = (data) => {
    setProcessedData(data);
    setCurrentStep('results');
  };

  const handleInputChange = (input) => {
    setRawInput(input);
  };

  const handleScoreResult = (result, stats = null, config = null) => {
    setScoreResult(result);
    setStabilityStats(stats);
    setModelConfig(config);
    setCurrentStep('score');
  };

  // 处理轮次选择，用于RCA跳转到指定轮次
  const handleTurnSelect = (turnId) => {
    setCurrentStep('results');
    // 这里可以添加滚动到指定轮次的逻辑
    setTimeout(() => {
      const element = document.getElementById(`turn-${turnId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const steps = [
    { id: 'upload', label: '日志上传', icon: Upload },
    { id: 'schema', label: 'Schema定义', icon: FileText },
    { id: 'results', label: '标准化结果', icon: Settings },
    { id: 'validation', label: '校验结果', icon: AlertCircle },
    { id: 'evaluation', label: 'LLM评测', icon: Brain },
    { id: 'score', label: '评分结果', icon: BarChart3 },
    { id: 'rca', label: 'RCA归因', icon: Target }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* 头部标题 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            对话日志标准化工作台
          </h1>
          <p className="text-lg text-gray-600">
            AI评测系统 - 步骤1：对话日志标准化与评测切片 | 步骤2：LLM智能评测 | 步骤3：RCA归因诊断
          </p>
        </div>

        {/* 步骤导航 */}
        <div className="flex justify-center mb-8">
          <div className="flex space-x-1 bg-white rounded-lg p-1 shadow-md overflow-x-auto">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(step.id)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${
                    currentStep === step.id
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{step.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 主要内容区域 */}
        <div className="max-w-6xl mx-auto">
          {currentStep === 'upload' && (
            <LogUploader
              onLogProcessed={handleLogProcessed}
              onInputChange={handleInputChange}
            />
          )}

          {currentStep === 'schema' && (
            <SchemaDisplay />
          )}

          {currentStep === 'results' && processedData && (
            <div className="space-y-6">
              <DialogueSummary summary={processedData.dialogue_summary} />
              <TurnsDisplay turns={processedData.turns} />
              <UIHints hints={processedData.ui_hints} />
            </div>
          )}

          {currentStep === 'validation' && processedData && (
            <ValidationResults
              validation={processedData.input_validation}
              missingFields={processedData.input_validation.missing_fields}
            />
          )}

          {currentStep === 'evaluation' && (
            <LLMEvaluation 
              normalizedData={processedData} 
              onScoreResult={handleScoreResult}
            />
          )}

          {currentStep === 'score' && scoreResult && (
            <ScoreResults result={scoreResult} stabilityStats={stabilityStats} />
          )}

          {currentStep === 'rca' && (
            <RCAAnalysis 
              normalizedData={processedData}
              scoreResult={scoreResult}
              modelConfig={modelConfig}
              onTurnSelect={handleTurnSelect}
            />
          )}
        </div>

        {/* 使用说明 */}
        <div className="max-w-6xl mx-auto mt-8">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">使用说明</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-600">
              <div>
                <h4 className="font-medium text-gray-800 mb-2">步骤1：对话日志标准化</h4>
                <ul className="space-y-1">
                  <li>• 上传JSON格式的对话日志</li>
                  <li>• 系统自动进行标准化处理</li>
                  <li>• 查看校验结果和缺失字段</li>
                  <li>• 生成场景摘要和UI提示</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-800 mb-2">步骤2：LLM智能评测</h4>
                <ul className="space-y-1">
                  <li>• 配置火山方舟模型API</li>
                  <li>• 配置A/B测试模型对比</li>
                  <li>• 调用大模型进行多维度评分</li>
                  <li>• 查看详细的评测报告</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-800 mb-2">步骤3：RCA归因诊断</h4>
                <ul className="space-y-1">
                  <li>• 分析低分维度的根本原因</li>
                  <li>• 生成可执行的修复建议</li>
                  <li>• 提供P0/P1/P2优先级分类</li>
                  <li>• 支持跳转到相关对话轮次</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
