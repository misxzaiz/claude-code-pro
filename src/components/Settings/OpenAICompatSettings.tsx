/**
 * OpenAI 兼容引擎设置组件
 */

import { useEffect, useState } from 'react'
import { useOpenAICompatStore } from '../../stores/openaiCompatStore'
import { OPENAI_COMPAT_PRESETS } from '../../engines/openai-compat'
import type { OpenAIPreset } from '../../types'

interface OpenAICompatSettingsProps {
  /** 配置更新后的回调 */
  onConfigChange?: () => void
}

/** 预设选项 */
const PRESET_OPTIONS: { id: OpenAIPreset; name: string; description: string }[] = [
  {
    id: 'openai-gpt4o',
    name: 'OpenAI GPT-4o',
    description: 'OpenAI 最新旗舰模型，支持多模态和工具调用',
  },
  {
    id: 'deepseek-coder',
    name: 'DeepSeek Coder',
    description: 'DeepSeek 专业代码模型，性价比高',
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    description: 'DeepSeek 通用对话模型',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: '聚合多种 AI 模型的服务',
  },
  {
    id: 'custom',
    name: '自定义',
    description: '自定义 API 端点和模型',
  },
]

export function OpenAICompatSettings({ onConfigChange }: OpenAICompatSettingsProps) {
  const {
    config,
    loading,
    validating,
    validation,
    engineAvailable,
    error,
    loadConfig,
    updatePreset,
    updateApiKey,
    updateCustomConfig,
    validateApiKey,
  } = useOpenAICompatStore()

  const [localApiKey, setLocalApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [customBaseURL, setCustomBaseURL] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [customTemperature, setCustomTemperature] = useState(0.7)
  const [customMaxTokens, setCustomMaxTokens] = useState(4096)

  // 初始化加载配置
  useEffect(() => {
    loadConfig()
  }, [])

  // 同步配置到本地状态
  useEffect(() => {
    if (config) {
      setLocalApiKey(config.apiKey)
      if (config.customConfig) {
        setCustomBaseURL(config.customConfig.baseURL || '')
        setCustomModel(config.customConfig.model || '')
        setCustomTemperature(config.customConfig.temperature || 0.7)
        setCustomMaxTokens(config.customConfig.maxTokens || 4096)
      }
    }
  }, [config])

  // 获取当前预设信息
  const currentPreset = config ? OPENAI_COMPAT_PRESETS.find(p => p.name === config.preset) : null

  // 处理预设变更
  const handlePresetChange = async (preset: OpenAIPreset) => {
    await updatePreset(preset)
    onConfigChange?.()
  }

  // 处理 API Key 保存
  const handleSaveApiKey = async () => {
    await updateApiKey(localApiKey)
    onConfigChange?.()
  }

  // 处理自定义配置保存
  const handleSaveCustomConfig = async () => {
    await updateCustomConfig({
      baseURL: customBaseURL || undefined,
      model: customModel || undefined,
      temperature: customTemperature,
      maxTokens: customMaxTokens,
    })
    onConfigChange?.()
  }

  // 获取当前模型显示
  const getCurrentModel = () => {
    if (!config) return '未配置'

    if (config.preset === 'custom' && config.customConfig?.model) {
      return config.customConfig.model
    }

    const preset = OPENAI_COMPAT_PRESETS.find(p => p.name === config.preset)
    return preset?.config.model || '未配置'
  }

  return (
    <div className="space-y-4">
      {/* 标题和状态 */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">OpenAI 兼容 API 配置</h3>
        {validation && (
          <div className={`text-sm ${validation.valid ? 'text-green-500' : 'text-red-500'}`}>
            {validation.valid ? '✓ 配置有效' : `✗ ${validation.error}`}
          </div>
        )}
      </div>

      {/* 预设选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          预设配置
        </label>
        <select
          value={config?.preset || 'deepseek-coder'}
          onChange={(e) => handlePresetChange(e.target.value as OpenAIPreset)}
          disabled={loading}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
        >
          {PRESET_OPTIONS.map(option => (
            <option key={option.id} value={option.id}>
              {option.name} - {option.description}
            </option>
          ))}
        </select>
      </div>

      {/* 当前模型显示 */}
      {config && config.preset !== 'custom' && (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            当前模型: <span className="font-mono font-medium">{getCurrentModel()}</span>
          </div>
        </div>
      )}

      {/* API Key */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          API Key
        </label>
        <div className="flex gap-2">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={localApiKey}
            onChange={(e) => setLocalApiKey(e.target.value)}
            placeholder="输入 API Key"
            disabled={loading}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            {showApiKey ? '隐藏' : '显示'}
          </button>
          <button
            onClick={handleSaveApiKey}
            disabled={loading || !localApiKey}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-md text-sm font-medium disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>

      {/* 自定义配置（仅在自定义模式下显示） */}
      {config?.preset === 'custom' && (
        <div className="space-y-4 p-4 border border-gray-300 dark:border-gray-600 rounded-md">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">自定义配置</h4>

          {/* API 基础 URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API 基础 URL
            </label>
            <input
              type="text"
              value={customBaseURL}
              onChange={(e) => setCustomBaseURL(e.target.value)}
              placeholder="https://api.openai.com/v1"
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
          </div>

          {/* 模型名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              模型名称
            </label>
            <input
              type="text"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="gpt-4o-mini"
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
          </div>

          {/* 温度 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              温度: {customTemperature}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={customTemperature}
              onChange={(e) => setCustomTemperature(parseFloat(e.target.value))}
              disabled={loading}
              className="w-full"
            />
          </div>

          {/* 最大 Tokens */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              最大 Tokens
            </label>
            <input
              type="number"
              min="1"
              max="128000"
              value={customMaxTokens}
              onChange={(e) => setCustomMaxTokens(parseInt(e.target.value) || 4096)}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
          </div>

          {/* 保存自定义配置按钮 */}
          <button
            onClick={handleSaveCustomConfig}
            disabled={loading}
            className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium disabled:opacity-50"
          >
            保存自定义配置
          </button>
        </div>
      )}

      {/* 验证按钮 */}
      <div className="flex gap-2">
        <button
          onClick={validateApiKey}
          disabled={loading || validating || !config?.apiKey}
          className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-md text-sm font-medium disabled:opacity-50"
        >
          {validating ? '验证中...' : '验证 API Key'}
        </button>
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* 帮助信息 */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          <strong>提示:</strong> API Key 将被安全存储在本地配置中。
          不同预设使用不同的 API 端点，请确保使用正确的 API Key。
        </p>
      </div>
    </div>
  )
}
