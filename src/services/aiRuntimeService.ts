/**
 * AI Runtime Service
 *
 * 这是新的 AI Runtime 架构的核心服务层。
 * 负责管理 AI Engine 和 Session，将 Tauri 后端的 StreamEvent 转换为通用的 AIEvent。
 *
 * 这是 UI 层应该依赖的唯一服务。
 */

import type { AISession, AIEvent } from '../ai-runtime'
import type { StreamEvent } from '../types'
import { EngineRegistry, DEFAULT_ENGINE_ID } from '../ai-runtime'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

/**
 * 将 Tauri 的 StreamEvent 转换为通用的 AIEvent
 *
 * 这是适配层，将 Claude 特定的事件格式转换为通用格式。
 */
function streamEventToAIEvent(streamEvent: StreamEvent, sessionId: string): AIEvent[] {
  const events: AIEvent[] = []

  switch (streamEvent.type) {
    case 'system':
      // 系统事件 - 转换为进度事件
      if (streamEvent.session_id) {
        // 这是会话开始，发送 session_start 事件
        events.push({
          type: 'session_start',
          sessionId: streamEvent.session_id,
        })
      }
      if (streamEvent.subtype || streamEvent.extra) {
        const extraMessage = streamEvent.extra && typeof streamEvent.extra === 'object' && 'message' in streamEvent.extra
          ? String(streamEvent.extra.message)
          : undefined
        events.push({
          type: 'progress',
          message: extraMessage || streamEvent.subtype,
        })
      }
      break

    case 'session_start':
      events.push({
        type: 'session_start',
        sessionId: streamEvent.sessionId,
      })
      break

    case 'session_end':
    case 'result':
      events.push({
        type: 'session_end',
        sessionId,
        reason: 'completed',
      })
      break

    case 'assistant': {
      // 助手消息
      const content = streamEvent.message.content
      const textParts = content.filter((item) => item.type === 'text')
      const text = textParts.map((item) => item.text || '').join('')

      const toolUseParts = content.filter((item) => item.type === 'tool_use')
      const toolCalls = toolUseParts.map((tool) => ({
        id: tool.id || crypto.randomUUID(),
        name: tool.name || 'unknown',
        args: tool.input || {},
        status: 'pending' as const,
      }))

      if (text) {
        events.push({
          type: 'assistant_message',
          content: text,
          isDelta: false,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        })
      }

      // 为每个工具调用发送 tool_call_start 事件
      for (const tool of toolCalls) {
        events.push({
          type: 'tool_call_start',
          tool: tool.name,
          args: tool.args,
        })
      }
      break
    }

    case 'user': {
      // 用户消息（包含工具结果）
      const toolResults = streamEvent.message.content.filter(
        (item) => item.type === 'tool_result'
      )

      for (const result of toolResults) {
        if (result.tool_use_id) {
          events.push({
            type: 'tool_call_end',
            tool: result.tool_use_id, // 这里需要映射到工具名称
            result: result.content || '',
            success: !result.is_error,
          })
        }
      }
      break
    }

    case 'text_delta':
      events.push({
        type: 'token',
        value: streamEvent.text,
      })
      break

    case 'tool_start':
      events.push({
        type: 'tool_call_start',
        tool: streamEvent.toolName,
        args: streamEvent.input,
      })
      events.push({
        type: 'progress',
        message: `调用工具: ${streamEvent.toolName}`,
      })
      break

    case 'tool_end':
      events.push({
        type: 'tool_call_end',
        tool: streamEvent.toolName,
        result: streamEvent.output,
        success: streamEvent.output !== undefined,
      })
      events.push({
        type: 'progress',
        message: `工具完成: ${streamEvent.toolName}`,
      })
      break

    case 'error':
      events.push({
        type: 'error',
        error: streamEvent.error,
      })
      break

    case 'permission_request':
      // 权限请求转换为进度事件
      events.push({
        type: 'progress',
        message: '等待权限确认...',
      })
      break
  }

  return events
}

/**
 * AI Runtime 配置
 */
export interface AIRuntimeConfig {
  /** 工作区目录 */
  workspaceDir?: string
  /** 是否启用详细日志 */
  verbose?: boolean
}

/**
 * AI Runtime 服务类
 *
 * 提供统一的 AI 运行时接口，UI 层通过此服务与 AI 交互。
 */
export class AIRuntimeService {
  private currentSession: AISession | null = null
  private eventListeners = new Map<string, (event: AIEvent) => void>()
  private unlistenFn: UnlistenFn | null = null
  private config: AIRuntimeConfig

  constructor(config?: AIRuntimeConfig) {
    this.config = config || {}

    // 注册默认的 Claude Code Engine
    this.ensureEngineRegistered()
  }

  /**
   * 确保 Engine 已注册
   */
  private ensureEngineRegistered(): void {
    if (!EngineRegistry.has(DEFAULT_ENGINE_ID)) {
      // Claude Code Engine 由 Rust 后端实现，这里只注册一个占位符
      // 实际的事件转换由 streamEventToAIEvent 完成
      console.warn('[AIRuntimeService] Claude Engine not registered in frontend, using backend implementation')
    }
  }

  /**
   * 初始化 Runtime
   */
  async initialize(): Promise<void> {
    // 设置 Tauri 事件监听
    this.setupEventListeners()

    // 检查 Engine 可用性
    if (EngineRegistry.has(DEFAULT_ENGINE_ID)) {
      const engine = EngineRegistry.get(DEFAULT_ENGINE_ID)
      if (engine?.initialize) {
        await engine.initialize()
      }
    }
  }

  /**
   * 设置 Tauri 事件监听器
   */
  private async setupEventListeners(): Promise<void> {
    if (this.unlistenFn) {
      return
    }

    // 监听 Tauri 的 chat-event，转换为 AIEvent
    this.unlistenFn = await listen<string>('chat-event', (event) => {
      try {
        const streamEvent = JSON.parse(event.payload) as StreamEvent
        const sessionId = this.currentSession?.id || 'unknown'
        const aiEvents = streamEventToAIEvent(streamEvent, sessionId)

        // 分发所有转换后的事件
        for (const aiEvent of aiEvents) {
          this.emitAIEvent(aiEvent)
        }
      } catch (e) {
        console.error('[AIRuntimeService] Failed to parse event:', e)
      }
    })
  }

  /**
   * 分发 AIEvent 到所有监听器
   */
  private emitAIEvent(event: AIEvent): void {
    this.eventListeners.forEach((listener) => {
      try {
        listener(event)
      } catch (e) {
        console.error('[AIRuntimeService] Listener error:', e)
      }
    })
  }

  /**
   * 添加事件监听器
   */
  onEvent(listener: (event: AIEvent) => void): () => void {
    const id = crypto.randomUUID()
    this.eventListeners.set(id, listener)
    return () => this.eventListeners.delete(id)
  }

  /**
   * 发送消息（创建新会话或继续现有会话）
   */
  async sendMessage(message: string, sessionId?: string): Promise<string> {
    const workDir = this.config.workspaceDir

    if (sessionId) {
      // 继续现有会话
      await invoke('continue_chat', {
        sessionId,
        message,
        workDir,
      })
      return sessionId
    } else {
      // 创建新会话
      const newSessionId = await invoke<string>('start_chat', {
        message,
        workDir,
      })
      return newSessionId
    }
  }

  /**
   * 中断会话
   */
  async interrupt(sessionId: string): Promise<void> {
    await invoke('interrupt_chat', { sessionId })
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): AISession | null {
    return this.currentSession
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (this.unlistenFn) {
      this.unlistenFn()
      this.unlistenFn = null
    }

    this.eventListeners.clear()

    if (this.currentSession) {
      this.currentSession.dispose()
      this.currentSession = null
    }

    const engine = EngineRegistry.get(DEFAULT_ENGINE_ID)
    if (engine?.cleanup) {
      engine.cleanup()
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AIRuntimeConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

/**
 * 全局单例
 */
let globalService: AIRuntimeService | null = null

/**
 * 获取 AI Runtime 服务单例
 */
export function getAIRuntime(config?: AIRuntimeConfig): AIRuntimeService {
  if (!globalService) {
    globalService = new AIRuntimeService(config)
  }
  return globalService
}

/**
 * 重置服务（主要用于测试）
 */
export function resetAIRuntime(): void {
  if (globalService) {
    globalService.cleanup()
    globalService = null
  }
}
