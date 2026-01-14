/**
 * AI Runtime Adapter
 *
 * 提供从旧的 Tauri API 到新的 AI Runtime 架构的适配层。
 * 这个文件作为过渡期的桥梁，让现有代码可以逐步迁移到新架构。
 *
 * 迁移策略：
 * 1. 保持现有 Tauri API 不变
 * 2. 通过 adapter 将 AIEvent 转换为旧的 StreamEvent 格式
 * 3. UI 层继续使用旧的 StreamEvent，逐步迁移
 */

import type { AIEvent } from '../ai-runtime'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { StreamEvent } from '../types'

/**
 * AIEvent 到 StreamEvent 的转换器
 *
 * 将新的 AIEvent 转换为 UI 层当前使用的 StreamEvent 格式。
 * 这是一个过渡性的适配器，迁移完成后可以移除。
 */
export function aiEventToStreamEvent(event: AIEvent): StreamEvent | null {
  switch (event.type) {
    case 'session_start':
      return {
        type: 'session_start',
        sessionId: event.sessionId,
      }

    case 'session_end':
      return {
        type: 'session_end',
      }

    case 'user_message':
      // 用户消息不需要转换，由 UI 层直接添加
      return null

    case 'assistant_message':
      // AI 消息转换为 text_delta 或 assistant 事件
      if (event.isDelta) {
        return {
          type: 'text_delta',
          text: event.content,
        }
      } else {
        // 完整的 assistant 消息（包含工具调用）
        return {
          type: 'assistant',
          message: {
            id: crypto.randomUUID(),
            type: 'message',
            role: 'assistant',
            model: 'claude',
            content: [
              {
                type: 'text',
                text: event.content,
              },
              ...(event.toolCalls?.map((tool) => ({
                type: 'tool_use',
                id: tool.id,
                name: tool.name,
                input: tool.args,
              })) || []),
            ],
          },
        }
      }

    case 'token':
      return {
        type: 'text_delta',
        text: event.value,
      }

    case 'tool_call_start':
      return {
        type: 'tool_start',
        toolUseId: event.callId || crypto.randomUUID(),
        toolName: event.tool,
        input: event.args,
      }

    case 'tool_call_end':
      return {
        type: 'tool_end',
        toolUseId: event.callId || crypto.randomUUID(),
        output: event.result as string | undefined,
      }

    case 'progress':
      return {
        type: 'system',
        subtype: 'progress',
        extra: { message: event.message, percent: event.percent },
      }

    case 'error':
      return {
        type: 'error',
        error: event.error,
      }

    default:
      console.warn('[aiEventToStreamEvent] Unknown event type:', event)
      return null
  }
}

/**
 * 创建兼容的事件监听器
 *
 * 监听新的 AIEvent 并转换为 StreamEvent 后调用回调。
 * 用于让现有代码逐步迁移到新架构。
 */
export async function createCompatibleEventListener(
  callback: (event: StreamEvent) => void
): Promise<() => void> {
  const unlisten = await listen<AIEvent>('ai-event', (tauriEvent) => {
    const streamEvent = aiEventToStreamEvent(tauriEvent.payload)
    if (streamEvent) {
      callback(streamEvent)
    }
  })

  return unlisten
}

/**
 * AI Runtime 服务
 *
 * 提供基于新架构的聊天服务，兼容旧的 API 签名。
 */
class AIRuntimeService {
  private currentSessionId: string | null = null

  /**
   * 启动聊天会话（兼容旧 API）
   */
  async startChat(message: string, workDir?: string): Promise<string> {
    // 调用 Tauri 后端
    const sessionId = await invoke<string>('start_chat', {
      message,
      workDir,
    })

    this.currentSessionId = sessionId
    return sessionId
  }

  /**
   * 继续聊天会话（兼容旧 API）
   */
  async continueChat(sessionId: string, message: string, workDir?: string): Promise<void> {
    await invoke('continue_chat', {
      sessionId,
      message,
      workDir,
    })

    this.currentSessionId = sessionId
  }

  /**
   * 中断聊天会话（兼容旧 API）
   */
  async interruptChat(sessionId: string): Promise<void> {
    await invoke('interrupt_chat', { sessionId })
  }

  /**
   * 获取当前会话 ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId
  }
}

// 导出单例
export const aiRuntimeService = new AIRuntimeService()
