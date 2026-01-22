/**
 * OpenAI 兼容引擎 - SSE 流式响应解析器
 *
 * 解析 OpenAI API 的 Server-Sent Events (SSE) 格式流式响应。
 * 支持所有兼容 OpenAI 协议的服务。
 */

import type { OpenAIStreamChunk } from './types'

/**
 * 解析 SSE 格式的流式响应
 *
 * @param response - Fetch Response 对象
 * @returns 异步可迭代的事件流
 */
export async function* parseSSEResponse(
  response: Response
): AsyncIterable<OpenAIStreamChunk> {
  if (!response.body) {
    throw new Error('Response body is empty')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // 处理缓冲区中的完整行
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''  // 保留最后一个不完整的行

      for (const line of lines) {
        const trimmed = line.trim()

        // 空行跳过
        if (!trimmed) continue

        // SSE 格式：data: {...}
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6)

          // [DONE] 表示流结束
          if (data === '[DONE]') {
            return
          }

          try {
            const chunk = JSON.parse(data) as OpenAIStreamChunk
            yield chunk
          } catch (error) {
            console.warn('[SSEParser] Failed to parse chunk:', data, error)
          }
        }
      }
    }

    // 处理缓冲区剩余内容
    if (buffer.trim()) {
      const trimmed = buffer.trim()
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6)
        if (data !== '[DONE]') {
          try {
            const chunk = JSON.parse(data) as OpenAIStreamChunk
            yield chunk
          } catch (error) {
            console.warn('[SSEParser] Failed to parse final chunk:', trimmed, error)
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * 从 chunk 中提取内容增量
 *
 * @param chunk - SSE chunk
 * @returns 内容增量，如果没有则返回 null
 */
export function extractContentDelta(chunk: OpenAIStreamChunk): string | null {
  const choice = chunk.choices?.[0]
  if (!choice) return null
  return choice.delta?.content || null
}

/**
 * 从 chunk 中提取工具调用增量
 *
 * @param chunk - SSE chunk
 * @returns 工具调用增量数组，如果没有则返回 null
 */
export function extractToolCalls(chunk: OpenAIStreamChunk): OpenAIStreamChunk['choices'][0]['delta']['tool_calls'] | null {
  const choice = chunk.choices?.[0]
  if (!choice) return null
  return choice.delta?.tool_calls || null
}

/**
 * 检查是否流结束
 *
 * @param chunk - SSE chunk
 * @returns 是否结束
 */
export function isStreamFinished(chunk: OpenAIStreamChunk): boolean {
  const choice = chunk.choices?.[0]
  return choice?.finish_reason !== null && choice?.finish_reason !== undefined
}

/**
 * 获取结束原因
 *
 * @param chunk - SSE chunk
 * @returns 结束原因
 */
export function getFinishReason(chunk: OpenAIStreamChunk): string | null {
  const choice = chunk.choices?.[0]
  return choice?.finish_reason || null
}

/**
 * SSE 解析器类
 *
 * 提供更高级的流式响应处理功能
 */
export class SSEParser {
  private currentContent = ''
  private pendingToolCalls = new Map<number, {
    id: string
    name: string
    arguments: string
  }>()

  /**
   * 处理 chunk 并返回增量内容
   */
  processChunk(chunk: OpenAIStreamChunk): {
    contentDelta: string | null
    toolCallDelta: Array<{ id: string; name: string; arguments: string }> | null
    isFinished: boolean
    finishReason: string | null
  } {
    const contentDelta = extractContentDelta(chunk)
    const toolCallsDelta = extractToolCalls(chunk)
    const isFinished = isStreamFinished(chunk)
    const finishReason = getFinishReason(chunk)

    // 累积内容
    if (contentDelta) {
      this.currentContent += contentDelta
    }

    // 处理工具调用
    let toolCallDelta: Array<{ id: string; name: string; arguments: string }> | null = null

    if (toolCallsDelta) {
      toolCallDelta = []

      for (const toolCall of toolCallsDelta) {
        const index = toolCall.index

        if (!this.pendingToolCalls.has(index)) {
          this.pendingToolCalls.set(index, {
            id: toolCall.id || crypto.randomUUID(),
            name: toolCall.function?.name || '',
            arguments: toolCall.function?.arguments || ''
          })
        } else {
          const existing = this.pendingToolCalls.get(index)!

          if (toolCall.function?.name) {
            existing.name = toolCall.function.name
          }

          if (toolCall.function?.arguments) {
            existing.arguments += toolCall.function.arguments
          }
        }

        const current = this.pendingToolCalls.get(index)!
        toolCallDelta.push({
          id: current.id,
          name: current.name,
          arguments: current.arguments
        })
      }
    }

    return {
      contentDelta,
      toolCallDelta,
      isFinished,
      finishReason
    }
  }

  /**
   * 获取累积的完整内容
   */
  getFullContent(): string {
    return this.currentContent
  }

  /**
   * 获取所有待处理的工具调用
   */
  getPendingToolCalls(): Array<{ id: string; name: string; arguments: string }> {
    return Array.from(this.pendingToolCalls.values())
  }

  /**
   * 重置解析器状态
   */
  reset(): void {
    this.currentContent = ''
    this.pendingToolCalls.clear()
  }
}
