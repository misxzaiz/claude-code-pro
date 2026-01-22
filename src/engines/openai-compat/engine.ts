/**
 * OpenAI 兼容引擎 - 引擎实现
 *
 * 实现 AIEngine 接口，提供 OpenAI 兼容 API 的访问能力。
 */

import type {
  AIEngine,
  EngineCapabilities,
  AISession,
  AISessionConfig
} from '../../ai-runtime'
import { createCapabilities } from '../../ai-runtime/engine'
import type { OpenAICompatConfig } from './types'
import { validateConfig } from './types'
import { OpenAICompatSession } from './session'

/**
 * OpenAI 兼容引擎
 */
export class OpenAICompatEngine implements AIEngine {
  readonly id = 'openai-compat'
  readonly name: string
  readonly capabilities: EngineCapabilities

  private config: OpenAICompatConfig
  private initialized = false

  constructor(config?: Partial<OpenAICompatConfig>) {
    this.config = this.mergeConfig(config)
    this.name = this.getEngineName()
    this.capabilities = this.createCapabilities()
  }

  /**
   * 创建会话
   */
  createSession(sessionConfig?: AISessionConfig): AISession {
    return new OpenAICompatSession(sessionConfig, this.config)
  }

  /**
   * 检查是否可用
   *
   * 注意：不直接调用 API，只检查配置是否完整
   * 实际验证应该在首次聊天时通过后端进行
   */
  async isAvailable(): Promise<boolean> {
    // 只检查配置是否完整，不调用 API（避免 CORS）
    const validation = validateConfig(this.config)
    if (!validation.valid) {
      return false
    }

    // 检查是否有 API Key
    return !!this.config.apiKey
  }

  /**
   * 初始化引擎
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true
    }

    // 验证配置
    const validation = validateConfig(this.config)
    if (!validation.valid) {
      console.warn(`[OpenAICompatEngine] 配置无效: ${validation.error}`)
      return false
    }

    // 检查可用性
    const available = await this.isAvailable()
    if (!available) {
      console.warn('[OpenAICompatEngine] 引擎不可用，请检查配置')
      return false
    }

    this.initialized = true
    return true
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.initialized = false
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<OpenAICompatConfig>): void {
    this.config = this.mergeConfig(config)
    this.name = this.getEngineName()
    this.capabilities = this.createCapabilities()
    this.initialized = false
  }

  /**
   * 获取当前配置
   */
  getConfig(): OpenAICompatConfig {
    return { ...this.config }
  }

  /**
   * 合并配置
   */
  private mergeConfig(config?: Partial<OpenAICompatConfig>): OpenAICompatConfig {
    const defaults: OpenAICompatConfig = {
      apiKey: '',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 4096,
      stream: true,
      enableTools: true,
      timeout: 60000,
    }

    return { ...defaults, ...config }
  }

  /**
   * 获取引擎名称（根据配置）
   */
  private getEngineName(): string {
    const { baseURL, model } = this.config

    // 根据 baseURL 推断服务名称
    if (baseURL.includes('api.openai.com')) {
      return `OpenAI (${model})`
    }
    if (baseURL.includes('api.deepseek.com')) {
      return `DeepSeek (${model})`
    }
    if (baseURL.includes('openrouter.ai')) {
      return `OpenRouter (${model})`
    }

    return `OpenAI Compatible (${model})`
  }

  /**
   * 创建引擎能力描述
   */
  private createCapabilities(): EngineCapabilities {
    return createCapabilities({
      description: `${this.name} - 支持所有兼容 OpenAI API 协议的服务`,
      version: '1.0.0',

      // 支持的任务类型
      supportedTaskKinds: ['chat', 'generate', 'refactor', 'analyze'],

      // 流式输出
      supportsStreaming: this.config.stream !== false,

      // 并发会话
      supportsConcurrentSessions: true,
      maxConcurrentSessions: 0, // 无限制

      // 任务中断
      supportsTaskAbort: true,
    })
  }
}

/**
 * 创建引擎实例
 */
export function createOpenAICompatEngine(
  config?: Partial<OpenAICompatConfig>
): OpenAICompatEngine {
  return new OpenAICompatEngine(config)
}

/**
 * 根据预设创建引擎实例
 */
export function createEngineFromPreset(
  presetName: string,
  apiKey: string,
  overrides?: Partial<OpenAICompatConfig>
): OpenAICompatEngine {
  const { createConfigFromPreset, getPresetByName } = require('./types')
  const preset = getPresetByName(presetName)

  if (!preset) {
    throw new Error(`Unknown preset: ${presetName}`)
  }

  const config = createConfigFromPreset(presetName, apiKey, overrides)
  return new OpenAICompatEngine(config)
}
