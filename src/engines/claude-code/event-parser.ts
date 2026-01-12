/**
 * Claude Code Event Parser
 *
 * 负责将 Claude Code CLI 的 StreamEvent 解析为通用的 AIEvent。
 * 这是适配器的核心转换层。
 */

import type { AIEvent } from '../../ai-runtime'
import {
  createToolCallStartEvent,
  createToolCallEndEvent,
  createProgressEvent,
  createErrorEvent,
  createSessionEndEvent,
  createUserMessageEvent,
  createAssistantMessageEvent,
  type ToolCallInfo,
} from '../../ai-runtime'

/**
 * Claude Code StreamEvent 类型（来自 Rust 后端）
 *
 * 这些是 Claude Code CLI 输出的原始事件格式。
 */
export interface ClaudeStreamEvent {
  type: string
  [key: string]: unknown
}

/**
 * System 事件
 */
export interface SystemEvent extends ClaudeStreamEvent {
  type: 'system'
  subtype?: string
  extra?: Record<string, unknown>
}

/**
 * Assistant 事件
 */
export interface AssistantEvent extends ClaudeStreamEvent {
  type: 'assistant'
  message: {
    content: MessageContent[]
    model?: string
    stop_reason?: string
  }
}

/**
 * User 事件
 */
export interface UserEvent extends ClaudeStreamEvent {
  type: 'user'
  message: {
    content: MessageContent[]
  }
}

/**
 * Text Delta 事件
 */
export interface TextDeltaEvent extends ClaudeStreamEvent {
  type: 'text_delta'
  text: string
}

/**
 * Tool Start 事件
 */
export interface ToolStartEvent extends ClaudeStreamEvent {
  type: 'tool_start'
  tool_name: string
  input: Record<string, unknown>
}

/**
 * Tool End 事件
 */
export interface ToolEndEvent extends ClaudeStreamEvent {
  type: 'tool_end'
  tool_name: string
  output?: string | null
}

/**
 * Permission Request 事件
 */
export interface PermissionRequestEvent extends ClaudeStreamEvent {
  type: 'permission_request'
  session_id: string
  denials: unknown[]
}

/**
 * Error 事件
 */
export interface ErrorEvent extends ClaudeStreamEvent {
  type: 'error'
  error: string
}

/**
 * Session End 事件
 */
export interface SessionEndEvent extends ClaudeStreamEvent {
  type: 'session_end'
}

/**
 * Message Content 类型
 */
export interface MessageContent {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

/**
 * 工具调用状态管理
 */
class ToolCallManager {
  private toolCalls = new Map<string, ToolCallInfo>()

  startToolCall(toolName: string, toolId: string, input: Record<string, unknown>): ToolCallInfo {
    const toolCall: ToolCallInfo = {
      id: toolId,
      name: toolName,
      args: input,
      status: 'running',
    }
    this.toolCalls.set(toolId, toolCall)
    return toolCall
  }

  endToolCall(toolId: string, output?: unknown, success = true): void {
    const toolCall = this.toolCalls.get(toolId)
    if (toolCall) {
      toolCall.status = success ? 'completed' : 'failed'
      toolCall.result = output
    }
  }

  getToolCalls(): ToolCallInfo[] {
    return Array.from(this.toolCalls.values())
  }

  removeToolCall(toolId: string): void {
    this.toolCalls.delete(toolId)
  }

  clear(): void {
    this.toolCalls.clear()
  }
}

/**
 * Claude Code Event Parser
 *
 * 将 Claude CLI 的 StreamEvent 转换为通用的 AIEvent。
 */
export class ClaudeEventParser {
  private toolCallManager = new ToolCallManager()
  private sessionId: string

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  /**
   * 解析单个 Claude StreamEvent 为 AIEvent
   * @returns 解析后的 AIEvent 数组（一个事件可能产生多个 AIEvent）
   */
  parse(event: ClaudeStreamEvent): AIEvent[] {
    const results: AIEvent[] = []

    switch (event.type) {
      case 'system': {
        results.push(...this.parseSystemEvent(event as SystemEvent))
        break
      }

      case 'assistant': {
        results.push(...this.parseAssistantEvent(event as AssistantEvent))
        break
      }

      case 'user': {
        results.push(...this.parseUserEvent(event as UserEvent))
        break
      }

      case 'text_delta': {
        results.push(this.parseTextDeltaEvent(event as TextDeltaEvent))
        break
      }

      case 'tool_start': {
        results.push(...this.parseToolStartEvent(event as ToolStartEvent))
        break
      }

      case 'tool_end': {
        results.push(...this.parseToolEndEvent(event as ToolEndEvent))
        break
      }

      case 'permission_request': {
        // 权限请求可以转换为进度事件
        results.push(createProgressEvent('等待权限确认...'))
        break
      }

      case 'error': {
        results.push(this.parseErrorEvent(event as ErrorEvent))
        break
      }

      case 'session_end': {
        results.push(createSessionEndEvent(this.sessionId))
        break
      }

      default: {
        // 未知类型，忽略或记录日志
        console.warn('[ClaudeEventParser] Unknown event type:', event.type)
      }
    }

    return results
  }

  /**
   * 解析 System 事件
   */
  private parseSystemEvent(event: SystemEvent): AIEvent[] {
    const results: AIEvent[] = []

    // 将 system 事件转换为进度事件
    if (event.subtype) {
      const message = this.formatSystemMessage(event.subtype, event.extra)
      if (message) {
        results.push(createProgressEvent(message))
      }
    }

    return results
  }

  /**
   * 解析 Assistant 事件
   */
  private parseAssistantEvent(event: AssistantEvent): AIEvent[] {
    const results: AIEvent[] = []

    const { content } = event.message

    // 提取文本内容
    const textParts = content.filter((item) => item.type === 'text')
    const text = textParts.map((item) => item.text || '').join('')

    // 提取工具调用
    const toolUseParts = content.filter((item) => item.type === 'tool_use')
    const toolCalls: ToolCallInfo[] = []

    for (const toolUse of toolUseParts) {
      const toolId = toolUse.id || crypto.randomUUID()
      const toolName = toolUse.name || 'unknown'
      const input = toolUse.input || {}

      // 管理工具调用状态
      this.toolCallManager.startToolCall(toolName, toolId, input)

      toolCalls.push({
        id: toolId,
        name: toolName,
        args: input,
        status: 'pending',
      })

      // 发出工具调用开始事件
      results.push(createToolCallStartEvent(toolName, input))
    }

    // 发出 AI 消息事件
    if (text || toolCalls.length > 0) {
      results.push(
        createAssistantMessageEvent(text, false, toolCalls.length > 0 ? toolCalls : undefined)
      )
    }

    return results
  }

  /**
   * 解析 User 事件
   */
  private parseUserEvent(event: UserEvent): AIEvent[] {
    const results: AIEvent[] = []

    const { content } = event.message
    const textParts = content.filter((item) => item.type === 'text')
    const text = textParts.map((item) => item.text || '').join('')

    if (text) {
      results.push(createUserMessageEvent(text))
    }

    return results
  }

  /**
   * 解析 Text Delta 事件
   */
  private parseTextDeltaEvent(event: TextDeltaEvent): AIEvent {
    // 文本增量既是 token 事件，也是消息的增量
    return createAssistantMessageEvent(event.text, true)
  }

  /**
   * 解析 Tool Start 事件
   */
  private parseToolStartEvent(event: ToolStartEvent): AIEvent[] {
    const results: AIEvent[] = []

    results.push(createProgressEvent(`调用工具: ${event.tool_name}`))
    results.push(createToolCallStartEvent(event.tool_name, event.input))

    return results
  }

  /**
   * 解析 Tool End 事件
   */
  private parseToolEndEvent(event: ToolEndEvent): AIEvent[] {
    const results: AIEvent[] = []

    results.push(createProgressEvent(`工具完成: ${event.tool_name}`))
    results.push(
      createToolCallEndEvent(event.tool_name, event.output, event.output !== undefined)
    )

    return results
  }

  /**
   * 解析 Error 事件
   */
  private parseErrorEvent(event: ErrorEvent): AIEvent {
    return createErrorEvent(event.error)
  }

  /**
   * 格式化系统消息
   */
  private formatSystemMessage(
    subtype: string | undefined,
    extra?: Record<string, unknown>
  ): string | undefined {
    if (!subtype) return undefined

    const messageMap: Record<string, string> = {
      init: '初始化会话...',
      reading: '读取文件...',
      writing: '写入文件...',
      thinking: '思考中...',
      searching: '搜索中...',
    }

    if (subtype in messageMap) {
      return messageMap[subtype]
    }

    // 尝试从 extra 中提取消息
    if (extra?.message && typeof extra.message === 'string') {
      return extra.message
    }

    return subtype
  }

  /**
   * 重置解析器状态
   */
  reset(): void {
    this.toolCallManager.clear()
  }

  /**
   * 获取当前的工具调用列表
   */
  getCurrentToolCalls(): ToolCallInfo[] {
    return this.toolCallManager.getToolCalls()
  }
}

/**
 * 解析单行 JSON 为 ClaudeStreamEvent
 */
export function parseStreamEventLine(line: string): ClaudeStreamEvent | null {
  try {
    const trimmed = line.trim()
    if (!trimmed) return null
    return JSON.parse(trimmed) as ClaudeStreamEvent
  } catch {
    return null
  }
}

/**
 * 将 Claude StreamEvent 数组转换为 AIEvent 数组
 */
export function convertClaudeEventsToAIEvents(
  events: ClaudeStreamEvent[],
  sessionId: string
): AIEvent[] {
  const parser = new ClaudeEventParser(sessionId)
  const results: AIEvent[] = []

  for (const event of events) {
    results.push(...parser.parse(event))
  }

  return results
}
