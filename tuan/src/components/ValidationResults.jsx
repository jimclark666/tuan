import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

const ValidationResults = ({ validation, missingFields }) => {
  const getStatusIcon = (isValid) => {
    if (isValid) return <CheckCircle className="h-5 w-5 text-green-500" />;
    return <XCircle className="h-5 w-5 text-red-500" />;
  };

  const getStatusColor = (isValid) => {
    return isValid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center space-x-2 mb-6">
        <AlertTriangle className="h-5 w-5 text-blue-500" />
        <h2 className="text-xl font-semibold text-gray-800">输入校验结果</h2>
      </div>

      {/* 总体状态 */}
      <div className={`border rounded-lg p-4 mb-6 ${getStatusColor(validation.is_valid)}`}>
        <div className="flex items-center space-x-2 mb-2">
          {getStatusIcon(validation.is_valid)}
          <span className="font-medium text-gray-800">
            输入验证: {validation.is_valid ? '通过' : '失败'}
          </span>
        </div>
        <p className="text-sm text-gray-600">
          {validation.is_valid 
            ? '输入数据格式正确，可以进行标准化处理' 
            : '输入数据存在问题，请检查错误信息'
          }
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 错误信息 */}
        {validation.errors && validation.errors.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <h3 className="text-lg font-medium text-gray-700">错误信息</h3>
            </div>
            <div className="space-y-2">
              {validation.errors.map((error, index) => (
                <div key={index} className="bg-red-50 border border-red-200 rounded-md p-3">
                  <div className="flex items-start space-x-2">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-red-700">{error}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 警告信息 */}
        {validation.warnings && validation.warnings.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <h3 className="text-lg font-medium text-gray-700">警告信息</h3>
            </div>
            <div className="space-y-2">
              {validation.warnings.map((warning, index) => (
                <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-yellow-700">{warning}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 缺失字段 */}
      {missingFields && missingFields.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center space-x-2 mb-3">
            <Info className="h-4 w-4 text-blue-500" />
            <h3 className="text-lg font-medium text-gray-700">缺失字段</h3>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {missingFields.map((field, index) => (
                <div key={index} className="bg-white px-3 py-2 rounded border text-sm text-gray-700">
                  {field}
                </div>
              ))}
            </div>
            <p className="text-sm text-blue-700 mt-3">
              建议在原始数据中补充这些字段以提高标准化质量
            </p>
          </div>
        </div>
      )}

      {/* 标准化操作 */}
      {validation.normalization_actions && validation.normalization_actions.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center space-x-2 mb-3">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <h3 className="text-lg font-medium text-gray-700">执行的标准化操作</h3>
          </div>
          <div className="space-y-2">
            {validation.normalization_actions.map((action, index) => (
              <div key={index} className="bg-green-50 border border-green-200 rounded-md p-3">
                <div className="flex items-start space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-green-700">{action}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ValidationResults;
