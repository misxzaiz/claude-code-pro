/**
 * AI Chat Store - 基于 AI Runtime 的新版聊天状态管理
 *
 * 这个 Store 使用通用的 AIEvent 而不是 Claude 特定的 StreamEvent。
 * 这是重构后的标准聊天状态管理。
 */

import { create } from 'zustand'
import type { Message, ToolStatus } from '../types'
import type { AIEvent } from '../ai-runtime'
import { getAIRuntime } from '../services/aiRuntimeService'
import { getIFlowHistoryService } from '../services/iflowHistoryService'
import { useToolPanelStore } from './toolPanelStore'
import { useConfigStore } from './configStore'
import { useWorkspaceStore } from './workspaceStore'

/** 最大保留消息数量 */
const MAX_MESSAGES = 500

/** 消息保留阈值 */
const MESSAGE_ARCHIVE_THRESHOLD = 550

/** 本地存储键 */
const STORAGE_KEY = 'ai_chat_state_backup'
const STORAGE_VERSION = '2'
/** 会话历史存储键 */
const SESSION_HISTORY_KEY = 'ai_chat_session_history'
/** 最大会话历史数量 */
const MAX_SESSION_HISTORY = 50

/**
 * 历史会话记录（localStorage 存储）
 */
interface HistoryEntry {
  id: string
  title: string
  timestamp: string
  messageCount: number
  engineId: 'claude-code' | 'iflow'  // 引擎 ID
  data: {
    messages: Message[]
    archivedMessages: Message[]
  }
}

/**
 * 统一的历史条目（包含 localStorage 和 IFlow 的会话）
 */
export interface UnifiedHistoryItem {
  id: string
  title: string
  timestamp: string
  messageCount: number
  engineId: 'claude-code' | 'iflow'
  source: 'local' | 'iflow'
  fileSize?: number
  inputTokens?: number
  outputTokens?: number
}

/**
 * 工具调用信息（Store 内部使用）
 */
interface StoreToolCall {
  id: string
  name: string
  status: ToolStatus
  args?: Record<string, unknown>
  input?: Record<string, unknown>
  output?: string
  startedAt: string
  completedAt?: string
}

/**
 * AI Chat State
 */
interface AIChatState {
  /** 消息列表 */
  messages: Message[]
  /** 归档的消息列表 */
  archivedMessages: Message[]
  /** 归档是否展开 */
  isArchiveExpanded: boolean
  /** 当前会话 ID */
  conversationId: string | null
  /** 当前引擎 ID */
  currentEngineId: 'claude-code' | 'iflow' | null
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
  /** 是否正在加载历史 */
  isLoadingHistory: boolean

  /** 添加消息 */
  addMessage: (message: Message) => void
  /** 清空消息 */
  clearMessages: () => void
  /** 设置会话 ID */
  setConversationId: (id: string | null) => void
  /** 设置引擎 ID */
  setCurrentEngineId: (engineId: 'claude-code' | 'iflow' | null) => void
  /** 设置流式状态 */
  setStreaming: (streaming: boolean) => void
  /** 完成当前消息 */
  finishMessage: () => void
  /** 设置错误 */
  setError: (error: string | null) => void

  /** 处理 AIEvent */
  handleAIEvent: (event: AIEvent) => void

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
  /** 保存会话到历史 */
  saveToHistory: (title?: string) => void

  /** 获取统一会话历史（包含 localStorage 和 IFlow） */
  getUnifiedHistory: () => Promise<UnifiedHistoryItem[]>
  /** 从历史恢复会话 */
  restoreFromHistory: (sessionId: string, engineId?: 'claude-code' | 'iflow') => Promise<boolean>
  /** 删除历史会话 */
  deleteHistorySession: (sessionId: string, source?: 'local' | 'iflow') => void
  /** 清空历史 */
  clearHistory: () => void

  /** 从本地存储恢复状态 */
  restoreFromStorage: () => boolean
}

/**
 * 当前活跃的工具调用映射
 * 用于追踪 tool_call_start 和 tool_call_end 之间的对应关系
 */
const activeToolCalls = new Map<string, StoreToolCall>()

export const useAIChatStore = create<AIChatState>((set, get) => ({
  messages: [],
  archivedMessages: [],
  isArchiveExpanded: false,
  conversationId: null,
  currentEngineId: null,
  isStreaming: false,
  currentContent: '',
  error: null,
  maxMessages: MAX_MESSAGES,
  isInitialized: false,
  isLoadingHistory: false,

  addMessage: (message) => {
    set((state) => {
      const newMessages = [...state.messages, message]

      // 归档旧消息
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
    })
    useToolPanelStore.getState().clearTools()
  },

  setConversationId: (id) => {
    set({ conversationId: id })
  },

  setCurrentEngineId: (engineId) => {
    set({ currentEngineId: engineId })
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
      })
    }

    get().saveToStorage()
  },

  setError: (error) => {
    set({ error })
  },

  handleAIEvent: (event) => {
    const state = get()
    const toolPanelStore = useToolPanelStore.getState()

    switch (event.type) {
      case 'session_start':
        set({
          conversationId: event.sessionId,
          isStreaming: true,
          currentContent: '',
          error: null,
        })
        console.log('[AIChatStore] Session started:', event.sessionId)
        toolPanelStore.clearTools()
        break

      case 'session_end':
        state.finishMessage()
        set({ isStreaming: false })
        console.log('[AIChatStore] Session ended:', event.reason)
        // 清理活跃的工具调用
        activeToolCalls.clear()
        break

      case 'user_message':
        // 用户消息由 sendMessage 直接添加，这里不需要处理
        break

      case 'assistant_message':
        if (event.isDelta) {
          // 增量内容
          set((state) => ({
            currentContent: state.currentContent + event.content,
          }))
        } else {
          // 完整消息
          set({ currentContent: event.content })
        }

        // 处理工具调用
        if (event.toolCalls) {
          for (const tool of event.toolCalls) {
            activeToolCalls.set(tool.id, {
              id: tool.id,
              name: tool.name,
              status: tool.status,
              args: tool.args,
              startedAt: new Date().toISOString(),
            })

            toolPanelStore.addTool({
              id: tool.id,
              name: tool.name,
              status: tool.status,
              input: tool.args,
              startedAt: new Date().toISOString(),
            })
          }
        }
        break

      case 'token':
        set((state) => ({
          currentContent: state.currentContent + event.value,
        }))
        break

      case 'tool_call_start': {
        const toolId = crypto.randomUUID()
        const toolCall: StoreToolCall = {
          id: toolId,
          name: event.tool,
          status: 'running',
          input: event.args,
          startedAt: new Date().toISOString(),
        }
        activeToolCalls.set(event.tool, toolCall)

        toolPanelStore.addTool({
          id: toolId,
          name: event.tool,
          status: 'running',
          input: event.args,
          startedAt: new Date().toISOString(),
        })
        break
      }

      case 'tool_call_end': {
        // 通过名称查找活跃的工具调用
        const toolEntry = Array.from(activeToolCalls.entries()).find(
          ([, tool]) => tool.name === event.tool && tool.status === 'running'
        )

        if (toolEntry) {
          const [, toolCall] = toolEntry
          toolCall.status = event.success ? 'completed' : 'failed'
          toolCall.output = String(event.result || '')
          toolCall.completedAt = new Date().toISOString()

          // 在工具面板中更新（需要找到对应的工具 ID）
          const tools = toolPanelStore.tools
          const runningTool = tools.find(
            (t) => t.name === event.tool && t.status === 'running'
          )
          if (runningTool) {
            toolPanelStore.updateTool(runningTool.id, {
              status: event.success ? 'completed' : 'failed',
              output: String(event.result || ''),
              completedAt: new Date().toISOString(),
            })
          }
        }
        break
      }

      case 'progress':
        // 进度事件可以用于 UI 显示
        console.log('[AIChatStore] Progress:', event.message, event.percent)
        break

      case 'error':
        set({
          error: event.error,
          isStreaming: false,
        })
        break
    }
  },

  sendMessage: async (content, workspaceDir) => {
    const { conversationId } = get()

    // 获取当前工作区路径作为默认值
    // 如果外部传入了 workspaceDir 则使用传入值，否则使用当前选中的工作区
    const actualWorkspaceDir = workspaceDir ?? useWorkspaceStore.getState().getCurrentWorkspace()?.path

    // 添加用户消息
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    get().addMessage(userMessage)

    // 清空当前内容，开始流式传输
    set({ currentContent: '', isStreaming: true, error: null })

    // 清空工具面板
    useToolPanelStore.getState().clearTools()

    // 从配置获取引擎设置
    const config = useConfigStore.getState().config
    const engineId = config?.defaultEngine || 'claude-code'

    try {
      const service = getAIRuntime({ workspaceDir: actualWorkspaceDir, engineId })

      const sessionId = await service.sendMessage(
        content,
        conversationId || undefined
      )

      set({ conversationId: sessionId })
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

    // 获取当前工作区路径
    const actualWorkspaceDir = useWorkspaceStore.getState().getCurrentWorkspace()?.path

    set({ isStreaming: true, error: null })

    // 从配置获取引擎设置
    const config = useConfigStore.getState().config
    const engineId = config?.defaultEngine || 'claude-code'

    try {
      const service = getAIRuntime({ workspaceDir: actualWorkspaceDir, engineId })
      await service.sendMessage(prompt, conversationId)
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
      const service = getAIRuntime()
      await service.interrupt(conversationId)
      set({ isStreaming: false })
      get().finishMessage()
    } catch (e) {
      console.error('[AIChatStore] Interrupt failed:', e)
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      console.error('[AIChatStore] 保存状态失败:', e)
    }
  },

  saveToHistory: (title?: string) => {
    try {
      const state = get()
      if (!state.conversationId || state.messages.length === 0) return

      // 获取当前引擎 ID
      const config = useConfigStore.getState().config
      const engineId: 'claude-code' | 'iflow' = config?.defaultEngine || 'claude-code'

      // 获取现有历史
      const historyJson = localStorage.getItem(SESSION_HISTORY_KEY)
      const history = historyJson ? JSON.parse(historyJson) : []

      // 生成标题
      const sessionTitle = title ||
        (state.messages[0]?.content.slice(0, 50) + '...') ||
        '新对话'

      // 创建历史记录
      const historyEntry: HistoryEntry = {
        id: state.conversationId,
        title: sessionTitle,
        timestamp: new Date().toISOString(),
        messageCount: state.messages.length,
        engineId,  // 保存引擎 ID
        data: {
          messages: state.messages,
          archivedMessages: state.archivedMessages,
        }
      }

      // 移除同ID的旧记录
      const filteredHistory = history.filter((h: HistoryEntry) => h.id !== state.conversationId)

      // 添加新记录到开头
      filteredHistory.unshift(historyEntry)

      // 限制历史数量
      const limitedHistory = filteredHistory.slice(0, MAX_SESSION_HISTORY)

      localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(limitedHistory))
      console.log('[AIChatStore] 会话已保存到历史:', sessionTitle, '引擎:', engineId)
    } catch (e) {
      console.error('[AIChatStore] 保存历史失败:', e)
    }
  },

  /** 获取统一会话历史（包含 localStorage 和 IFlow） */
  getUnifiedHistory: async () => {
    const items: UnifiedHistoryItem[] = []
    const iflowService = getIFlowHistoryService()

    try {
      // 1. 获取 localStorage 中的会话历史
      const historyJson = localStorage.getItem(SESSION_HISTORY_KEY)
      const localHistory: HistoryEntry[] = historyJson ? JSON.parse(historyJson) : []

      for (const h of localHistory) {
        items.push({
          id: h.id,
          title: h.title,
          timestamp: h.timestamp,
          messageCount: h.messageCount,
          engineId: h.engineId || 'claude-code',
          source: 'local',
        })
      }

      // 2. 获取 IFlow 会话列表（如果当前工作区存在）
      try {
        const iflowSessions = await iflowService.listSessions()
        for (const session of iflowSessions) {
          // 排除已经存在于 localStorage 的会话（避免重复）
          if (!items.find(item => item.id === session.sessionId)) {
            items.push({
              id: session.sessionId,
              title: session.title,
              timestamp: session.updatedAt,
              messageCount: session.messageCount,
              engineId: 'iflow',
              source: 'iflow',
              fileSize: session.fileSize,
              inputTokens: session.inputTokens,
              outputTokens: session.outputTokens,
            })
          }
        }
      } catch (e) {
        console.warn('[AIChatStore] 获取 IFlow 会话失败:', e)
      }

      // 3. 按时间戳排序
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      return items
    } catch (e) {
      console.error('[AIChatStore] 获取统一历史失败:', e)
      return []
    }
  },

  /** 从历史恢复会话 */
  restoreFromHistory: async (sessionId: string, engineId?: 'claude-code' | 'iflow') => {
    try {
      set({ isLoadingHistory: true })

      // 1. 先尝试从 localStorage 恢复
      const historyJson = localStorage.getItem(SESSION_HISTORY_KEY)
      const localHistory = historyJson ? JSON.parse(historyJson) : []
      const localSession = localHistory.find((h: HistoryEntry) => h.id === sessionId)

      if (localSession) {
        set({
          messages: localSession.data.messages || [],
          archivedMessages: localSession.data.archivedMessages || [],
          conversationId: localSession.id,
          currentEngineId: localSession.engineId,
          currentContent: '',
          isStreaming: false,
          error: null,
          isLoadingHistory: false,
        })

        get().saveToStorage()
        console.log('[AIChatStore] 已从本地历史恢复会话:', localSession.title)
        return true
      }

      // 2. 如果指定了 IFlow 或未指定，尝试从 IFlow 恢复
      if (!engineId || engineId === 'iflow') {
        const iflowService = getIFlowHistoryService()
        const messages = await iflowService.getSessionHistory(sessionId)

        if (messages.length > 0) {
          const convertedMessages = iflowService.convertMessagesToFormat(messages)
          const toolCalls = iflowService.extractToolCalls(messages)

          // 设置工具面板
          useToolPanelStore.getState().clearTools()
          for (const tool of toolCalls) {
            useToolPanelStore.getState().addTool(tool)
          }

          set({
            messages: convertedMessages,
            archivedMessages: [],
            conversationId: sessionId,
            currentEngineId: 'iflow',
            currentContent: '',
            isStreaming: false,
            error: null,
            isLoadingHistory: false,
          })

          console.log('[AIChatStore] 已从 IFlow 恢复会话:', sessionId)
          return true
        }
      }

      set({ isLoadingHistory: false })
      return false
    } catch (e) {
      console.error('[AIChatStore] 从历史恢复失败:', e)
      set({ isLoadingHistory: false })
      return false
    }
  },

  deleteHistorySession: (sessionId: string, source?: 'local' | 'iflow') => {
    try {
      if (source === 'iflow' || (!source && sessionId.startsWith('session-'))) {
        // IFlow 会话不能删除，只能忽略
        console.log('[AIChatStore] IFlow 会话无法删除，仅作忽略:', sessionId)
        return
      }

      // 删除本地历史
      const historyJson = localStorage.getItem(SESSION_HISTORY_KEY)
      const history = historyJson ? JSON.parse(historyJson) : []

      const filteredHistory = history.filter((h: HistoryEntry) => h.id !== sessionId)
      localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(filteredHistory))
    } catch (e) {
      console.error('[AIChatStore] 删除历史会话失败:', e)
    }
  },

  clearHistory: () => {
    try {
      localStorage.removeItem(SESSION_HISTORY_KEY)
      console.log('[AIChatStore] 历史已清空')
    } catch (e) {
      console.error('[AIChatStore] 清空历史失败:', e)
    }
  },

  restoreFromStorage: () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return false

      const data = JSON.parse(stored)

      if (data.version !== STORAGE_VERSION) {
        console.warn('[AIChatStore] 存储版本不匹配，忽略')
        return false
      }

      // 延长恢复时间限制到 24 小时
      const storedTime = new Date(data.timestamp).getTime()
      const now = Date.now()
      if (now - storedTime > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY)
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

      // 不立即删除，保留用于恢复
      return true
    } catch (e) {
      console.error('[AIChatStore] 恢复状态失败:', e)
      return false
    }
  },
}))
