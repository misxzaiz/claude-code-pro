/**
 * 事件驱动的 Chat Store
 *
 * 完全基于 AIEvent 和 EventBus 的聊天状态管理。
 * 不再直接依赖 StreamEvent，通过订阅 EventBus 获取事件。
 */

import { create } from 'zustand'
import type { Message } from '../types'
import { getEventBus } from '../ai-runtime'
import { useToolPanelStore } from './toolPanelStore'

/** 最大保留消息数量 */
const MAX_MESSAGES = 500

/** 消息保留阈值 */
const MESSAGE_ARCHIVE_THRESHOLD = 550

/** 本地存储键 */
const STORAGE_KEY = 'event_chat_state_backup'
const STORAGE_VERSION = '3'

/**
 * 事件驱动 Chat State
 */
interface EventChatState {
  /** 消息列表 */
  messages: Message[]
  /** 归档的消息列表 */
  archivedMessages: Message[]
  /** 归档是否展开 */
  isArchiveExpanded: boolean
  /** 当前会话 ID */
  conversationId: string | null
  /** 是否正在流式传输 */
  isStreaming: boolean
  /** 当前正在输入的内容 */
  currentContent: string
  /** 错误 */
  error: string | null
  /** 最大消息数配置 */
  maxMessages: number
  /** 是否已初始化 */
  isInitialized: boolean
  /** 当前进度消息 */
  progressMessage: string | null
  /** 活跃的工具调用列表 */
  activeToolCalls: Map<string, { name: string; status: string }>

  /** 添加消息 */
  addMessage: (message: Message) => void
  /** 清空消息 */
  clearMessages: () => void
  /** 设置会话 ID */
  setConversationId: (id: string | null) => void
  /** 设置流式状态 */
  setStreaming: (streaming: boolean) => void
  /** 完成当前消息 */
  finishMessage: () => void
  /** 设置错误 */
  setError: (error: string | null) => void
  /** 设置进度消息 */
  setProgressMessage: (message: string | null) => void

  /** 初始化事件监听 */
  initializeEventListeners: () => () => void

  /** 发送消息 */
  sendMessage: (content: string, workspaceDir?: string) => Promise<void>
  /** 继续会话 */
  continueChat: (prompt?: string) => Promise<void>
  /** 中断会话 */
  interruptChat: () => Promise<void>

  /** 设置最大消息数 */
  setMaxMessages: (max: number) => void
  /** 切换归档展开状态 */
  toggleArchive: () => void
  /** 加载归档消息 */
  loadArchivedMessages: () => void

  /** 保存状态到本地存储 */
  saveToStorage: () => void
  /** 从本地存储恢复状态 */
  restoreFromStorage: () => boolean
}

/**
 * 事件驱动的 Chat Store
 */
export const useEventChatStore = create<EventChatState>((set, get) => ({
  messages: [],
  archivedMessages: [],
  isArchiveExpanded: false,
  conversationId: null,
  isStreaming: false,
  currentContent: '',
  error: null,
  maxMessages: MAX_MESSAGES,
  isInitialized: false,
  progressMessage: null,
  activeToolCalls: new Map(),

  addMessage: (message) => {
    set((state) => {
      const newMessages = [...state.messages, message]

      if (newMessages.length > MESSAGE_ARCHIVE_THRESHOLD) {
        const archiveCount = newMessages.length - state.maxMessages
        const toArchive = newMessages.slice(0, archiveCount)
        const remaining = newMessages.slice(archiveCount)

        return {
          messages: remaining,
          archivedMessages: [...toArchive, ...state.archivedMessages],
        }
      }

      return { messages: newMessages }
    })

    get().saveToStorage()
  },

  clearMessages: () => {
    set({
      messages: [],
      archivedMessages: [],
      isArchiveExpanded: false,
      currentContent: '',
      conversationId: null,
      progressMessage: null,
      activeToolCalls: new Map(),
    })
    useToolPanelStore.getState().clearTools()
  },

  setConversationId: (id) => {
    set({ conversationId: id })
  },

  setStreaming: (streaming) => {
    set({ isStreaming: streaming })
  },

  finishMessage: () => {
    const { currentContent, messages } = get()
    const toolPanelStore = useToolPanelStore.getState()

    if (currentContent) {
      const tools = toolPanelStore.tools
      const toolSummary =
        tools.length > 0
          ? {
              count: tools.length,
              names: Array.from(new Set(tools.map((t) => t.name))),
            }
          : undefined

      const newMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: currentContent,
        timestamp: new Date().toISOString(),
        toolSummary,
      }
      set({
        messages: [...messages, newMessage],
        currentContent: '',
        progressMessage: null,
      })
    }

    get().saveToStorage()
  },

  setError: (error) => {
    set({ error })
  },

  setProgressMessage: (message) => {
    set({ progressMessage: message })
  },

  /**
   * 初始化事件监听
   * 这是事件驱动架构的核心方法
   */
  initializeEventListeners: () => {
    const eventBus = getEventBus({ debug: false })
    const toolPanelStore = useToolPanelStore.getState()

    // 订阅所有 AIEvent - 使用 any 作为事件类型，因为我们会检查 type 字段
    const unsubscribers = [
      // session_start
      eventBus.on('session_start', (event) => {
        const e = event as any
        set({
          conversationId: e.sessionId,
          isStreaming: true,
          currentContent: '',
          error: null,
        })
        toolPanelStore.clearTools()
      }),

      // session_end
      eventBus.on('session_end', () => {
        const state = get()
        state.finishMessage()
        set({ isStreaming: false, progressMessage: null })
      }),

      // user_message
      eventBus.on('user_message', (event) => {
        const e = event as any
        const userMessage: Message = {
          id: crypto.randomUUID(),
          role: 'user',
          content: e.content,
          timestamp: new Date().toISOString(),
        }
        get().addMessage(userMessage)
      }),

      // assistant_message (完整消息)
      eventBus.on('assistant_message', (event) => {
        const e = event as any
        if (!e.isDelta) {
          set({ currentContent: e.content })
        }
      }),

      // token (增量文本)
      eventBus.on('token', (event) => {
        const e = event as any
        set((state) => ({
          currentContent: state.currentContent + e.value,
        }))
      }),

      // tool_call_start
      eventBus.on('tool_call_start', (event) => {
        const e = event as any
        const toolId = crypto.randomUUID()
        const toolCall = { name: e.tool, status: 'running' as const }

        set((state) => {
          const newMap = new Map(state.activeToolCalls)
          newMap.set(e.tool, toolCall)
          return { activeToolCalls: newMap }
        })

        toolPanelStore.addTool({
          id: toolId,
          name: e.tool,
          status: 'running',
          input: e.args,
          startedAt: new Date().toISOString(),
        })

        set({ progressMessage: `调用工具: ${e.tool}` })
      }),

      // tool_call_end
      eventBus.on('tool_call_end', (event) => {
        const e = event as any
        const toolPanelStore = useToolPanelStore.getState()
        const tools = toolPanelStore.tools
        const runningTool = tools.find(
          (t) => t.name === e.tool && t.status === 'running'
        )

        if (runningTool) {
          toolPanelStore.updateTool(runningTool.id, {
            status: e.success ? 'completed' : 'failed',
            output: String(e.result || ''),
            completedAt: new Date().toISOString(),
          })
        }

        set((state) => {
          const newMap = new Map(state.activeToolCalls)
          newMap.delete(e.tool)
          return { activeToolCalls: newMap, progressMessage: `工具完成: ${e.tool}` }
        })
      }),

      // progress
      eventBus.on('progress', (event) => {
        const e = event as any
        set({ progressMessage: e.message || null })
      }),

      // error
      eventBus.on('error', (event) => {
        const e = event as any
        set({
          error: e.error,
          isStreaming: false,
        })
      }),
    ]

    // 返回清理函数
    return () => {
      unsubscribers.forEach((unsub) => unsub())
    }
  },

  sendMessage: async (content, workspaceDir) => {
    const { conversationId } = get()

    // 添加用户消息
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    get().addMessage(userMessage)

    set({ currentContent: '', isStreaming: true, error: null })

    useToolPanelStore.getState().clearTools()

    try {
      const { invoke } = await import('@tauri-apps/api/core')

      if (conversationId) {
        await invoke('continue_chat', {
          sessionId: conversationId,
          message: content,
          workDir: workspaceDir,
        })
      } else {
        const newSessionId = await invoke<string>('start_chat', {
          message: content,
          workDir: workspaceDir,
        })
        set({ conversationId: newSessionId })
      }
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '发送消息失败',
        isStreaming: false,
      })
    }
  },

  continueChat: async (prompt = '') => {
    const { conversationId } = get()
    if (!conversationId) {
      set({ error: '没有活动会话', isStreaming: false })
      return
    }

    set({ isStreaming: true, error: null })

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('continue_chat', {
        sessionId: conversationId,
        message: prompt,
      })
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '继续对话失败',
        isStreaming: false,
      })
    }
  },

  interruptChat: async () => {
    const { conversationId } = get()
    if (!conversationId) return

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('interrupt_chat', { sessionId: conversationId })
      set({ isStreaming: false })
      get().finishMessage()
    } catch (e) {
      console.error('[EventChatStore] Interrupt failed:', e)
    }
  },

  setMaxMessages: (max) => {
    set({ maxMessages: Math.max(100, max) })

    const { messages, archivedMessages } = get()
    if (messages.length > max) {
      const archiveCount = messages.length - max
      const toArchive = messages.slice(0, archiveCount)
      const remaining = messages.slice(archiveCount)

      set({
        messages: remaining,
        archivedMessages: [...toArchive, ...archivedMessages],
      })
    }
  },

  toggleArchive: () => {
    set((state) => ({
      isArchiveExpanded: !state.isArchiveExpanded,
    }))
  },

  loadArchivedMessages: () => {
    const { archivedMessages } = get()
    if (archivedMessages.length === 0) return

    set({
      messages: [...archivedMessages, ...get().messages],
      archivedMessages: [],
      isArchiveExpanded: false,
    })
  },

  saveToStorage: () => {
    try {
      const state = get()
      const data = {
        version: STORAGE_VERSION,
        timestamp: new Date().toISOString(),
        messages: state.messages,
        archivedMessages: state.archivedMessages,
        conversationId: state.conversationId,
        currentContent: state.currentContent,
        isStreaming: state.isStreaming,
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      console.error('[EventChatStore] 保存状态失败:', e)
    }
  },

  restoreFromStorage: () => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (!stored) return false

      const data = JSON.parse(stored)

      if (data.version !== STORAGE_VERSION) {
        console.warn('[EventChatStore] 存储版本不匹配，忽略')
        return false
      }

      const storedTime = new Date(data.timestamp).getTime()
      const now = Date.now()
      if (now - storedTime > 60 * 60 * 1000) {
        sessionStorage.removeItem(STORAGE_KEY)
        return false
      }

      set({
        messages: data.messages || [],
        archivedMessages: data.archivedMessages || [],
        conversationId: data.conversationId || null,
        currentContent: data.currentContent || '',
        isStreaming: false,
        isInitialized: true,
      })

      sessionStorage.removeItem(STORAGE_KEY)
      return true
    } catch (e) {
      console.error('[EventChatStore] 恢复状态失败:', e)
      return false
    }
  },
}))
