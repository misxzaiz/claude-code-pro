/**
 * AI Chat Hook - 基于 AI Runtime 的新版聊天 Hook
 *
 * 这个 Hook 使用通用的 AIEvent 而不是 Claude 特定的 StreamEvent。
 * 这是重构后的标准聊天 Hook。
 */

import { useEffect, useState } from 'react'
import type { AIEvent } from '../ai-runtime'
import { getAIRuntime } from '../services/aiRuntimeService'

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
    const service = getAIRuntime(config)

    // 设置事件监听
    const unsubscribe = service.onEvent((event) => {
      // 调用外部回调
      if (onEvent) {
        onEvent(event)
      }

      // 内部状态更新
      handleEvent(event)
    })

    // 初始化服务
    service.initialize().catch((err) => {
      console.error('[useAIChat] Failed to initialize:', err)
    })

    return () => {
      unsubscribe()
    }
  }, [onEvent, config?.workspaceDir])

  /**
   * 处理 AIEvent
   */
  const handleEvent = (event: AIEvent) => {
    switch (event.type) {
      case 'session_start':
        setState((prev) => ({
          ...prev,
          sessionId: event.sessionId,
          isStreaming: true,
          error: null,
          currentContent: '',
        }))
        break

      case 'session_end':
        setState((prev) => ({
          ...prev,
          isStreaming: false,
        }))
        break

      case 'token':
        setState((prev) => ({
          ...prev,
          currentContent: prev.currentContent + event.value,
        }))
        break

      case 'assistant_message':
        if (event.isDelta) {
          setState((prev) => ({
            ...prev,
            currentContent: prev.currentContent + event.content,
          }))
        } else {
          setState((prev) => ({
            ...prev,
            currentContent: event.content,
          }))
        }
        break

      case 'error':
        setState((prev) => ({
          ...prev,
          error: event.error,
          isStreaming: false,
        }))
        break
    }
  }

  /**
   * 发送消息
   */
  const sendMessage = async (message: string) => {
    const service = getAIRuntime(config)

    setState((prev) => ({
      ...prev,
      error: null,
      currentContent: '',
      isStreaming: true,
    }))

    try {
      const sessionId = await service.sendMessage(message, state.sessionId || undefined)
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

    const service = getAIRuntime(config)

    setState((prev) => ({
      ...prev,
      error: null,
      currentContent: message ? '' : prev.currentContent,
      isStreaming: true,
    }))

    try {
      await service.sendMessage(message, state.sessionId)
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

    const service = getAIRuntime(config)

    try {
      await service.interrupt(state.sessionId)
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
