/**
 * CLI Parser - 命令行输出解析器
 *
 * 负责将 Claude Code CLI 的原始输出解析为统一的 AIEvent。
 * 支持流式解析，可以处理不完整的 JSON 行。
 */

import type { AIEvent } from '../ai-runtime'
import {
  createTokenEvent,
  createToolCallStartEvent,
  createToolCallEndEvent,
  createProgressEvent,
  createErrorEvent,
  createSessionStartEvent,
  createSessionEndEvent,
  createAssistantMessageEvent,
  type ToolCallInfo,
} from '../ai-runtime'

/**
 * Claude CLI StreamEvent 类型（原始输出格式）
 */
interface ClaudeStreamEvent {
  type: string
  [key: string]: unknown
}

/**
 * 解析器状态
 */
interface ParserState {
  /** 当前会话 ID */
  sessionId: string | null
  /** 当前累积的文本内容 */
  accumulatedText: string
  /** 当前活跃的工具调用 */
  activeToolCalls: Map<string, ToolCallInfo>
  /** 缓冲的不完整行 */
  lineBuffer: string
}

/**
 * Claude CLI Parser
 *
 * 流式解析 Claude CLI 的输出，产生 AIEvent。
 */
export class CLIParser {
  private state: ParserState

  constructor() {
    this.state = {
      sessionId: null,
      accumulatedText: '',
      activeToolCalls: new Map(),
      lineBuffer: '',
    }
  }

  /**
   * 解析单行输出
   * @param line CLI 输出的一行
   * @returns 解析得到的 AIEvent 数组
   */
  parseLine(line: string): AIEvent[] {
    const trimmed = line.trim()
    if (!trimmed) return []

    try {
      const claudeEvent = JSON.parse(trimmed) as ClaudeStreamEvent
      return this.parseStreamEvent(claudeEvent)
    } catch {
      // 不是 JSON，可能是纯文本输出
      return this.parsePlainText(line)
    }
  }

  /**
   * 流式解析（处理不完整的行）
   * @param chunk CLI 输出块
   * @returns 解析得到的 AIEvent 数组
   */
  parseChunk(chunk: string): AIEvent[] {
    const events: AIEvent[] = []

    // 将缓冲区和新的数据拼接
    const data = this.state.lineBuffer + chunk
    const lines = data.split('\n')

    // 保留最后一个可能不完整的行
    this.state.lineBuffer = lines.pop() || ''

    // 解析完整的行
    for (const line of lines) {
      events.push(...this.parseLine(line))
    }

    return events
  }

  /**
   * 解析 StreamEvent
   */
  private parseStreamEvent(event: ClaudeStreamEvent): AIEvent[] {
    const results: AIEvent[] = []

    switch (event.type) {
      case 'system':
        results.push(...this.parseSystemEvent(event))
        break

      case 'assistant':
        results.push(...this.parseAssistantEvent(event))
        break

      case 'user':
        results.push(...this.parseUserEvent(event))
        break

      case 'text_delta':
        results.push(this.parseTextDeltaEvent(event))
        break

      case 'tool_start':
        results.push(...this.parseToolStartEvent(event))
        break

      case 'tool_end':
        results.push(...this.parseToolEndEvent(event))
        break

      case 'permission_request':
        results.push(this.parsePermissionRequestEvent(event))
        break

      case 'error':
        results.push(this.parseErrorEvent(event))
        break

      case 'session_end':
        results.push(this.parseSessionEndEvent(event))
        break

      case 'session_start':
        results.push(this.parseSessionStartEvent(event))
        break

      default:
        console.warn('[CLIParser] Unknown event type:', event.type)
    }

    return results
  }

  /**
   * 解析 System 事件
   */
  private parseSystemEvent(event: Record<string, unknown>): AIEvent[] {
    const results: AIEvent[] = []

    // 提取 session_id
    if (event.session_id && typeof event.session_id === 'string') {
      this.state.sessionId = event.session_id
      results.push(createSessionStartEvent(event.session_id))
    } else if (event.extra && typeof event.extra === 'object') {
      const extra = event.extra as Record<string, unknown>
      if (extra.session_id && typeof extra.session_id === 'string') {
        this.state.sessionId = extra.session_id
        results.push(createSessionStartEvent(extra.session_id))
      }
    }

    // 转换为进度事件
    const subtype = event.subtype as string | undefined
    const extra = event.extra as Record<string, unknown> | undefined

    if (subtype || extra) {
      const message = this.formatSystemMessage(subtype, extra)
      if (message) {
        results.push(createProgressEvent(message))
      }
    }

    return results
  }

  /**
   * 解析 Assistant 事件
   */
  private parseAssistantEvent(event: Record<string, unknown>): AIEvent[] {
    const results: AIEvent[] = []
    const message = event.message as Record<string, unknown> | undefined
    const content = message?.content as Array<Record<string, unknown>> | undefined

    if (!content) return results

    // 提取文本内容
    const textParts = content.filter((item) => item.type === 'text')
    const text = textParts
      .map((item) => item.text as string | undefined)
      .filter(Boolean)
      .join('')

    // 提取工具调用
    const toolUseParts = content.filter((item) => item.type === 'tool_use')
    const toolCalls: ToolCallInfo[] = []

    for (const toolUse of toolUseParts) {
      const toolId = (toolUse.id as string) || crypto.randomUUID()
      const toolName = (toolUse.name as string) || 'unknown'
      const input = (toolUse.input as Record<string, unknown>) || {}

      // 管理工具调用状态
      const toolCall: ToolCallInfo = {
        id: toolId,
        name: toolName,
        args: input,
        status: 'pending',
      }
      this.state.activeToolCalls.set(toolId, toolCall)
      toolCalls.push(toolCall)

      // 发出工具调用开始事件
      results.push(createToolCallStartEvent(toolName, input))
    }

    // 发出 AI 消息事件
    if (text || toolCalls.length > 0) {
      results.push(
        createAssistantMessageEvent(text, false, toolCalls.length > 0 ? toolCalls : undefined)
      )
      this.state.accumulatedText = text
    }

    return results
  }

  /**
   * 解析 User 事件
   */
  private parseUserEvent(event: Record<string, unknown>): AIEvent[] {
    const results: AIEvent[] = []
    const message = event.message as Record<string, unknown> | undefined
    const content = message?.content as Array<Record<string, unknown>> | undefined

    if (!content) return results

    // 处理工具结果
    const toolResults = content.filter((item) => item.type === 'tool_result')

    for (const result of toolResults) {
      const toolUseId = result.tool_use_id as string | undefined
      if (toolUseId) {
        const toolCall = this.state.activeToolCalls.get(toolUseId)
        if (toolCall) {
          // 更新工具状态
          toolCall.status = result.is_error ? 'failed' : 'completed'
          toolCall.result = result.content as string | undefined

          results.push(
            createToolCallEndEvent(
              toolCall.name,
              result.content as string | undefined,
              !result.is_error
            )
          )
        }
      }
    }

    return results
  }

  /**
   * 解析 Text Delta 事件
   */
  private parseTextDeltaEvent(event: Record<string, unknown>): AIEvent {
    const text = (event.text as string) || ''
    this.state.accumulatedText += text
    return createAssistantMessageEvent(text, true)
  }

  /**
   * 解析 Tool Start 事件
   */
  private parseToolStartEvent(event: Record<string, unknown>): AIEvent[] {
    const results: AIEvent[] = []
    const toolName = (event.tool_name as string) || 'unknown'
    const input = (event.input as Record<string, unknown>) || {}

    results.push(createProgressEvent(`调用工具: ${toolName}`))
    results.push(createToolCallStartEvent(toolName, input))

    return results
  }

  /**
   * 解析 Tool End 事件
   */
  private parseToolEndEvent(event: Record<string, unknown>): AIEvent[] {
    const results: AIEvent[] = []
    const toolName = (event.tool_name as string) || 'unknown'
    const output = event.output as string | undefined | null

    results.push(createProgressEvent(`工具完成: ${toolName}`))
    results.push(createToolCallEndEvent(toolName, output, output !== undefined))

    return results
  }

  /**
   * 解析 Permission Request 事件
   */
  private parsePermissionRequestEvent(_event: Record<string, unknown>): AIEvent {
    return createProgressEvent('等待权限确认...')
  }

  /**
   * 解析 Error 事件
   */
  private parseErrorEvent(event: Record<string, unknown>): AIEvent {
    const error = (event.error as string) || '未知错误'
    return createErrorEvent(error)
  }

  /**
   * 解析 Session End 事件
   */
  private parseSessionEndEvent(_event: Record<string, unknown>): AIEvent {
    const sessionId = this.state.sessionId || 'unknown'
    this.reset()
    return createSessionEndEvent(sessionId, 'completed')
  }

  /**
   * 解析 Session Start 事件
   */
  private parseSessionStartEvent(event: Record<string, unknown>): AIEvent {
    const sessionId = (event.sessionId as string) || crypto.randomUUID()
    this.state.sessionId = sessionId
    return createSessionStartEvent(sessionId)
  }

  /**
   * 解析纯文本输出（非 JSON）
   */
  private parsePlainText(text: string): AIEvent[] {
    const results: AIEvent[] = []

    // 简单的模式匹配
    if (text.includes('Calling tool:')) {
      const match = text.match(/Calling tool:\s*(\w+)/)
      if (match) {
        results.push(createProgressEvent(`调用工具: ${match[1]}`))
        results.push(createToolCallStartEvent(match[1], {}))
      }
    } else if (text.includes('Error:')) {
      results.push(createErrorEvent(text))
    } else {
      // 默认作为 token 处理
      results.push(createTokenEvent(text))
    }

    return results
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

    if (extra?.message && typeof extra.message === 'string') {
      return extra.message
    }

    return subtype
  }

  /**
   * 重置解析器状态
   */
  reset(): void {
    this.state = {
      sessionId: null,
      accumulatedText: '',
      activeToolCalls: new Map(),
      lineBuffer: '',
    }
  }

  /**
   * 获取当前会话 ID
   */
  getSessionId(): string | null {
    return this.state.sessionId
  }

  /**
   * 获取当前累积的文本
   */
  getAccumulatedText(): string {
    return this.state.accumulatedText
  }

  /**
   * 获取当前活跃的工具调用
   */
  getActiveToolCalls(): ToolCallInfo[] {
    return Array.from(this.state.activeToolCalls.values())
  }
}

/**
 * 创建解析器实例
 */
export function createParser(): CLIParser {
  return new CLIParser()
}

/**
 * 解析完整输出（非流式）
 * @param output 完整的 CLI 输出
 * @returns 解析得到的 AIEvent 数组
 */
export function parseOutput(output: string): AIEvent[] {
  const parser = createParser()
  const events: AIEvent[] = []

  const lines = output.split('\n')
  for (const line of lines) {
    events.push(...parser.parseLine(line))
  }

  return events
}
