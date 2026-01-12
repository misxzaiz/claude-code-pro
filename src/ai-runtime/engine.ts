/**
 * AI Engine - AI 引擎抽象
 *
 * 定义了 AI Engine 的顶层能力接口。
 * 每个 AI 实现都必须实现此接口。
 */

import type { AISession, AISessionConfig } from './session'

/**
 * Engine 能力描述
 */
export interface EngineCapabilities {
  /** 支持的任务类型 */
  supportedTaskKinds: string[]
  /** 是否支持流式输出 */
  supportsStreaming: boolean
  /** 是否支持多会话并发 */
  supportsConcurrentSessions: boolean
  /** 是否支持任务中断 */
  supportsTaskAbort: boolean
  /** 最大并发会话数（0 表示无限制） */
  maxConcurrentSessions: number
  /** Engine 描述信息 */
  description: string
  /** Engine 版本 */
  version: string
}

/**
 * AI Engine 接口
 *
 * 这是 AI Runtime 的顶层抽象。
 * 所有 AI 实现（Claude Code、OpenAI、本地 LLM 等）都必须实现此接口。
 *
 * UI 层只依赖此接口，不关心具体是哪个 AI 实现。
 */
export interface AIEngine {
  /** Engine 唯一标识（如 'claude-code', 'openai'） */
  readonly id: string

  /** Engine 显示名称 */
  readonly name: string

  /** Engine 能力描述 */
  readonly capabilities: EngineCapabilities

  /**
   * 创建新的会话
   * @param config 会话配置
   * @returns 新的会话实例
   */
  createSession(config?: AISessionConfig): AISession

  /**
   * 检查 Engine 是否可用
   * @returns 是否可用
   */
  isAvailable(): Promise<boolean> | boolean

  /**
   * 初始化 Engine（如检查依赖、配置等）
   * @returns 是否初始化成功
   */
  initialize?(): Promise<boolean> | boolean

  /**
   * 清理 Engine 资源
   */
  cleanup?(): Promise<void> | void
}

/**
 * Engine 描述符
 *
 * 用于 Engine 注册和发现。
 */
export interface EngineDescriptor {
  /** Engine ID */
  id: string
  /** Engine 名称 */
  name: string
  /** Engine 描述 */
  description: string
  /** Engine 版本 */
  version: string
  /** Engine 图标 URL（可选） */
  iconUrl?: string
  /** Engine 主页 URL（可选） */
  homepageUrl?: string
}

/**
 * Engine 工厂函数类型
 */
export type AIEngineFactory = () => AIEngine

/**
 * 引擎注册表
 *
 * 管理所有可用的 AI Engine。
 */
export class EngineRegistry {
  private static engines = new Map<string, AIEngine>()
  private static factories = new Map<string, AIEngineFactory>()

  /**
   * 注册 Engine
   */
  static register(engine: AIEngine): void {
    this.engines.set(engine.id, engine)
  }

  /**
   * 注册 Engine 工厂
   */
  static registerFactory(id: string, factory: AIEngineFactory): void {
    this.factories.set(id, factory)
  }

  /**
   * 获取 Engine
   */
  static get(id: string): AIEngine | undefined {
    return this.engines.get(id)
  }

  /**
   * 获取或创建 Engine
   */
  static getOrCreate(id: string): AIEngine | undefined {
    let engine = this.engines.get(id)
    if (!engine) {
      const factory = this.factories.get(id)
      if (factory) {
        engine = factory()
        this.engines.set(id, engine)
      }
    }
    return engine
  }

  /**
   * 获取所有已注册的 Engine
   */
  static getAll(): AIEngine[] {
    return Array.from(this.engines.values())
  }

  /**
   * 获取所有 Engine 描述符
   */
  static getDescriptors(): EngineDescriptor[] {
    return Array.from(this.engines.values()).map((engine) => ({
      id: engine.id,
      name: engine.name,
      description: engine.capabilities.description,
      version: engine.capabilities.version,
    }))
  }

  /**
   * 检查 Engine 是否已注册
   */
  static has(id: string): boolean {
    return this.engines.has(id) || this.factories.has(id)
  }

  /**
   * 注销 Engine
   */
  static unregister(id: string): boolean {
    const engine = this.engines.get(id)
    if (engine?.cleanup) {
      engine.cleanup()
    }
    return this.engines.delete(id) || this.factories.delete(id)
  }

  /**
   * 清空所有 Engine
   */
  static clear(): void {
    this.engines.forEach((engine) => {
      if (engine.cleanup) {
        engine.cleanup()
      }
    })
    this.engines.clear()
    this.factories.clear()
  }
}

/**
 * 创建基础能力的辅助函数
 */
export function createCapabilities(
  partial: Partial<EngineCapabilities>
): EngineCapabilities {
  return {
    supportedTaskKinds: ['chat'],
    supportsStreaming: false,
    supportsConcurrentSessions: false,
    supportsTaskAbort: false,
    maxConcurrentSessions: 1,
    description: '',
    version: '1.0.0',
    ...partial,
  }
}
