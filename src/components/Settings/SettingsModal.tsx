import { useState, useEffect } from 'react';
import { useConfigStore } from '../../stores';
import { Button, ClaudePathSelector } from '../Common';
import type { Config, EngineId, FloatingWindowMode } from '../../types';

interface SettingsModalProps {
  onClose: () => void;
}

/** 引擎选项 */
const ENGINE_OPTIONS: { id: EngineId; name: string; description: string }[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic 官方 CLI 工具',
  },
  {
    id: 'iflow',
    name: 'IFlow',
    description: '智能编程助手 CLI 工具',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: '国产高性能 AI 编程助手（成本仅为 Claude 的 1/10）',
  },
];

/** 悬浮窗模式选项 */
const FLOATING_MODE_OPTIONS: { id: FloatingWindowMode; name: string; description: string }[] = [
  {
    id: 'auto',
    name: '自动',
    description: '鼠标移出主窗口时自动显示悬浮窗',
  },
  {
    id: 'manual',
    name: '手动',
    description: '需要手动触发悬浮窗显示',
  },
];

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { config, loading, error, updateConfig } = useConfigStore();
  const [localConfig, setLocalConfig] = useState<Config | null>(config);

  // 当 config 更新时同步到 localConfig
  useEffect(() => {
    if (config) {
      setLocalConfig(config);
    }
  }, [config]);

  const handleSave = async () => {
    if (!localConfig) return;

    try {
      await updateConfig(localConfig);
      onClose();
    } catch (error) {
      console.error('保存配置失败:', error);
    }
  };

  const handleEngineChange = (engineId: EngineId) => {
    if (!localConfig) return;
    setLocalConfig({ ...localConfig, defaultEngine: engineId });
  };

  const handleClaudeCmdChange = (cmd: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      claudeCode: { ...localConfig.claudeCode, cliPath: cmd }
    });
  };

  const handleIFlowCmdChange = (cmd: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      iflow: { ...localConfig.iflow, cliPath: cmd }
    });
  };

  const handleDeepSeekApiKeyChange = (apiKey: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      deepseek: { ...localConfig.deepseek, apiKey }
    });
  };

  const handleDeepSeekModelChange = (model: 'deepseek-chat' | 'deepseek-coder' | 'deepseek-reasoner') => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      deepseek: { ...localConfig.deepseek, model }
    });
  };

  const handleDeepSeekTemperatureChange = (temperature: number) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      deepseek: { ...localConfig.deepseek, temperature }
    });
  };

  const handleDeepSeekMaxTokensChange = (maxTokens: number) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      deepseek: { ...localConfig.deepseek, maxTokens }
    });
  };

  const handleFloatingWindowEnabledChange = (enabled: boolean) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      floatingWindow: { ...localConfig.floatingWindow, enabled }
    });
  };

  const handleFloatingWindowModeChange = (mode: FloatingWindowMode) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      floatingWindow: { ...localConfig.floatingWindow, mode }
    });
  };

  const handleFloatingWindowExpandOnHoverChange = (expandOnHover: boolean) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      floatingWindow: { ...localConfig.floatingWindow, expandOnHover }
    });
  };

  const handleFloatingWindowCollapseDelayChange = (collapseDelay: number) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      floatingWindow: { ...localConfig.floatingWindow, collapseDelay }
    });
  };

  const handleBaiduTranslateAppIdChange = (appId: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      baiduTranslate: { ...localConfig.baiduTranslate, appId, secretKey: localConfig.baiduTranslate?.secretKey || '' }
    });
  };

  const handleBaiduTranslateSecretKeyChange = (secretKey: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      baiduTranslate: { ...localConfig.baiduTranslate, appId: localConfig.baiduTranslate?.appId || '', secretKey }
    });
  };

  if (!localConfig) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-background-elevated rounded-xl p-6 max-w-md w-full mx-4 shadow-soft">
          <div className="text-center">加载配置中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-elevated rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto shadow-soft">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary">设置</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-danger-faint border border-danger/30 rounded-lg text-danger text-sm">
            {error}
          </div>
        )}

        {/* AI 引擎选择 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-text-secondary mb-3">
            AI 引擎
          </label>
          <div className="space-y-2">
            {ENGINE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleEngineChange(option.id)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                  localConfig.defaultEngine === option.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-surface hover:border-primary/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-text-primary">{option.name}</div>
                    <div className="text-sm text-text-secondary mt-1">{option.description}</div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    localConfig.defaultEngine === option.id
                      ? 'border-primary bg-primary'
                      : 'border-border'
                  }`}>
                    {localConfig.defaultEngine === option.id && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Claude Code 配置 */}
        {localConfig.defaultEngine === 'claude-code' && (
          <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-3">Claude Code 配置</h3>
            <div>
              <label className="block text-xs text-text-secondary mb-2">
                Claude CLI 命令路径
              </label>
              <ClaudePathSelector
                value={localConfig.claudeCode.cliPath}
                onChange={handleClaudeCmdChange}
                engineType="claude-code"
                disabled={loading}
              />
            </div>
          </div>
        )}

        {/* IFlow 配置 */}
        {localConfig.defaultEngine === 'iflow' && (
          <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-3">IFlow 配置</h3>

            {/* CLI 路径 */}
            <div>
              <label className="block text-xs text-text-secondary mb-2">
                IFlow CLI 命令路径（可选）
              </label>
              <ClaudePathSelector
                value={localConfig.iflow.cliPath || 'iflow'}
                onChange={handleIFlowCmdChange}
                engineType="iflow"
                disabled={loading}
                placeholder="iflow"
              />
            </div>
          </div>
        )}

        {/* DeepSeek 配置 */}
        {localConfig.defaultEngine === 'deepseek' && (
          <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-3">DeepSeek 配置</h3>

            {/* API Key */}
            <div className="mb-4">
              <label className="block text-xs text-text-secondary mb-2">
                API Key <span className="text-danger">*</span>
              </label>
              <input
                type="password"
                value={localConfig.deepseek?.apiKey || ''}
                onChange={(e) => handleDeepSeekApiKeyChange(e.target.value)}
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={loading}
              />
              <p className="mt-1 text-xs text-text-tertiary">
                在 <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">DeepSeek 开放平台</a> 获取 API Key
              </p>
            </div>

            {/* 模型选择 */}
            <div className="mb-4">
              <label className="block text-xs text-text-secondary mb-2">
                模型选择
              </label>
              <select
                value={localConfig.deepseek?.model || 'deepseek-coder'}
                onChange={(e) => handleDeepSeekModelChange(e.target.value as any)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={loading}
              >
                <option value="deepseek-chat">DeepSeek Chat (通用对话)</option>
                <option value="deepseek-coder">DeepSeek Coder (代码生成，推荐)</option>
                <option value="deepseek-reasoner">DeepSeek Reasoner (复杂推理)</option>
              </select>
            </div>

            {/* 温度参数 */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-text-secondary">
                  温度参数 (Temperature)
                </label>
                <span className="text-xs font-medium text-primary">
                  {localConfig.deepseek?.temperature ?? 0.7}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={localConfig.deepseek?.temperature ?? 0.7}
                onChange={(e) => handleDeepSeekTemperatureChange(Number(e.target.value))}
                className="w-full h-2 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-primary"
                disabled={loading}
              />
              <div className="flex justify-between text-xs text-text-tertiary mt-1">
                <span>0 (精确)</span>
                <span>1 (平衡)</span>
                <span>2 (创造)</span>
              </div>
            </div>

            {/* 最大 Token 数 */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-text-secondary">
                  最大 Token 数 (Max Tokens)
                </label>
                <span className="text-xs font-medium text-primary">
                  {localConfig.deepseek?.maxTokens ?? 8192}
                </span>
              </div>
              <input
                type="range"
                min="1024"
                max="32768"
                step="1024"
                value={localConfig.deepseek?.maxTokens ?? 8192}
                onChange={(e) => handleDeepSeekMaxTokensChange(Number(e.target.value))}
                className="w-full h-2 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-primary"
                disabled={loading}
              />
              <div className="flex justify-between text-xs text-text-tertiary mt-1">
                <span>1K</span>
                <span>16K</span>
                <span>32K</span>
              </div>
            </div>

            {/* 成本提示 */}
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p className="text-xs text-text-primary">
                    <span className="font-medium">成本优势：</span>DeepSeek 价格约为 Claude 的 1-2%
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">
                    输入 ¥0.14/1M tokens，输出 ¥0.28/1M tokens
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 悬浮窗配置 */}
        <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-3">悬浮窗设置</h3>

          {/* 启用悬浮窗 */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-text-primary">启用悬浮窗</div>
              <div className="text-xs text-text-secondary">鼠标移出时显示精简悬浮窗</div>
            </div>
            <button
              type="button"
              onClick={() => handleFloatingWindowEnabledChange(!localConfig.floatingWindow.enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                localConfig.floatingWindow.enabled ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  localConfig.floatingWindow.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 悬浮窗模式 */}
          {localConfig.floatingWindow.enabled && (
            <>
              <div className="mb-4">
                <div className="text-xs text-text-secondary mb-2">悬浮窗模式</div>
                <div className="space-y-2">
                  {FLOATING_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleFloatingWindowModeChange(option.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        localConfig.floatingWindow.mode === option.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border-subtle hover:border-primary/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-sm text-text-primary">{option.name}</div>
                          <div className="text-xs text-text-secondary mt-0.5">{option.description}</div>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ml-2 ${
                          localConfig.floatingWindow.mode === option.id
                            ? 'border-primary'
                            : 'border-border'
                        }`}>
                          {localConfig.floatingWindow.mode === option.id && (
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 移动到悬浮窗时展开 */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-text-primary">移动到悬浮窗时展开</div>
                  <div className="text-xs text-text-secondary">鼠标移到悬浮窗时自动展开主窗口</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleFloatingWindowExpandOnHoverChange(!localConfig.floatingWindow.expandOnHover)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    localConfig.floatingWindow.expandOnHover ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      localConfig.floatingWindow.expandOnHover ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 自动切换延迟 */}
              {localConfig.floatingWindow.mode === 'auto' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm text-text-primary">切换延迟</div>
                      <div className="text-xs text-text-secondary">鼠标移出主窗口后切换到悬浮窗的延迟时长</div>
                    </div>
                    <div className="text-sm font-medium text-primary">
                      {localConfig.floatingWindow.collapseDelay} ms
                    </div>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="3000"
                    step="100"
                    value={localConfig.floatingWindow.collapseDelay}
                    onChange={(e) => handleFloatingWindowCollapseDelayChange(Number(e.target.value))}
                    className="w-full h-2 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-xs text-text-tertiary mt-1">
                    <span>100ms</span>
                    <span>3000ms</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 百度翻译配置 */}
        <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-3">百度翻译</h3>
          <p className="text-xs text-text-secondary mb-4">
            配置百度翻译 API 后，可在发送消息时一键翻译为英语
          </p>

          <div className="mb-4">
            <label className="block text-xs text-text-secondary mb-2">
              App ID
            </label>
            <input
              type="text"
              value={localConfig.baiduTranslate?.appId || ''}
              onChange={(e) => handleBaiduTranslateAppIdChange(e.target.value)}
              placeholder="百度翻译 App ID"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={loading}
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs text-text-secondary mb-2">
              密钥 (Secret Key)
            </label>
            <input
              type="password"
              value={localConfig.baiduTranslate?.secretKey || ''}
              onChange={(e) => handleBaiduTranslateSecretKeyChange(e.target.value)}
              placeholder="百度翻译密钥"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={loading}
            />
          </div>

          <p className="text-xs text-text-tertiary">
            在 <a href="https://fanyi-api.baidu.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">百度翻译开放平台</a> 申请 API 接入
          </p>
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
            className="min-w-[80px]"
          >
            {loading ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}
