/**
 * ClaudeCodeAgentRunner
 *
 * 将 ClaudeCodeEngine 适配为 AgentRunner 接口
 */

import type { AgentRunner, AgentInput, AgentCapabilities } from '../agents/AgentRunner'
import type { AIEvent } from '../../ai-runtime/event'
import type { AITask } from '../../ai-runtime'
import type { AIEngine } from '../../ai-runtime'

/**
 * ClaudeCodeAgentRunner 配置
 */
export interface ClaudeCodeAgentConfig {
  /** Claude Code CLI 路径 */
  claudePath?: string
  /** 默认工作区目录 */
  defaultWorkspaceDir?: string
}

/**
 * ClaudeCodeAgentRunner
 *
 * 实现 AgentRunner 接口，适配 ClaudeCodeEngine
 */
export class ClaudeCodeAgentRunner implements AgentRunner {
  readonly id = 'claude-code'
  readonly name = 'Claude Code'
  readonly capabilities: AgentCapabilities

  private engineFactory: () => AIEngine
  private abortController: AbortController | null = null

  constructor(_config: ClaudeCodeAgentConfig, engineFactory: () => AIEngine) {
    this.engineFactory = engineFactory

    this.capabilities = {
      id: this.id,
      name: this.name,
      description: 'Claude Code CLI - Anthropic 官方的 AI 编程助手',
      version: '1.0.0',
      supportedTaskKinds: ['chat', 'refactor', 'analyze', 'generate'],
      supportsStreaming: true,
      supportsConcurrentSessions: true,
      supportsTaskAbort: true,
      maxConcurrentSessions: 0,
    }
  }

  /**
   * 执行 Agent（流式）
   *
   * @param input 输入参数
   * @returns 异步事件流
   */
  async *run(input: AgentInput): AsyncIterable<AIEvent> {
    // 创建新的 AbortController
    this.abortController = new AbortController()

    try {
      // 获取 Engine
      const engine = this.engineFactory()

      // 创建会话
      const session = engine.createSession({
        workspaceDir: input.workspacePath,
      })

      // 构建任务
      const task: AITask = {
        id: crypto.randomUUID(),
        kind: 'chat',
        input: {
          prompt: input.prompt,
          files: input.files,
          extra: input.options,
        },
      }

      // 执行并转换事件
      const eventStream = session.run(task)

      for await (const event of eventStream) {
        // 检查是否被中断
        if (this.abortController.signal.aborted) {
          session.abort()
          break
        }

        yield event
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    } finally {
      this.abortController = null
    }
  }

  /**
   * 中断执行
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  /**
   * 检查 Agent 是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      const engine = this.engineFactory()
      return await engine.isAvailable()
    } catch {
      return false
    }
  }

  /**
   * 初始化 Agent
   */
  async initialize(): Promise<boolean> {
    try {
      const engine = this.engineFactory()
      if (engine.initialize) {
        return await engine.initialize()
      }
      return true
    } catch {
      return false
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // Engine 由工厂管理，不需要在这里清理
  }
}
