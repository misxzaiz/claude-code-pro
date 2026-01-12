/**
 * Claude Code Session
 *
 * 实现 AISession 接口，封装 Claude Code CLI 的调用逻辑。
 * 这是 Claude Code Adapter 的核心实现。
 */

import type { AISession, AISessionConfig, AISessionStatus } from '../../ai-runtime'
import type { AITask } from '../../ai-runtime'
import type { AIEvent } from '../../ai-runtime'
import { EventEmitter } from '../../ai-runtime'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ClaudeEventParser } from './event-parser'

/**
 * Claude Code 会话配置
 */
export interface ClaudeSessionConfig extends AISessionConfig {
  /** Claude Code CLI 路径 */
  claudePath?: string
  /** 工作区目录 */
  workspacePath?: string
}

/**
 * Tauri Chat 事件类型（来自 Rust 后端）
 */
interface TauriChatEvent {
  type: string
  data?: unknown
  [key: string]: unknown
}

/**
 * Claude Code Session 实现
 *
 * 负责：
 * 1. 启动 Claude Code CLI 进程
 * 2. 将 stdout/stderr 解析为 AIEvent
 * 3. 处理 abort（中断）
 * 4. 管理进程生命周期
 */
export class ClaudeCodeSession extends EventEmitter implements AISession {
  private config: ClaudeSessionConfig
  private _status: AISessionStatus = 'idle'
  private parser: ClaudeEventParser
  private currentTaskId: string | null = null
  private unlistenChatEvent: (() => void) | null = null

  readonly id: string

  constructor(id: string, config?: ClaudeSessionConfig) {
    super()
    this.id = id
    this.config = {
      workspaceDir: config?.workspacePath,
      verbose: config?.verbose,
      timeout: config?.timeout,
      claudePath: config?.claudePath,
      options: config?.options,
    }
    this.parser = new ClaudeEventParser(id)
  }

  get status(): AISessionStatus {
    return this._status
  }

  /**
   * 执行任务
   */
  async *run(task: AITask): AsyncIterable<AIEvent> {
    if (this._status === 'disposed') {
      throw new Error('Session has been disposed')
    }

    this.currentTaskId = task.id
    this._status = 'running'

    try {
      // 发送会话开始事件
      yield { type: 'session_start', sessionId: this.id }

      // 发送用户消息事件
      if (task.input.prompt) {
        yield {
          type: 'user_message',
          content: task.input.prompt,
          files: task.input.files,
        }
      }

      // 设置 Tauri 事件监听
      await this.setupEventListeners()

      // 调用 Tauri 后端启动 Claude CLI
      await this.startClaudeProcess(task)

      // 通过事件队列收集并 yield 事件
      const eventQueue = await this.createEventQueue()

      for await (const event of eventQueue) {
        yield event
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      }
    } finally {
      this.cleanup()
    }
  }

  /**
   * 中断任务
   */
  abort(taskId?: string): void {
    if (taskId && taskId !== this.currentTaskId) {
      return
    }

    // 调用 Tauri 后端中断 CLI 进程
    invoke('interrupt_chat', { sessionId: this.id })
      .catch((error) => {
        console.error('[ClaudeCodeSession] Failed to abort:', error)
      })
      .finally(() => {
        this._status = 'idle'
        this.currentTaskId = null
      })
  }

  /**
   * 销毁会话
   */
  dispose(): void {
    if (this._status === 'disposed') {
      return
    }

    this.abort()

    if (this.unlistenChatEvent) {
      this.unlistenChatEvent()
      this.unlistenChatEvent = null
    }

    this.removeAllListeners()
    this.parser.reset()
    this._status = 'disposed'
  }

  /**
   * 设置 Tauri 事件监听
   */
  private async setupEventListeners(): Promise<void> {
    if (this.unlistenChatEvent) {
      return
    }

    try {
      this.unlistenChatEvent = await listen<TauriChatEvent>(
        'chat-event',
        (event) => {
          // 过滤属于当前会话的事件
          if (event.payload.session_id === this.id) {
            this.handleTauriEvent(event.payload)
          }
        }
      )
    } catch (error) {
      console.error('[ClaudeCodeSession] Failed to setup event listeners:', error)
      throw error
    }
  }

  /**
   * 启动 Claude CLI 进程
   */
  private async startClaudeProcess(task: AITask): Promise<void> {
    const message = this.buildPrompt(task)

    const args = {
      message,
      sessionId: this.id,
      workspaceDir: this.config.workspaceDir,
      verbose: this.config.verbose || false,
      // 不需要传递 claudePath，后端会从配置中读取
    }

    try {
      await invoke('start_chat', args)
    } catch (error) {
      console.error('[ClaudeCodeSession] Failed to start Claude process:', error)
      throw error
    }
  }

  /**
   * 构建发送给 Claude 的提示词
   */
  private buildPrompt(task: AITask): string {
    let prompt = task.input.prompt

    // 如果有指定文件，添加上下文
    if (task.input.files && task.input.files.length > 0) {
      // Claude CLI 会自动处理工作区中的文件引用
      // 这里我们保持原样，让 CLI 去处理
    }

    return prompt
  }

  /**
   * 处理来自 Tauri 的事件
   */
  private handleTauriEvent(event: TauriChatEvent): void {
    // 将 Tauri 事件转换为 AIEvent 并 emit
    const aiEvents = this.parser.parse(event as any)

    for (const aiEvent of aiEvents) {
      this.emit(aiEvent)
    }
  }

  /**
   * 创建事件队列用于 AsyncIterable
   */
  private async createEventQueue(): Promise<AsyncIterable<AIEvent>> {
    const events: AIEvent[] = []
    let isComplete = false
    let resolve: (() => void) | null = null

    const listener = (event: AIEvent) => {
      events.push(event)

      // 检查是否会话结束
      if (event.type === 'session_end' || event.type === 'error') {
        isComplete = true
        if (resolve) {
          resolve()
          resolve = null
        }
      }
    }

    this.onEvent(listener)

    return {
      [Symbol.asyncIterator]: async function* () {
        while (!isComplete) {
          if (events.length > 0) {
            yield events.shift()!
          } else {
            // 等待新事件
            await new Promise<void>((r) => {
              resolve = r
              // 设置超时避免死锁
              setTimeout(() => {
                if (!isComplete) r()
              }, 100)
            })
          }
        }

        // 返回剩余事件
        while (events.length > 0) {
          yield events.shift()!
        }
      },
    }
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    this._status = 'idle'
    this.currentTaskId = null
  }

  /**
   * 继续会话（用于多轮对话）
   */
  async continue(prompt: string): Promise<void> {
    if (this._status === 'disposed') {
      throw new Error('Session has been disposed')
    }

    try {
      await invoke('continue_chat', {
        sessionId: this.id,
        message: prompt,
      })
      this._status = 'running'
    } catch (error) {
      console.error('[ClaudeCodeSession] Failed to continue chat:', error)
      throw error
    }
  }
}

/**
 * Claude Session 工厂函数
 */
export function createClaudeSession(
  sessionId: string,
  config?: ClaudeSessionConfig
): ClaudeCodeSession {
  return new ClaudeCodeSession(sessionId, config)
}
