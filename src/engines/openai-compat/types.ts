/**
 * OpenAI 兼容 API 类型定义
 *
 * 定义所有与 OpenAI API 兼容的接口、类型和配置。
 * 支持所有兼容 OpenAI 协议的服务（OpenAI、DeepSeek、OpenRouter 等）。
 */

/**
 * OpenAI 兼容 API 配置
 */
export interface OpenAICompatConfig {
  // ========== 基础配置 ==========
  /** API 密钥 */
  apiKey: string

  /** API 基础 URL（可选，用于自定义端点） */
  baseURL?: string

  /** 使用的模型 */
  model: string

  // ========== 模型配置 ==========
  /** 生成温度 (0-2)，默认 0.7 */
  temperature?: number

  /** 最大生成 tokens，默认 4096 */
  maxTokens?: number

  /** Top-P 采样，默认 1.0 */
  topP?: number

  // ========== 高级配置 ==========
  /** 是否启用流式输出，默认 true */
  stream?: boolean

  /** 是否启用工具调用（Function Calling），默认 true */
  enableTools?: boolean

  /** 请求超时时间（毫秒），默认 60000 */
  timeout?: number

  // ========== 代理配置 ==========
  /** 代理服务器地址 */
  proxy?: string

  // ========== 自定义头部 ==========
  /** 自定义 HTTP 头部 */
  headers?: Record<string, string>
}

/**
 * 支持的预设配置
 */
export interface OpenAICompatPreset {
  /** 预设名称（唯一标识） */
  name: string

  /** 显示名称 */
  displayName: string

  /** 预设描述 */
  description?: string

  /** API 配置模板（apiKey 需要用户填写） */
  config: Omit<OpenAICompatConfig, 'apiKey'>

  /** 支持的工具列表（可选，不传则使用全部工具） */
  supportedTools?: string[]

  /** 推荐的模型列表 */
  recommendedModels?: string[]
}

/**
 * 预设配置集合
 */
export const OPENAI_COMPAT_PRESETS: OpenAICompatPreset[] = [
  {
    name: 'openai-gpt4o',
    displayName: 'OpenAI GPT-4o',
    description: 'OpenAI 最新旗舰模型，支持多模态和工具调用',
    config: {
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 4096,
      stream: true,
      enableTools: true,
    },
    recommendedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  {
    name: 'deepseek-coder',
    displayName: 'DeepSeek Coder',
    description: 'DeepSeek 专业代码模型，性价比高',
    config: {
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-coder',
      temperature: 0.3,
      maxTokens: 8192,
      stream: true,
      enableTools: true,
    },
    recommendedModels: ['deepseek-coder', 'deepseek-coder-v2'],
  },
  {
    name: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
    description: 'DeepSeek 通用对话模型',
    config: {
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      temperature: 0.7,
      maxTokens: 8192,
      stream: true,
      enableTools: true,
    },
    recommendedModels: ['deepseek-chat'],
  },
  {
    name: 'openrouter',
    displayName: 'OpenRouter (多模型)',
    description: '聚合多种 AI 模型的服务',
    config: {
      baseURL: 'https://openrouter.ai/api/v1',
      model: 'anthropic/claude-3.5-sonnet',
      temperature: 0.7,
      maxTokens: 4096,
      stream: true,
      enableTools: true,
    },
  },
]

/**
 * 工具定义（OpenAI Function Calling 格式）
 */
export interface OpenAIToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: {
      type: 'object'
      properties: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object'
        description?: string
        enum?: string[]
        items?: {
          type: string
        }
      }>
      required?: string[]
      additionalProperties?: boolean
    }
  }
}

/**
 * API 请求消息格式
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

/**
 * 工具调用
 */
export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/**
 * 流式响应 chunk 格式
 */
export interface OpenAIStreamChunk {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: string
      content?: string
      tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null
  }>
}

/**
 * 非流式响应格式
 */
export interface OpenAICompletionResponse {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: string
      content?: string
      tool_calls?: OpenAIToolCall[]
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * API 请求错误
 */
export interface OpenAIError {
  message: string
  type: string
  param?: string
  code?: string
}

/**
 * 根据 preset 名称获取配置
 */
export function getPresetByName(name: string): OpenAICompatPreset | undefined {
  return OPENAI_COMPAT_PRESETS.find(preset => preset.name === name)
}

/**
 * 根据 preset 名称创建配置
 */
export function createConfigFromPreset(
  presetName: string,
  apiKey: string,
  overrides?: Partial<OpenAICompatConfig>
): OpenAICompatConfig {
  const preset = getPresetByName(presetName)
  if (!preset) {
    throw new Error(`Unknown preset: ${presetName}`)
  }

  return {
    apiKey,
    ...preset.config,
    ...overrides,
  }
}

/**
 * 验证配置是否完整
 */
export function validateConfig(config: OpenAICompatConfig): { valid: boolean; error?: string } {
  if (!config.apiKey) {
    return { valid: false, error: 'API Key is required' }
  }

  if (!config.baseURL) {
    return { valid: false, error: 'Base URL is required' }
  }

  if (!config.model) {
    return { valid: false, error: 'Model is required' }
  }

  try {
    new URL(config.baseURL)
  } catch {
    return { valid: false, error: 'Invalid Base URL' }
  }

  if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
    return { valid: false, error: 'Temperature must be between 0 and 2' }
  }

  if (config.maxTokens !== undefined && config.maxTokens <= 0) {
    return { valid: false, error: 'Max tokens must be positive' }
  }

  return { valid: true }
}
