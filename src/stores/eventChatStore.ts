/**
 * 事件驱动的 Chat Store
 *
 * 完全基于 AIEvent 和 EventBus 的聊天状态管理。
 * 支持新的分层对话流消息类型（ToolMessage、ToolGroupMessage）。
 */

import { create } from 'zustand'
import type { ChatMessage, ToolChatMessage, ToolGroupChatMessage, ToolStatus } from '../types'
import { getEventBus } from '../ai-runtime'
import { useToolPanelStore } from './toolPanelStore'
import {
  generateToolSummary,
  generateToolGroupSummary,
  calculateDuration,
} from '../utils/toolSummary'

/** 最大保留消息数量 */
const MAX_MESSAGES = 500

/** 消息保留阈值 */
const MESSAGE_ARCHIVE_THRESHOLD = 550

/** 本地存储键 */
const STORAGE_KEY = 'event_chat_state_backup'
const STORAGE_VERSION = '4' // 版本升级：支持新消息类型

// ============================================================================
// 辅助函数：解析 IFlow/Claude Code 的消息内容格式
// ============================================================================

/**
 * 从消息内容中提取纯文本
 *
 * IFlow 格式：content 是数组，包含 text 和 tool_use 块
 * Claude Code 格式：content 可能是字符串或数组
 */
function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    const texts: string[] = []
    for (const item of content) {
      if (item && typeof item === 'object') {
        if ('type' in item && item.type === 'text' && 'text' in item) {
          texts.push(String(item.text))
        }
      }
    }
    return texts.join('')
  }

  return ''
}

/**
 * 从消息内容中提取工具调用
 *
 * IFlow 格式：content 数组中的 tool_use 块
 */
interface ToolUse {
  id: string
  name: string
  input: unknown
}

function extractToolUsesFromContent(content: unknown): ToolUse[] {
  const toolUses: ToolUse[] = []

  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === 'object') {
        if ('type' in item && item.type === 'tool_use') {
          toolUses.push({
            id: String(item.id || crypto.randomUUID()),
            name: String(item.name || 'unknown'),
            input: item.input,
          })
        }
      }
    }
  }

  return toolUses
}

/**
 * 工具组状态
 */
interface ToolGroupState {
  id: string
  toolIds: string[]
  toolNames: string[]
  startedAt: string
  messageId: string // 对应的 ToolGroupChatMessage ID
}

/**
 * 事件驱动 Chat State
 */
interface EventChatState {
  /** 消息列表（使用新的 ChatMessage 类型） */
  messages: ChatMessage[]
  /** 归档的消息列表 */
  archivedMessages: ChatMessage[]
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

  /** 当前活跃的工具组 */
  activeToolGroup: ToolGroupState | null
  /** 当前助手消息 ID（用于关联工具） */
  currentAssistantMessageId: string | null
  /** 工具消息映射（toolId -> messageId） */
  toolMessageMap: Map<string, string>

  /** 添加消息 */
  addMessage: (message: ChatMessage) => void
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

  /** 添加工具消息 */
  addToolMessage: (toolId: string, toolName: string, input: Record<string, unknown>) => void
  /** 更新工具消息 */
  updateToolMessage: (toolId: string, status: ToolStatus, output?: string, error?: string) => void
  /** 获取工具消息 */
  getToolMessage: (toolId: string) => ToolChatMessage | undefined
  /** 更新工具组状态 */
  updateToolGroupStatus: () => void
  /** 关闭工具组 */
  closeToolGroup: () => void

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
  activeToolGroup: null,
  currentAssistantMessageId: null,
  toolMessageMap: new Map(),

  addMessage: (message) => {
    set((state) => {
      const newMessages = [...state.messages, message]

      if (newMessages.length > MESSAGE_ARCHIVE_THRESHOLD) {
        const archiveCount = newMessages.length - state.maxMessages
        const toArchive = newMessages.slice(0, archiveCount)
        const remaining = newMessages.slice(archiveCount)

        return {
          messages: remaining,
          archivedMessages: toArchive,
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
      activeToolGroup: null,
      currentAssistantMessageId: null,
      toolMessageMap: new Map(),
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

    if (currentContent) {
      const newMessage: ChatMessage = {
        id: crypto.randomUUID(),
        type: 'assistant',
        content: currentContent,
        timestamp: new Date().toISOString(),
      }
      set({
        messages: [...messages, newMessage],
        currentContent: '',
        progressMessage: null,
        currentAssistantMessageId: newMessage.id,
      })
    }

    // 关闭当前工具组
    const { activeToolGroup } = get()
    if (activeToolGroup) {
      get().closeToolGroup()
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
   * 添加工具消息
   */
  addToolMessage: (toolId, toolName, input) => {
    const { activeToolGroup, currentAssistantMessageId } = get()
    const toolPanelStore = useToolPanelStore.getState()
    const now = new Date().toISOString()

    // 生成智能摘要
    const summary = generateToolSummary(toolName, input, 'running')

    // 创建工具消息
    const toolMessage: ToolChatMessage = {
      id: crypto.randomUUID(),
      type: 'tool',
      timestamp: now,
      toolId,
      toolName,
      status: 'running',
      summary,
      input,
      relatedMessageId: currentAssistantMessageId ?? undefined,
      startedAt: now,
    }

    // 添加到消息列表
    get().addMessage(toolMessage)

    // 更新工具消息映射
    set((state) => {
      const newMap = new Map(state.toolMessageMap)
      newMap.set(toolId, toolMessage.id)
      return { toolMessageMap: newMap }
    })

    // 同步到工具面板
    toolPanelStore.addTool({
      id: toolId,
      name: toolName,
      status: 'running',
      input,
      startedAt: now,
    })

    // 如果没有活跃工具组，创建一个
    if (!activeToolGroup) {
      const groupId = crypto.randomUUID()
      const groupMessage: ToolGroupChatMessage = {
        id: groupId,
        type: 'tool_group',
        timestamp: now,
        toolIds: [toolId],
        toolNames: [toolName],
        status: 'running',
        summary: generateToolGroupSummary(1, 'running'),
        startedAt: now,
      }
      get().addMessage(groupMessage)

      set({
        activeToolGroup: {
          id: groupId,
          toolIds: [toolId],
          toolNames: [toolName],
          startedAt: now,
          messageId: groupId,
        },
      })
    } else {
      // 更新现有工具组
      const updatedToolIds = [...activeToolGroup.toolIds, toolId]
      const updatedToolNames = [...activeToolGroup.toolNames, toolName]
      const updatedGroupMessage: ToolGroupChatMessage = {
        id: activeToolGroup.messageId,
        type: 'tool_group',
        timestamp: now,
        toolIds: updatedToolIds,
        toolNames: updatedToolNames,
        status: 'running',
        summary: generateToolGroupSummary(updatedToolIds.length, 'running'),
        startedAt: activeToolGroup.startedAt,
      }

      // 更新消息列表中的工具组消息
      set((state) => ({
        messages: state.messages.map(msg =>
          msg.id === activeToolGroup.messageId ? updatedGroupMessage : msg
        ),
        activeToolGroup: {
          ...activeToolGroup,
          toolIds: updatedToolIds,
          toolNames: updatedToolNames,
        },
      }))
    }

    set({ progressMessage: summary })
  },

  /**
   * 更新工具消息
   */
  updateToolMessage: (toolId, status, output, error) => {
    const { toolMessageMap, messages, activeToolGroup } = get()
    const toolPanelStore = useToolPanelStore.getState()
    const messageId = toolMessageMap.get(toolId)

    if (!messageId) {
      console.warn('[EventChatStore] Tool message not found:', toolId)
      return
    }

    const now = new Date().toISOString()
    const toolMessage = messages.find(m => m.id === messageId) as ToolChatMessage

    if (!toolMessage) {
      console.warn('[EventChatStore] Tool message not found in messages:', messageId)
      return
    }

    // 计算时长
    const duration = calculateDuration(toolMessage.startedAt, now)

    // 生成新摘要（完成状态）
    const summary = status === 'completed' || status === 'failed'
      ? generateToolSummary(toolMessage.toolName, toolMessage.input, status)
      : toolMessage.summary

    // 更新工具消息
    const updatedToolMessage: ToolChatMessage = {
      ...toolMessage,
      status,
      summary,
      output,
      error,
      completedAt: now,
      duration,
    }

    set((state) => ({
      messages: state.messages.map(msg =>
        msg.id === messageId ? updatedToolMessage : msg
      ),
    }))

    // 同步到工具面板
    toolPanelStore.updateTool(toolId, {
      status,
      output: output ? String(output) : undefined,
      completedAt: now,
    })

    // 更新工具组状态
    if (activeToolGroup && activeToolGroup.toolIds.includes(toolId)) {
      get().updateToolGroupStatus()
    }

    set({
      progressMessage: summary,
    })
  },

  /**
   * 获取工具消息
   */
  getToolMessage: (toolId) => {
    const { toolMessageMap, messages } = get()
    const messageId = toolMessageMap.get(toolId)
    if (!messageId) return undefined
    return messages.find(m => m.id === messageId) as ToolChatMessage
  },

  /**
   * 更新工具组状态
   */
  updateToolGroupStatus: () => {
    const { activeToolGroup, toolMessageMap, messages } = get()

    if (!activeToolGroup) return

    // 获取工具组中所有工具的状态
    const toolMessages: ToolChatMessage[] = []
    for (const toolId of activeToolGroup.toolIds) {
      const messageId = toolMessageMap.get(toolId)
      if (messageId) {
        const msg = messages.find(m => m.id === messageId)
        if (msg && msg.type === 'tool') {
          toolMessages.push(msg)
        }
      }
    }

    // 计算组状态
    const completedCount = toolMessages.filter(t => t.status === 'completed').length
    const failedCount = toolMessages.filter(t => t.status === 'failed').length
    const runningCount = toolMessages.filter(t => t.status === 'running').length

    let groupStatus: ToolStatus = 'running'
    if (runningCount === 0) {
      if (failedCount === 0) {
        groupStatus = 'completed'
      } else if (completedCount === 0) {
        groupStatus = 'failed'
      } else {
        groupStatus = 'partial'
      }
    }

    const now = new Date().toISOString()
    const duration = calculateDuration(activeToolGroup.startedAt, now)

    // 更新工具组消息
    const updatedGroupMessage: ToolGroupChatMessage = {
      id: activeToolGroup.messageId,
      type: 'tool_group',
      timestamp: now,
      toolIds: activeToolGroup.toolIds,
      toolNames: activeToolGroup.toolNames,
      status: groupStatus,
      summary: generateToolGroupSummary(activeToolGroup.toolIds.length, groupStatus, completedCount),
      startedAt: activeToolGroup.startedAt,
      completedAt: groupStatus !== 'running' ? now : undefined,
      duration: groupStatus !== 'running' ? duration : undefined,
    }

    set((state) => ({
      messages: state.messages.map(msg =>
        msg.id === activeToolGroup.messageId ? updatedGroupMessage : msg
      ),
    }))
  },

  /**
   * 关闭工具组
   */
  closeToolGroup: () => {
    const { activeToolGroup } = get()
    if (activeToolGroup) {
      // 确保工具组状态是最新的
      get().updateToolGroupStatus()
      set({ activeToolGroup: null })
    }
  },

  /**
   * 初始化事件监听
   * 这是事件驱动架构的核心方法
   */
  initializeEventListeners: () => {
    const eventBus = getEventBus({ debug: false })
    const toolPanelStore = useToolPanelStore.getState()
    const cleanupCallbacks: Array<() => void> = []

    // ========== 1. 订阅 EventBus AIEvent（用于未来新架构） ==========
    const unsubscribers = [
      // session_start
      eventBus.on('session_start', (event) => {
        const e = event as any
        set({
          conversationId: e.sessionId,
          isStreaming: true,
          currentContent: '',
          error: null,
          activeToolGroup: null,
          currentAssistantMessageId: null,
          toolMessageMap: new Map(),
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
        const userMessage: ChatMessage = {
          id: crypto.randomUUID(),
          type: 'user',
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
        const toolId = e.callId || crypto.randomUUID()

        // 使用新的工具消息系统
        get().addToolMessage(toolId, e.tool, e.args)
      }),

      // tool_call_end
      eventBus.on('tool_call_end', (event) => {
        const e = event as any
        const success = e.success !== false

        // 更新工具消息状态
        get().updateToolMessage(
          e.callId,
          success ? 'completed' : 'failed',
          e.result,
          success ? undefined : (e.result as string || '执行失败')
        )
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

    cleanupCallbacks.push(() => {
      unsubscribers.forEach((unsub) => unsub())
    })

    // ========== 2. 监听 Tauri chat-event（桥接 IFlow/Claude Code 事件） ==========
    // 动态导入 Tauri API
    import('@tauri-apps/api/event').then(({ listen }) => {
      const unlistenPromise = listen<string>('chat-event', (tauriEvent) => {
        try {
          const streamEvent = JSON.parse(tauriEvent.payload)
          console.log('[EventChatStore] 收到 chat-event:', streamEvent.type)

          // 根据 StreamEvent 类型处理
          switch (streamEvent.type) {
            case 'session_start': {
              set({
                conversationId: streamEvent.sessionId || null,
                isStreaming: true,
                currentContent: '',
                error: null,
                activeToolGroup: null,
                currentAssistantMessageId: null,
                toolMessageMap: new Map(),
              })
              toolPanelStore.clearTools()
              break
            }

            case 'session_end': {
              const state = get()
              state.finishMessage()
              set({ isStreaming: false, progressMessage: null })
              break
            }

            case 'text_delta': {
              // 增量文本，追加到当前内容
              set((state) => ({
                currentContent: state.currentContent + (streamEvent.text || ''),
              }))
              break
            }

            case 'assistant': {
              // 完整的 assistant 消息（IFlow 格式）
              if (streamEvent.message?.content) {
                const content = extractTextFromContent(streamEvent.message.content)
                if (content) {
                  set({ currentContent: content })
                }

                // 处理工具调用（在 assistant 消息中的 tool_use 块）
                const toolUses = extractToolUsesFromContent(streamEvent.message.content)
                for (const toolUse of toolUses) {
                  get().addToolMessage(toolUse.id, toolUse.name, toolUse.input as Record<string, unknown>)
                }
              }
              break
            }

            case 'tool_start': {
              // 工具调用开始
              const toolId = streamEvent.toolUseId || crypto.randomUUID()
              get().addToolMessage(toolId, streamEvent.toolName || 'unknown', streamEvent.input as Record<string, unknown>)
              break
            }

            case 'tool_end': {
              // 工具调用结束
              const toolId = streamEvent.toolUseId
              if (toolId) {
                get().updateToolMessage(toolId, 'completed', streamEvent.output)
              }
              break
            }

            case 'error': {
              set({
                error: streamEvent.error || '未知错误',
                isStreaming: false,
              })
              break
            }

            case 'system':
              if (streamEvent.subtype === 'progress') {
                set({ progressMessage: streamEvent.extra?.message || null })
              }
              break

            default:
              console.log('[EventChatStore] 未处理的事件类型:', streamEvent.type)
          }
        } catch (e) {
          console.error('[EventChatStore] 解析 chat-event 失败:', e)
        }
      })

      // 将清理函数添加到列表
      unlistenPromise.then((unlisten) => {
        cleanupCallbacks.push(unlisten)
      })
    }).catch((err) => {
      console.error('[EventChatStore] 导入 Tauri API 失败:', err)
    })

    // 返回清理函数
    return () => {
      cleanupCallbacks.forEach((cleanup) => cleanup())
    }
  },

  sendMessage: async (content, workspaceDir) => {
    const { conversationId } = get()

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    get().addMessage(userMessage)

    set({
      currentContent: '',
      isStreaming: true,
      error: null,
      activeToolGroup: null,
      currentAssistantMessageId: null,
      toolMessageMap: new Map(),
    })

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
        archivedMessages: [...toArchive, ...archivedMessages] as ChatMessage[],
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
        activeToolGroup: null,
        toolMessageMap: new Map(),
      })

      sessionStorage.removeItem(STORAGE_KEY)
      return true
    } catch (e) {
      console.error('[EventChatStore] 恢复状态失败:', e)
      return false
    }
  },
}))
