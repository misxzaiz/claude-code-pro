/**
 * DeepSeek Native Engine
 *
 * 原生 DeepSeek API 引擎实现，直接调用 DeepSeek API。
 * 支持工具调用、流式响应、上下文管理。
 *
 * @author Polaris Team
 * @since 2025-01-24
 */

import type {
  AIEngine,
  AISession,
  EngineCapabilities,
} from '../../ai-runtime'
import { createCapabilities } from '../../ai-runtime'
import { DeepSeekSession, type DeepSeekSessionConfig } from './session'

/**
 * DeepSeek 模型类型
 */
export type DeepSeekModel = 'deepseek-chat' | 'deepseek-coder' | 'deepseek-reasoner'

/**
 * DeepSeek Engine 配置
 */
export interface DeepSeekEngineConfig {
  /** API Key (必填) */
  apiKey: string
  /** API Base URL (可选，默认为官方 API) */
  apiBase?: string
  /** 默认模型 (可选，默认为 deepseek-coder) */
  model?: DeepSeekModel
  /** 温度参数 (0-2，可选，默认 0.7) */
  temperature?: number
  /** 最大 Token 数 (可选，默认 8192) */
  maxTokens?: number
  /** 默认工作区路径 (可选) */
  workspaceDir?: string
  /** 请求超时时间 (毫秒，可选，默认 60000) */
  timeout?: number
}

/**
 * DeepSeek 引擎默认配置
 */
const DEFAULT_CONFIG = {
  apiBase: 'https://api.deepseek.com',
  model: 'deepseek-coder' as DeepSeekModel,
  temperature: 0.7,
  maxTokens: 8192,
  timeout: 300000,   // 提高到 120 秒，适应大响应
}

/**
 * DeepSeek 原生引擎
 *
 * 核心职责：
 * - 管理 DeepSeek API 连接
 * - 创建和管理会话
 * - 提供引擎级别的配置
 *
 * @example
 * ```typescript
 * const engine = new DeepSeekEngine({
 *   apiKey: 'your-api-key',
 *   model: 'deepseek-coder',
 * })
 *
 * const session = engine.createSession()
 * await session.run({ prompt: '帮我写一个 React 计数器' })
 * ```
 */
export class DeepSeekEngine implements AIEngine {
  /** 引擎唯一标识 */
  readonly id = 'deepseek'

  /** 引擎显示名称 */
  readonly name = 'DeepSeek'

  /** 引擎能力描述 */
  readonly capabilities: EngineCapabilities

  /** 引擎配置 */
  private config: Required<DeepSeekEngineConfig>

  /** 活跃会话映射表 */
  private sessions = new Map<string, DeepSeekSession>()

  /** 会话计数器 (用于生成唯一 ID) */
  private sessionCounter = 0

  /**
   * 构造函数
   *
   * @param config - 引擎配置
   * @throws {Error} 如果未提供 API Key
   */
  constructor(config: DeepSeekEngineConfig) {
    // 验证必填参数
    if (!config.apiKey) {
      throw new Error('[DeepSeekEngine] API Key is required')
    }

    // 合并默认配置
    this.config = {
      apiKey: config.apiKey,
      apiBase: config.apiBase || DEFAULT_CONFIG.apiBase,
      model: config.model || DEFAULT_CONFIG.model,
      temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
      maxTokens: config.maxTokens ?? DEFAULT_CONFIG.maxTokens,
      workspaceDir: config.workspaceDir || '',
      timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
    }

    // 初始化能力描述
    this.capabilities = createCapabilities({
      supportedTaskKinds: ['chat', 'codegen', 'analyze', 'refactor', 'debug'],
      supportsStreaming: true,
      supportsConcurrentSessions: true,
      supportsTaskAbort: true,
      maxConcurrentSessions: 0, // 无限制
      description: 'DeepSeek - 高性能 AI 编程助手（国产大模型，成本仅为 Claude 的 1/10）',
      version: '1.0.0',
    })

    console.log('[DeepSeekEngine] Engine initialized', {
      model: this.config.model,
      apiBase: this.config.apiBase,
    })
  }

  /**
   * 创建新会话
   *
   * @param config - 会话级别的配置（可选，会覆盖引擎级别配置）
   * @returns 新的会话实例
   */
  createSession(config?: Partial<DeepSeekEngineConfig>): AISession {
    const sessionId = this.generateSessionId()

    // 合并引擎配置和会话级别的配置（会话配置优先级更高）
    const sessionConfig: DeepSeekSessionConfig = {
      apiKey: this.config.apiKey,
      apiBase: this.config.apiBase,
      model: config?.model || this.config.model,
      temperature: config?.temperature ?? this.config.temperature,
      maxTokens: config?.maxTokens ?? this.config.maxTokens,
      workspaceDir: config?.workspaceDir || this.config.workspaceDir,
      timeout: config?.timeout ?? this.config.timeout,
    }

    console.log(`[DeepSeekEngine] Creating session ${sessionId}:`, {
      engineWorkspaceDir: this.config.workspaceDir,
      sessionWorkspaceDir: config?.workspaceDir,
      finalWorkspaceDir: sessionConfig.workspaceDir,
    })

    const session = new DeepSeekSession(sessionId, sessionConfig)

    // 监听会话销毁事件，自动清理
    session.onEvent((event) => {
      if (event.type === 'session_end') {
        // 延迟清理，给事件处理留出时间
        setTimeout(() => {
          // 检查会话状态，如果已完成则清理
          if (session.status === 'idle') {
            this.sessions.delete(sessionId)
            console.log(`[DeepSeekEngine] Session ${sessionId} cleaned up`)
          }
        }, 5000)
      }
    })

    this.sessions.set(sessionId, session)

    console.log(`[DeepSeekEngine] Session created: ${sessionId}`, {
      workspaceDir: sessionConfig.workspaceDir,
    })
    return session
  }

  /**
   * 检查引擎是否可用
   *
   * 通过调用 DeepSeek API 的 models 端点来验证连接
   *
   * @returns 引擎是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.apiBase}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        signal: AbortSignal.timeout(5000), // 5 秒超时
      })

      const available = response.ok

      if (!available) {
        console.warn('[DeepSeekEngine] API check failed:', response.status, response.statusText)
      }

      return available
    } catch (error) {
      console.error('[DeepSeekEngine] API check error:', error)
      return false
    }
  }

  /**
   * 初始化引擎
   *
   * 在首次使用前检查 API 可用性
   *
   * @returns 初始化是否成功
   */
  async initialize(): Promise<boolean> {
    console.log('[DeepSeekEngine] Initializing...')

    const available = await this.isAvailable()

    if (available) {
      console.log('[DeepSeekEngine] Initialized successfully')
    } else {
      console.error('[DeepSeekEngine] Initialization failed - API unavailable')
    }

    return available
  }

  /**
   * 清理引擎资源
   *
   * 销毁所有活跃会话
   */
  cleanup(): void {
    console.log('[DeepSeekEngine] Cleaning up...')

    this.sessions.forEach((session, sessionId) => {
      console.log(`[DeepSeekEngine] Disposing session: ${sessionId}`)
      session.dispose()
    })

    this.sessions.clear()
    console.log('[DeepSeekEngine] Cleanup complete')
  }

  /**
   * 获取当前活跃会话数量
   *
   * @returns 活跃会话数量
   */
  get activeSessionCount(): number {
    let count = 0
    this.sessions.forEach((session) => {
      if (session.status !== 'disposed') {
        count++
      }
    })
    return count
  }

  /**
   * 获取所有会话
   *
   * @returns 所有会话列表
   */
  getSessions(): DeepSeekSession[] {
    return Array.from(this.sessions.values())
  }

  /**
   * 获取引擎配置 (只读)
   *
   * @returns 引擎配置副本
   */
  getConfig(): Readonly<Required<DeepSeekEngineConfig>> {
    return { ...this.config }
  }

  /**
   * 更新引擎配置
   *
   * @param updates - 要更新的配置项
   */
  updateConfig(updates: Partial<DeepSeekEngineConfig>): void {
    if (updates.apiKey) {
      this.config.apiKey = updates.apiKey
    }
    if (updates.apiBase) {
      this.config.apiBase = updates.apiBase
    }
    if (updates.model) {
      this.config.model = updates.model
    }
    if (updates.temperature !== undefined) {
      this.config.temperature = updates.temperature
    }
    if (updates.maxTokens !== undefined) {
      this.config.maxTokens = updates.maxTokens
    }
    if (updates.workspaceDir !== undefined) {
      this.config.workspaceDir = updates.workspaceDir
    }
    if (updates.timeout !== undefined) {
      this.config.timeout = updates.timeout
    }

    console.log('[DeepSeekEngine] Config updated', updates)
  }

  /**
   * 生成唯一会话 ID
   *
   * 格式: `deepseek-{timestamp}-{counter}`
   *
   * @returns 会话 ID
   */
  private generateSessionId(): string {
    return `deepseek-${Date.now()}-${++this.sessionCounter}`
  }
}

/**
 * DeepSeek Engine 单例实例
 */
let engineInstance: DeepSeekEngine | null = null

/**
 * 获取 DeepSeek Engine 单例
 *
 * @param config - 引擎配置（首次调用时必填）
 * @returns DeepSeek Engine 实例
 */
export function getDeepSeekEngine(config?: DeepSeekEngineConfig): DeepSeekEngine {
  if (!engineInstance) {
    if (!config) {
      throw new Error('[getDeepSeekEngine] Config required for first initialization')
    }
    engineInstance = new DeepSeekEngine(config)
  }
  return engineInstance
}

/**
 * 重置 DeepSeek Engine 单例
 *
 * 主要用于测试和重新初始化
 */
export function resetDeepSeekEngine(): void {
  if (engineInstance) {
    engineInstance.cleanup()
    engineInstance = null
  }
}

/**
 * 检查是否已初始化 DeepSeek Engine
 *
 * @returns 是否已初始化
 */
export function hasDeepSeekEngine(): boolean {
  return engineInstance !== null
}
