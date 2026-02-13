import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '../../stores';
import { Button, ClaudePathSelector, LanguageSwitcher } from '../Common';
import type { Config, EngineId, FloatingWindowMode, Language } from '../../types';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');

  const ENGINE_OPTIONS: { id: EngineId; name: string; description: string }[] = [
    {
      id: 'claude-code',
      name: 'Claude Code',
      description: t('engines.claudeCode.description'),
    },
    {
      id: 'iflow',
      name: 'IFlow',
      description: t('engines.iflow.description'),
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      description: t('engines.deepseek.description'),
    },
  ];

  const FLOATING_MODE_OPTIONS: { id: FloatingWindowMode; name: string; description: string }[] = [
    {
      id: 'auto',
      name: t('floatingWindow.modes.auto'),
      description: t('floatingWindow.modes.autoDesc'),
    },
    {
      id: 'manual',
      name: t('floatingWindow.modes.manual'),
      description: t('floatingWindow.modes.manualDesc'),
    },
  ];

  const { config, loading, error, updateConfig } = useConfigStore();
  const [localConfig, setLocalConfig] = useState<Config | null>(config);

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
      console.error('Failed to save config:', error);
    }
  };

  const handleEngineChange = (engineId: EngineId) => {
    if (!localConfig) return;
    setLocalConfig({ ...localConfig, defaultEngine: engineId });
  };

  const handleLanguageChange = (language: Language) => {
    if (!localConfig) return;
    setLocalConfig({ ...localConfig, language });
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
          <div className="text-center">{tCommon('status.loading')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-elevated rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto shadow-soft">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary">{t('title')}</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-danger-faint border border-danger/30 rounded-lg text-danger text-sm">
            {error}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-text-secondary mb-3">
            {t('aiEngine')}
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

        {localConfig.defaultEngine === 'claude-code' && (
          <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-3">{t('claudeCode.title')}</h3>
            <div>
              <label className="block text-xs text-text-secondary mb-2">
                {t('claudeCode.cliPath')}
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

        {localConfig.defaultEngine === 'iflow' && (
          <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-3">{t('iflow.title')}</h3>
            <div>
              <label className="block text-xs text-text-secondary mb-2">
                {t('iflow.cliPath')}
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

        {localConfig.defaultEngine === 'deepseek' && (
          <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-3">{t('deepseek.title')}</h3>

            <div className="mb-4">
              <label className="block text-xs text-text-secondary mb-2">
                {t('deepseek.apiKey')} <span className="text-danger">*</span>
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
                {t('deepseek.apiKeyHint')} <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">DeepSeek {t('deepseek.platform')}</a>
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-text-secondary mb-2">
                {t('deepseek.model')}
              </label>
              <select
                value={localConfig.deepseek?.model || 'deepseek-coder'}
                onChange={(e) => handleDeepSeekModelChange(e.target.value as any)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={loading}
              >
                <option value="deepseek-chat">{t('deepseek.models.chat')}</option>
                <option value="deepseek-coder">{t('deepseek.models.coder')}</option>
                <option value="deepseek-reasoner">{t('deepseek.models.reasoner')}</option>
              </select>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-text-secondary">
                  {t('deepseek.temperature')}
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
                <span>0 ({t('deepseek.temperaturePrecise')})</span>
                <span>1 ({t('deepseek.temperatureBalanced')})</span>
                <span>2 ({t('deepseek.temperatureCreative')})</span>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-text-secondary">
                  {t('deepseek.maxTokens')}
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

            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p className="text-xs text-text-primary">
                    <span className="font-medium">{t('deepseek.costAdvantage')}</span>{t('deepseek.costDetail')}
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">
                    {t('deepseek.pricing')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-3">{t('language.title')}</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-primary">{t('language.current')}</div>
              <div className="text-xs text-text-secondary">{t('language.hint')}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleLanguageChange('zh-CN')}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  (localConfig.language || 'zh-CN') === 'zh-CN'
                    ? 'bg-primary text-white'
                    : 'bg-background-surface border border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                中文
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('en-US')}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  localConfig.language === 'en-US'
                    ? 'bg-primary text-white'
                    : 'bg-background-surface border border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                English
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-3">{t('floatingWindow.title')}</h3>

          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-text-primary">{t('floatingWindow.enabled')}</div>
              <div className="text-xs text-text-secondary">{t('floatingWindow.enabledHint')}</div>
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

          {localConfig.floatingWindow.enabled && (
            <>
              <div className="mb-4">
                <div className="text-xs text-text-secondary mb-2">{t('floatingWindow.mode')}</div>
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

              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-text-primary">{t('floatingWindow.expandOnHover')}</div>
                  <div className="text-xs text-text-secondary">{t('floatingWindow.expandOnHoverHint')}</div>
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

              {localConfig.floatingWindow.mode === 'auto' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm text-text-primary">{t('floatingWindow.collapseDelay')}</div>
                      <div className="text-xs text-text-secondary">{t('floatingWindow.collapseDelayHint')}</div>
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

        <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-3">{t('baiduTranslate.title')}</h3>
          <p className="text-xs text-text-secondary mb-4">
            {t('baiduTranslate.hint')}
          </p>

          <div className="mb-4">
            <label className="block text-xs text-text-secondary mb-2">
              {t('baiduTranslate.appId')}
            </label>
            <input
              type="text"
              value={localConfig.baiduTranslate?.appId || ''}
              onChange={(e) => handleBaiduTranslateAppIdChange(e.target.value)}
              placeholder={t('baiduTranslate.appIdPlaceholder')}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={loading}
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs text-text-secondary mb-2">
              {t('baiduTranslate.secretKey')}
            </label>
            <input
              type="password"
              value={localConfig.baiduTranslate?.secretKey || ''}
              onChange={(e) => handleBaiduTranslateSecretKeyChange(e.target.value)}
              placeholder={t('baiduTranslate.secretKeyPlaceholder')}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={loading}
            />
          </div>

          <p className="text-xs text-text-tertiary">
            {t('baiduTranslate.applyHint')} <a href="https://fanyi-api.baidu.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t('baiduTranslate.platform')}</a>
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            {tCommon('buttons.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
            className="min-w-[80px]"
          >
            {loading ? tCommon('status.saving') : tCommon('buttons.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
