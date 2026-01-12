/**
 * AI Chat Hook - 基于 AI Runtime 的新版聊天 Hook
 *
 * 这个 Hook 使用通用的 AIEvent 而不是 Claude 特定的 StreamEvent。
 * 这是重构后的标准聊天 Hook。
 */

import { useEffect, useState } from 'react'
import type { AIEvent } from '../ai-runtime'
import { getEventBus } from '../ai-runtime'

/**
 * AI Chat Hook 状态
 */
interface AIChatState {
  /** 是否正在流式传输 */
  isStreaming: boolean
  /** 当前会话 ID */
  sessionId: string | null
  /** 当前流式内容 */
  currentContent: string
  /** 错误信息 */
  error: string | null
}

/**
 * AI Chat Hook 返回值
 */
interface AIChatReturn extends AIChatState {
  /** 发送消息 */
  sendMessage: (message: string) => Promise<void>
  /** 继续对话 */
  continueChat: (message?: string) => Promise<void>
  /** 中断对话 */
  interrupt: () => Promise<void>
  /** 清空状态 */
  clear: () => void
  /** 设置会话 ID */
  setSessionId: (id: string | null) => void
}

/**
 * 使用 AI Chat Hook
 *
 * 这是基于新 AI Runtime 架构的聊天 Hook。
 * 使用通用的 AIEvent 而不是 Claude 特定的 StreamEvent。
 *
 * @param onEvent 可选的事件回调
 * @param config 可选的运行时配置
 */
export function useAIChat(
  onEvent?: (event: AIEvent) => void,
  config?: { workspaceDir?: string }
): AIChatReturn {
  const [state, setState] = useState<AIChatState>({
    isStreaming: false,
    sessionId: null,
    currentContent: '',
    error: null,
  })

  useEffect(() => {
    const eventBus = getEventBus({ debug: false })

    // 订阅各种事件
    const unsubscribers = [
      // session_start
      eventBus.on('session_start', (event) => {
        const e = event as any
        setState((prev) => ({
          ...prev,
          sessionId: e.sessionId,
          isStreaming: true,
          error: null,
          currentContent: '',
        }))
        if (onEvent) onEvent(event)
      }),

      // session_end
      eventBus.on('session_end', (event) => {
        setState((prev) => ({
          ...prev,
          isStreaming: false,
        }))
        if (onEvent) onEvent(event)
      }),

      // token
      eventBus.on('token', (event) => {
        const e = event as any
        setState((prev) => ({
          ...prev,
          currentContent: prev.currentContent + e.value,
        }))
        if (onEvent) onEvent(event)
      }),

      // assistant_message
      eventBus.on('assistant_message', (event) => {
        const e = event as any
        if (e.isDelta) {
          setState((prev) => ({
            ...prev,
            currentContent: prev.currentContent + e.content,
          }))
        } else {
          setState((prev) => ({
            ...prev,
            currentContent: e.content,
          }))
        }
        if (onEvent) onEvent(event)
      }),

      // error
      eventBus.on('error', (event) => {
        const e = event as any
        setState((prev) => ({
          ...prev,
          error: e.error,
          isStreaming: false,
        }))
        if (onEvent) onEvent(event)
      }),
    ]

    return () => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [onEvent, config?.workspaceDir])

  /**
   * 发送消息
   */
  const sendMessage = async (message: string) => {
    const { invoke } = await import('@tauri-apps/api/core')

    setState((prev) => ({
      ...prev,
      error: null,
      currentContent: '',
      isStreaming: true,
    }))

    try {
      const sessionId = await invoke<string>('start_chat', {
        message,
        workDir: config?.workspaceDir,
      })
      setState((prev) => ({ ...prev, sessionId }))
    } catch (err) {
      const error = err instanceof Error ? err.message : '发送消息失败'
      setState((prev) => ({ ...prev, error, isStreaming: false }))
    }
  }

  /**
   * 继续对话
   */
  const continueChat = async (message = '') => {
    if (!state.sessionId) {
      setState((prev) => ({ ...prev, error: '没有活动会话' }))
      return
    }

    const { invoke } = await import('@tauri-apps/api/core')

    setState((prev) => ({
      ...prev,
      error: null,
      currentContent: message ? '' : prev.currentContent,
      isStreaming: true,
    }))

    try {
      await invoke('continue_chat', {
        sessionId: state.sessionId,
        message,
      })
    } catch (err) {
      const error = err instanceof Error ? err.message : '继续对话失败'
      setState((prev) => ({ ...prev, error, isStreaming: false }))
    }
  }

  /**
   * 中断对话
   */
  const interrupt = async () => {
    if (!state.sessionId) return

    const { invoke } = await import('@tauri-apps/api/core')

    try {
      await invoke('interrupt_chat', { sessionId: state.sessionId })
      setState((prev) => ({ ...prev, isStreaming: false }))
    } catch (err) {
      console.error('[useAIChat] Interrupt failed:', err)
    }
  }

  /**
   * 清空状态
   */
  const clear = () => {
    setState({
      isStreaming: false,
      sessionId: null,
      currentContent: '',
      error: null,
    })
  }

  /**
   * 设置会话 ID
   */
  const setSessionId = (id: string | null) => {
    setState((prev) => ({ ...prev, sessionId: id }))
  }

  return {
    ...state,
    sendMessage,
    continueChat,
    interrupt,
    clear,
    setSessionId,
  }
}

/**
 * 重新导出 AIEvent 类型，方便使用
 */
export type { AIEvent }
