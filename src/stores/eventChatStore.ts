/**
 * 事件驱动的 Chat Store
 *
 * 完全基于 AIEvent 和 EventBus 的聊天状态管理。
 * 支持新的分层对话流消息类型（ToolMessage、ToolGroupMessage）。
 */

import { create } from 'zustand'
import type { ChatMessage, AssistantChatMessage, UserChatMessage, ContentBlock, ToolCallBlock, ToolStatus } from '../types'
import { getEventBus } from '../ai-runtime'
import { useToolPanelStore } from './toolPanelStore'
import {
  generateToolSummary,
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
 * 从 user 消息中提取工具结果
 *
 * Claude Code 格式：user 消息中包含 tool_result 块
 */
interface ToolResult {
  tool_use_id: string
  content: string
  is_error?: boolean
}

function extractToolResultsFromContent(content: unknown): ToolResult[] {
  const results: ToolResult[] = []

  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === 'object') {
        if ('type' in item && item.type === 'tool_result' && 'tool_use_id' in item) {
          results.push({
            tool_use_id: String(item.tool_use_id),
            content: String(item.content || ''),
            is_error: item.is_error === true,
          })
        }
      }
    }
  }

  return results
}

/**
 * 当前正在构建的 Assistant 消息
 */
interface CurrentAssistantMessage {
  id: string
  blocks: ContentBlock[]
  isStreaming: true
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
  /** 错误 */
  error: string | null
  /** 最大消息数配置 */
  maxMessages: number
  /** 是否已初始化 */
  isInitialized: boolean
  /** 当前进度消息 */
  progressMessage: string | null

  /** 当前正在构建的 Assistant 消息 */
  currentMessage: CurrentAssistantMessage | null
  /** 工具调用块映射 (toolUseId -> blockIndex) */
  toolBlockMap: Map<string, number>

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

  /** 添加文本块 */
  appendTextBlock: (content: string) => void
  /** 添加工具调用块 */
  appendToolCallBlock: (toolId: string, toolName: string, input: Record<string, unknown>) => void
  /** 更新工具调用块状态 */
  updateToolCallBlock: (toolId: string, status: ToolStatus, output?: string, error?: string) => void
  /** 更新当前 Assistant 消息（内部方法） */
  updateCurrentAssistantMessage: (blocks: ContentBlock[]) => void

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
  error: null,
  maxMessages: MAX_MESSAGES,
  isInitialized: false,
  progressMessage: null,
  currentMessage: null,
  toolBlockMap: new Map(),

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
      conversationId: null,
      progressMessage: null,
      currentMessage: null,
      toolBlockMap: new Map(),
    })
    useToolPanelStore.getState().clearTools()
  },

  setConversationId: (id) => {
    set({ conversationId: id })
  },

  setStreaming: (streaming) => {
    set({ isStreaming: streaming })
  },

  /**
   * 完成当前消息
   * 将 currentMessage 标记为完成，并清空
   */
  finishMessage: () => {
    const { currentMessage, messages } = get()

    if (currentMessage) {
      // 标记消息为完成状态
      const completedMessage: AssistantChatMessage = {
        id: currentMessage.id,
        type: 'assistant',
        blocks: currentMessage.blocks,
        timestamp: new Date().toISOString(),
        isStreaming: false,
      }

      // 更新消息列表中的当前消息（如果已存在）
      const messageIndex = messages.findIndex(m => m.id === currentMessage.id)
      if (messageIndex >= 0) {
        set((state) => ({
          messages: state.messages.map((m, i) =>
            i === messageIndex ? completedMessage : m
          ),
          currentMessage: null,
          progressMessage: null,
        }))
      } else {
        // 如果消息不在列表中（理论上不应该发生），添加它
        set((state) => ({
          messages: [...state.messages, completedMessage],
          currentMessage: null,
          progressMessage: null,
        }))
      }
    }

    set({ isStreaming: false })
    get().saveToStorage()
  },

  setError: (error) => {
    set({ error })
  },

  setProgressMessage: (message) => {
    set({ progressMessage: message })
  },

  /**
   * 添加文本块到当前消息
   */
  appendTextBlock: (content) => {
    const { currentMessage } = get()
    const now = new Date().toISOString()

    if (!currentMessage) {
      // 如果没有当前消息，创建一个新的
      const textBlock: ContentBlock = { type: 'text', content }
      const newMessage: CurrentAssistantMessage = {
        id: crypto.randomUUID(),
        blocks: [textBlock],
        isStreaming: true,
      }
      set({
        currentMessage: newMessage,
        isStreaming: true,
      })
      // 立即添加到消息列表，让用户能看到
      get().addMessage({
        id: newMessage.id,
        type: 'assistant',
        blocks: newMessage.blocks,
        timestamp: now,
        isStreaming: true,
      })
    } else {
      // 追加到当前消息的最后一个文本块（如果是文本块）或创建新块
      const lastBlock = currentMessage.blocks[currentMessage.blocks.length - 1]
      if (lastBlock && lastBlock.type === 'text') {
        // 追加到现有文本块
        const updatedBlocks: ContentBlock[] = [...currentMessage.blocks]
        updatedBlocks[updatedBlocks.length - 1] = {
          type: 'text',
          content: (lastBlock as any).content + content,
        }
        set((state) => ({
          currentMessage: state.currentMessage
            ? { ...state.currentMessage, blocks: updatedBlocks }
            : null,
        }))
        // 更新消息列表中的消息
        get().updateCurrentAssistantMessage(updatedBlocks)
      } else {
        // 创建新的文本块
        const textBlock: ContentBlock = { type: 'text', content }
        const updatedBlocks: ContentBlock[] = [...currentMessage.blocks, textBlock]
        set((state) => ({
          currentMessage: state.currentMessage
            ? { ...state.currentMessage, blocks: updatedBlocks }
            : null,
        }))
        get().updateCurrentAssistantMessage(updatedBlocks)
      }
    }
  },

  /**
   * 添加工具调用块到当前消息
   */
  appendToolCallBlock: (toolId, toolName, input) => {
    const { currentMessage } = get()
    const toolPanelStore = useToolPanelStore.getState()
    const now = new Date().toISOString()

    if (!currentMessage) {
      console.warn('[EventChatStore] No current message when adding tool call block')
      return
    }

    const toolBlock: ToolCallBlock = {
      type: 'tool_call',
      id: toolId,
      name: toolName,
      input,
      status: 'pending',
      startedAt: now,
    }

    // 添加工具块
    const updatedBlocks: ContentBlock[] = [...currentMessage.blocks, toolBlock]
    const blockIndex = updatedBlocks.length - 1

    set((state) => ({
      currentMessage: state.currentMessage
        ? { ...state.currentMessage, blocks: updatedBlocks }
        : null,
      toolBlockMap: new Map(state.toolBlockMap).set(toolId, blockIndex),
    }))

    // 更新消息列表中的消息
    get().updateCurrentAssistantMessage(updatedBlocks)

    // 同步到工具面板
    toolPanelStore.addTool({
      id: toolId,
      name: toolName,
      status: 'pending',
      input,
      startedAt: now,
    })

    // 更新进度消息
    const summary = generateToolSummary(toolName, input, 'pending')
    set({ progressMessage: summary })
  },

  /**
   * 更新工具调用块状态
   */
  updateToolCallBlock: (toolId, status, output, error) => {
    const { currentMessage, toolBlockMap } = get()
    const toolPanelStore = useToolPanelStore.getState()
    const blockIndex = toolBlockMap.get(toolId)

    if (!currentMessage || blockIndex === undefined) {
      console.warn('[EventChatStore] Tool block not found:', toolId)
      return
    }

    const block = currentMessage.blocks[blockIndex]
    if (!block || block.type !== 'tool_call') {
      console.warn('[EventChatStore] Invalid tool block at index:', blockIndex)
      return
    }

    const now = new Date().toISOString()
    const duration = calculateDuration(block.startedAt, now)

    // 更新工具块
    const updatedBlock: ToolCallBlock = {
      ...block,
      status,
      output,
      error,
      completedAt: now,
      duration,
    }

    const updatedBlocks = [...currentMessage.blocks]
    updatedBlocks[blockIndex] = updatedBlock

    set((state) => ({
      currentMessage: state.currentMessage
        ? { ...state.currentMessage, blocks: updatedBlocks }
        : null,
    }))

    // 更新消息列表中的消息
    get().updateCurrentAssistantMessage(updatedBlocks)

    // 同步到工具面板
    toolPanelStore.updateTool(toolId, {
      status,
      output: output ? String(output) : undefined,
      completedAt: now,
    })

    // 更新进度消息
    const summary = generateToolSummary(block.name, block.input, status)
    set({ progressMessage: summary })
  },

  /**
   * 更新当前 Assistant 消息（内部方法）
   */
  updateCurrentAssistantMessage: (blocks: ContentBlock[]) => {
    const { currentMessage } = get()
    if (!currentMessage) return

    set((state) => ({
      messages: state.messages.map(msg =>
        msg.id === currentMessage!.id
          ? { ...msg, blocks } as AssistantChatMessage
          : msg
      ),
    }))
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
          error: null,
          currentMessage: null,
          toolBlockMap: new Map(),
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
        const userMessage: UserChatMessage = {
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
        if (!e.isDelta && e.content) {
          get().appendTextBlock(e.content)
        }
      }),

      // token (增量文本)
      eventBus.on('token', (event) => {
        const e = event as any
        get().appendTextBlock(e.value)
      }),

      // tool_call_start
      eventBus.on('tool_call_start', (event) => {
        const e = event as any
        const toolId = e.callId || crypto.randomUUID()
        get().appendToolCallBlock(toolId, e.tool, e.args)
      }),

      // tool_call_end
      eventBus.on('tool_call_end', (event) => {
        const e = event as any
        const success = e.success !== false
        get().updateToolCallBlock(
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
                error: null,
                currentMessage: null,
                toolBlockMap: new Map(),
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
              get().appendTextBlock(streamEvent.text || '')
              break
            }

            case 'assistant': {
              // Claude Code/IFlow 的 assistant 消息
              // 注意：这个事件可能会发送多次，每次包含不同的内容块
              if (streamEvent.message?.content) {
                // 提取文本内容并追加
                const content = extractTextFromContent(streamEvent.message.content)
                if (content) {
                  get().appendTextBlock(content)
                }

                // 处理工具调用（在 assistant 消息中的 tool_use 块）
                const toolUses = extractToolUsesFromContent(streamEvent.message.content)
                for (const toolUse of toolUses) {
                  get().appendToolCallBlock(toolUse.id, toolUse.name, toolUse.input as Record<string, unknown>)
                }
              }
              break
            }

            case 'user': {
              // Claude Code 的 user 类型事件（包含工具结果）
              if (streamEvent.message?.content) {
                // 处理工具结果
                const toolResults = extractToolResultsFromContent(streamEvent.message.content)
                for (const result of toolResults) {
                  get().updateToolCallBlock(
                    result.tool_use_id,
                    result.is_error ? 'failed' : 'completed',
                    result.content
                  )
                }
              }
              break
            }

            case 'result': {
              // Claude Code 的最终结果事件
              if (streamEvent.result) {
                // 使用 result 字段作为最终回复内容
                get().appendTextBlock(streamEvent.result)
              }
              break
            }

            case 'tool_start': {
              // 工具调用开始
              const toolId = streamEvent.toolUseId || crypto.randomUUID()
              get().appendToolCallBlock(toolId, streamEvent.toolName || 'unknown', streamEvent.input as Record<string, unknown>)
              break
            }

            case 'tool_end': {
              // 工具调用结束
              const toolId = streamEvent.toolUseId
              if (toolId) {
                get().updateToolCallBlock(toolId, 'completed', streamEvent.output)
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
    const userMessage: UserChatMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    get().addMessage(userMessage)

    set({
      isStreaming: true,
      error: null,
      currentMessage: null,
      toolBlockMap: new Map(),
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
        isStreaming: false,
        isInitialized: true,
        currentMessage: null,
        toolBlockMap: new Map(),
      })

      sessionStorage.removeItem(STORAGE_KEY)
      return true
    } catch (e) {
      console.error('[EventChatStore] 恢复状态失败:', e)
      return false
    }
  },
}))
