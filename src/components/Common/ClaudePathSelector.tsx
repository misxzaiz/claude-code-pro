/**
 * CLI 路径选择器组件
 * 支持自动检测和手动输入两种模式
 * 支持 Claude Code 和 IFlow 两种引擎
 */

import { useState, useEffect } from 'react';
import * as tauri from '../../services/tauri';

type EngineType = 'claude-code' | 'iflow' | 'deepseek';

interface ClaudePathSelectorProps {
  /** 当前路径值 */
  value: string;
  /** 路径变更回调 */
  onChange: (path: string) => void;
  /** 引擎类型 */
  engineType?: EngineType;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否显示紧凑模式（用于连接蒙版） */
  compact?: boolean;
  /** 错误提示 */
  error?: string;
  /** 占位符文本 */
  placeholder?: string;
}

type InputMode = 'auto' | 'manual';

/** 引擎配置 */
const ENGINE_CONFIG: Record<EngineType, { name: string; placeholder: string; example: string }> = {
  'claude-code': {
    name: 'Claude Code',
    placeholder: '请输入 Claude CLI 的完整路径',
    example: '例如: C:\\Users\\[用户名]\\AppData\\Roaming\\npm\\claude.cmd',
  },
  'iflow': {
    name: 'IFlow',
    placeholder: '请输入 IFlow CLI 的完整路径',
    example: '例如: C:\\Users\\[用户名]\\AppData\\Roaming\\npm\\iflow.cmd',
  },
  'deepseek': {
    name: 'DeepSeek',
    placeholder: 'DeepSeek 使用 API Key 连接，无需 CLI 路径',
    example: '请在下方 API Key 输入框中填写密钥',
  },
};

export function ClaudePathSelector({
  value,
  onChange,
  engineType = 'claude-code',
  disabled = false,
  compact = false,
  error,
  placeholder,
}: ClaudePathSelectorProps) {
  const config = ENGINE_CONFIG[engineType];
  // 默认使用手动输入模式，避免一打开就自动检测
  const [mode, setMode] = useState<InputMode>('manual');
  const [detectedPaths, setDetectedPaths] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // 检测所有可用的 CLI 路径（根据引擎类型）
  const detectPaths = async () => {
    setDetecting(true);
    try {
      const paths = engineType === 'claude-code'
        ? await tauri.findClaudePaths()
        : await tauri.findIFlowPaths();
      setDetectedPaths(paths);

      // 如果有检测结果且当前值为空，自动选择第一个
      if (paths.length > 0 && !value) {
        onChange(paths[0]);
      }
    } catch (e) {
      console.error(`检测 ${config.name} 路径失败:`, e);
      setDetectedPaths([]);
    } finally {
      setDetecting(false);
    }
  };

  // 验证路径是否有效（根据引擎类型）
  const validatePath = async (path: string) => {
    if (!path.trim()) {
      setIsValid(null);
      setValidationError(null);
      return;
    }

    setValidating(true);
    try {
      const result = engineType === 'claude-code'
        ? await tauri.validateClaudePath(path)
        : await tauri.validateIFlowPath(path);
      setIsValid(result.valid);
      setValidationError(result.error || null);
    } catch (e) {
      setIsValid(false);
      setValidationError(e instanceof Error ? e.message : '验证失败');
    } finally {
      setValidating(false);
    }
  };

  // 切换到自动检测模式时才执行检测
  useEffect(() => {
    if (mode === 'auto') {
      detectPaths();
    }
  }, [mode, engineType]);

  // DeepSeek 不需要路径选择，显示特殊提示
  if (engineType === 'deepseek') {
    return (
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="text-sm text-text-primary font-medium">{config.name}</p>
            <p className="text-xs text-text-secondary mt-1">
              DeepSeek 使用 API Key 连接，无需配置 CLI 路径。请在设置中填写 API Key 即可使用。
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              {config.example}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 模式切换 - 左边手动输入，右边自动检测 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('manual')}
          disabled={disabled}
          className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
            mode === 'manual'
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-background-surface border-border text-text-secondary hover:border-border-hover'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          手动输入
        </button>
        <button
          type="button"
          onClick={() => setMode('auto')}
          disabled={disabled}
          className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
            mode === 'auto'
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-background-surface border-border text-text-secondary hover:border-border-hover'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          自动检测
        </button>
      </div>

      {/* 自动检测模式 */}
      {mode === 'auto' && (
        <div className="space-y-2">
          <div className="flex items-stretch gap-2">
            <div className="flex-1 min-w-0 relative">
              <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled || detecting || detectedPaths.length === 0}
                className={`w-full px-3 py-2 pr-8 bg-background-surface border rounded-l-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:z-10 ${
                  error ? 'border-danger' : 'border-border'
                } ${disabled || detecting ? 'opacity-50' : ''}`}
              >
                <option value="">请选择 {config.name} CLI 路径</option>
                {detectedPaths.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={detectPaths}
              disabled={disabled || detecting}
              className="px-3 bg-background-surface border border-l-0 border-border rounded-r-lg hover:border-border-hover transition-colors disabled:opacity-50 flex items-center justify-center"
              title="重新检测"
            >
              <svg
                className={`w-4 h-4 ${detecting ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>

          {/* 检测结果提示 */}
          {detectedPaths.length === 0 && !detecting && (
            <p className="text-xs text-text-tertiary">
              未检测到 {config.name} CLI，请确认已安装或尝试手动输入路径
            </p>
          )}
          {detectedPaths.length > 0 && (
            <p className="text-xs text-text-tertiary">
              检测到 {detectedPaths.length} 个可用路径
            </p>
          )}
        </div>
      )}

      {/* 手动输入模式 */}
      {mode === 'manual' && (
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                validatePath(e.target.value);
              }}
              disabled={disabled || validating}
              className={`w-full px-3 py-2 pr-10 bg-background-surface border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary ${
                error ? 'border-danger' : 'border-border'
              } ${disabled || validating ? 'opacity-50' : ''}`}
              placeholder={placeholder || config.placeholder}
            />
            {/* 验证状态图标 */}
            {value && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {validating ? (
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : isValid === true ? (
                  <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : isValid === false ? (
                  <svg className="w-5 h-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : null}
              </div>
            )}
          </div>

          {/* 验证结果提示 */}
          {validationError && (
            <p className="text-xs text-danger">{validationError}</p>
          )}
          {isValid === true && !compact && (
            <p className="text-xs text-success">路径有效，可以正常使用</p>
          )}
          <p className="text-xs text-text-tertiary">
            {config.example}
          </p>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
