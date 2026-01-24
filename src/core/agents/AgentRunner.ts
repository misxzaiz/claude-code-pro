/**
 * Agent Runner 接口
 *
 * 所有 Agent（Claude Code / iFlow / 未来扩展）必须实现此接口
 */

import type { AIEvent } from '../../ai-runtime/event'

/**
 * Agent 输入
 */
export interface AgentInput {
  /** 用户输入/Prompt */
  prompt: string

  /** 关联的文件 */
  files?: string[]

  /** 工作区路径 */
  workspacePath?: string

  /** 自定义选项 */
  options?: Record<string, unknown>
}

/**
 * Agent 输出（非流式，用于简单场景）
 */
export interface AgentOutput {
  /** 执行是否成功 */
  success: boolean

  /** 最终消息（Assistant 回复） */
  message?: string

  /** 工具调用列表 */
  toolCalls?: unknown[]

  /** 文件变更列表 */
  fileChanges?: unknown[]

  /** 错误信息 */
  error?: string
}

/**
 * Agent 能力描述
 */
export interface AgentCapabilities {
  /** Agent ID */
  id: string

  /** Agent 显示名称 */
  name: string

  /** Agent 描述 */
  description?: string

  /** Agent 版本 */
  version?: string

  /** 支持的任务类型 */
  supportedTaskKinds: string[]

  /** 是否支持流式输出 */
  supportsStreaming: boolean

  /** 是否支持并发会话 */
  supportsConcurrentSessions: boolean

  /** 是否支持任务中断 */
  supportsTaskAbort: boolean

  /** 最大并发会话数（0 表示无限制） */
  maxConcurrentSessions: number
}

/**
 * Agent Runner 接口
 *
 * 所有 Agent 必须实现此接口，提供统一的执行接口。
 */
export interface AgentRunner {
  /**
   * Agent 唯一标识
   */
  readonly id: string

  /**
   * Agent 显示名称
   */
  readonly name: string

  /**
   * Agent 能力描述
   */
  readonly capabilities: AgentCapabilities

  /**
   * 执行 Agent（流式）
   *
   * @param input 输入参数
   * @returns 异步事件流
   */
  run(input: AgentInput): AsyncIterable<AIEvent>

  /**
   * 中断执行
   */
  abort(): void

  /**
   * 检查 Agent 是否可用
   */
  isAvailable(): Promise<boolean>

  /**
   * 初始化 Agent（可选）
   */
  initialize?(): Promise<boolean>

  /**
   * 清理资源（可选）
   */
  cleanup?(): void
}

/**
 * Agent 注册表
 *
 * 管理所有已注册的 Agent Runner
 */
export class AgentRegistry {
  private static agents = new Map<string, AgentRunner>()

  /**
   * 注册 Agent
   *
   * @param agent Agent Runner 实例
   */
  static register(agent: AgentRunner): void {
    if (this.agents.has(agent.id)) {
      console.warn(`[AgentRegistry] Agent already registered: ${agent.id}, overwriting...`)
    }
    this.agents.set(agent.id, agent)
    console.log(`[AgentRegistry] Agent registered: ${agent.name} (${agent.id})`)
  }

  /**
   * 注销 Agent
   *
   * @param id Agent ID
   */
  static unregister(id: string): void {
    const agent = this.agents.get(id)
    if (agent?.cleanup) {
      agent.cleanup()
    }
    this.agents.delete(id)
    console.log(`[AgentRegistry] Agent unregistered: ${id}`)
  }

  /**
   * 获取 Agent
   *
   * @param id Agent ID
   * @returns Agent Runner 实例
   * @throws 如果 Agent 不存在
   */
  static get(id: string): AgentRunner {
    const agent = this.agents.get(id)
    if (!agent) {
      throw new Error(`Agent not found: ${id}`)
    }
    return agent
  }

  /**
   * 检查 Agent 是否已注册
   *
   * @param id Agent ID
   */
  static has(id: string): boolean {
    return this.agents.has(id)
  }

  /**
   * 获取所有已注册的 Agent
   */
  static getAll(): AgentRunner[] {
    return Array.from(this.agents.values())
  }

  /**
   * 获取所有可用的 Agent
   */
  static async getAvailableAgents(): Promise<AgentRunner[]> {
    const agents = Array.from(this.agents.values())
    const availability = await Promise.all(
      agents.map(async agent => ({
        agent,
        available: await agent.isAvailable(),
      }))
    )
    return availability.filter(a => a.available).map(a => a.agent)
  }

  /**
   * 清空所有 Agent
   */
  static clear(): void {
    this.agents.forEach(agent => {
      if (agent.cleanup) {
        agent.cleanup()
      }
    })
    this.agents.clear()
  }
}
