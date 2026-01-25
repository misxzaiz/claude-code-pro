/**
 * 事件驱动的 Chat Store
 *
 * 完全基于 AIEvent 和 EventBus 的聊天状态管理。
 * 支持新的分层对话流消息类型（ToolMessage、ToolGroupMessage）。
 *
 * 架构说明：
 * 1. Tauri 'chat-event' → convertStreamEventToAIEvents() → EventBus.emit()
 * 2. EventBus → DeveloperPanel（调试面板）
 * 3. 本地处理逻辑 → UI 更新
 */

import { create } from 'zustand'
import type { ChatMessage, AssistantChatMessage, UserChatMessage, SystemChatMessage, ContentBlock, ToolCallBlock, ToolStatus } from '../types'
import type { StreamEvent } from '../types/chat'
import type { AIEvent } from '../ai-runtime'
import { useToolPanelStore } from './toolPanelStore'
import { useWorkspaceStore } from './workspaceStore'
import { useConfigStore } from './configStore'
import {
  generateToolSummary,
  calculateDuration,
} from '../utils/toolSummary'
import { parseWorkspaceReferences, buildSystemPrompt } from '../services/workspaceReference'
import { getEventBus } from '../ai-runtime'
import { TokenBuffer } from '../utils/tokenBuffer'
import { getIFlowHistoryService } from '../services/iflowHistoryService'
import { getClaudeCodeHistoryService } from '../services/claudeCodeHistoryService'

/** 最大保留消息数量 */
const MAX_MESSAGES = 500

/** 消息保留阈值 */
const MESSAGE_ARCHIVE_THRESHOLD = 550

/** 本地存储键 */
const STORAGE_KEY = 'event_chat_state_backup'
const STORAGE_VERSION = '5' // 版本升级：添加历史管理功能

/** 会话历史存储键 */
const SESSION_HISTORY_KEY = 'event_chat_session_history'
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
  engineId: 'claude-code' | 'iflow'
  data: {
    messages: ChatMessage[]
    archivedMessages: ChatMessage[]
  }
}

/**
 * 统一的历史条目（包含 localStorage、IFlow 和 Claude Code 原生的会话）
 */
export interface UnifiedHistoryItem {
  id: string
  title: string
  timestamp: string
  messageCount: number
  engineId: 'claude-code' | 'iflow'
  source: 'local' | 'iflow' | 'claude-code-native'
  fileSize?: number
  inputTokens?: number
  outputTokens?: number
}

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

// ============================================================================
// 统一事件转换层：StreamEvent → AIEvent
// ============================================================================

/**
 * 将 Tauri 的 StreamEvent 转换为标准的 AIEvent 数组
 *
 * 这是事件转换的统一入口，所有 StreamEvent 都通过这里转换为 AIEvent。
 * 转换后的事件会：
 * 1. 通过 EventBus 分发给所有订阅者（如 DeveloperPanel）
 * 2. 同时在本地进行状态更新
 */
function convertStreamEventToAIEvents(streamEvent: StreamEvent, sessionId: string | null): AIEvent[] {
  const events: AIEvent[] = []

  switch (streamEvent.type) {
    case 'system': {
      // Claude Code 的 system 事件可能包含 session_id
      const systemEvent = streamEvent as { type: 'system'; subtype?: string; session_id?: string; extra?: { message?: string } }
      if (systemEvent.session_id) {
        events.push({ type: 'session_start', sessionId: systemEvent.session_id })
      }

      // 处理进度消息
      if (systemEvent.subtype === 'progress' || systemEvent.extra?.message) {
        events.push({
          type: 'progress',
          message: systemEvent.extra?.message || systemEvent.subtype,
        })
      }
      break
    }

    case 'session_start': {
      if (streamEvent.sessionId) {
        events.push({ type: 'session_start', sessionId: streamEvent.sessionId })
      }
      break
    }

    case 'session_end':
    case 'result': {
      events.push({
        type: 'session_end',
        sessionId: sessionId || 'unknown',
        reason: 'completed',
      })
      break
    }

    case 'text_delta': {
      events.push({ type: 'token', value: streamEvent.text || '' })
      break
    }

    case 'assistant': {
      if (streamEvent.message?.content) {
        // 提取文本内容
        const content = extractTextFromContent(streamEvent.message.content)
        if (content) {
          events.push({
            type: 'assistant_message',
            content,
            isDelta: false,
          })
        }

        // 提取工具调用
        const toolUses = extractToolUsesFromContent(streamEvent.message.content)
        for (const toolUse of toolUses) {
          // 工具调用开始事件
          events.push({
            type: 'tool_call_start',
            callId: toolUse.id,
            tool: toolUse.name,
            args: toolUse.input as Record<string, unknown>,
          })
        }
      }
      break
    }

    case 'user': {
      if (streamEvent.message?.content) {
        // 处理工具结果
        const toolResults = extractToolResultsFromContent(streamEvent.message.content)
        for (const result of toolResults) {
          events.push({
            type: 'tool_call_end',
            callId: result.tool_use_id,
            tool: result.tool_use_id, // 使用 tool_use_id 作为工具名
            result: result.content,
            success: !result.is_error,
          })
        }
      }
      break
    }

    case 'tool_start': {
      events.push({
        type: 'tool_call_start',
        callId: streamEvent.toolUseId,
        tool: streamEvent.toolName || 'unknown',
        args: streamEvent.input as Record<string, unknown>,
      })
      events.push({
        type: 'progress',
        message: `调用工具: ${streamEvent.toolName}`,
      })
      break
    }

    case 'tool_end': {
      events.push({
        type: 'tool_call_end',
        callId: streamEvent.toolUseId,
        tool: streamEvent.toolName || 'unknown',
        result: streamEvent.output,
        success: streamEvent.output !== undefined,
      })
      events.push({
        type: 'progress',
        message: `工具完成: ${streamEvent.toolName}`,
      })
      break
    }

    case 'error': {
      events.push({
        type: 'error',
        error: streamEvent.error || '未知错误',
      })
      break
    }

    case 'permission_request': {
      events.push({
        type: 'progress',
        message: '等待权限确认...',
      })
      break
    }

    default: {
      const unknownEvent = streamEvent as { type: string }
      console.log('[EventChatStore] 未转换的事件类型:', unknownEvent.type)
      break
    }
  }

  return events
}

// ============================================================================
// 统一状态更新层：AIEvent → 本地状态
// ============================================================================

/**
 * 处理 AIEvent 更新本地状态
 *
 * 这是统一的状态更新入口，所有 AIEvent 都通过这里更新本地状态。
 * 与 convertStreamEventToAIEvents() 配合使用，实现事件流统一处理。
 *
 * 设计说明：
 * - 只处理与本地状态相关的 AIEvent
 * - 不再直接处理 StreamEvent，避免重复逻辑
 * - 与 EventBus 分离，Store 只负责状态管理
 *
 * @param event 要处理的 AIEvent
 * @param storeSet Zustand 的 set 函数
 * @param storeGet Zustand 的 get 函数
 */
function handleAIEvent(
  event: AIEvent,
  storeSet: (partial: Partial<EventChatState> | ((state: EventChatState) => Partial<EventChatState>)) => void,
  storeGet: () => EventChatState
): void {
  const state = storeGet()

  switch (event.type) {
    case 'session_start':
      storeSet({ conversationId: event.sessionId, isStreaming: true })
      console.log('[EventChatStore] Session started:', event.sessionId)
      useToolPanelStore.getState().clearTools()
      break

    case 'session_end':
      state.finishMessage()
      storeSet({ isStreaming: false, progressMessage: null })
      console.log('[EventChatStore] Session ended:', event.reason)
      break

    case 'token':
      state.appendTextBlock(event.value)
      break

    case 'assistant_message':
      state.appendTextBlock(event.content)
      // 注意：工具调用会通过独立的 tool_call_start 事件处理，不在这里处理
      break

    case 'tool_call_start':
      state.appendToolCallBlock(
        event.callId || crypto.randomUUID(),
        event.tool,
        event.args
      )
      break

    case 'tool_call_end':
      if (!event.callId) {
        console.warn('[EventChatStore] tool_call_end 事件缺少 callId，工具状态无法更新:', event.tool)
        break
      }
      state.updateToolCallBlock(
        event.callId,
        event.success ? 'completed' : 'failed',
        String(event.result || '')
      )
      break

    case 'progress':
      storeSet({ progressMessage: event.message || null })
      break

    case 'error':
      storeSet({ error: event.error, isStreaming: false })
      break

    case 'user_message':
      // 用户消息由 sendMessage 直接添加，这里不需要处理
      break

    default:
      console.log('[EventChatStore] 未处理的 AIEvent 类型:', (event as { type: string }).type)
  }
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
  /** 是否正在加载历史 */
  isLoadingHistory: boolean
  /** 当前进度消息 */
  progressMessage: string | null

  /** 当前正在构建的 Assistant 消息 */
  currentMessage: CurrentAssistantMessage | null
  /** 工具调用块映射 (toolUseId -> blockIndex) */
  toolBlockMap: Map<string, number>

  /** Token Buffer - 用于批量处理流式 token */
  tokenBuffer: TokenBuffer | null

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
  isLoadingHistory: false,
  progressMessage: null,
  currentMessage: null,
  toolBlockMap: new Map(),
  tokenBuffer: null,

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
    // 清理 TokenBuffer
    const { tokenBuffer } = get()
    if (tokenBuffer) {
      tokenBuffer.destroy()
    }

    set({
      messages: [],
      archivedMessages: [],
      isArchiveExpanded: false,
      conversationId: null,
      progressMessage: null,
      currentMessage: null,
      toolBlockMap: new Map(),
      tokenBuffer: null,
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
    const { currentMessage, messages, tokenBuffer } = get()

    // 先刷新 TokenBuffer，确保所有内容都已处理
    if (tokenBuffer) {
      tokenBuffer.end()
    }

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
          tokenBuffer: null,
        }))
      } else {
        // 如果消息不在列表中（理论上不应该发生），添加它
        set((state) => ({
          messages: [...state.messages, completedMessage],
          currentMessage: null,
          progressMessage: null,
          tokenBuffer: null,
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
   * 添加文本块到当前消息（使用 TokenBuffer 批量优化）
   *
   * 性能优化：使用 TokenBuffer 将多个 token 批量处理，
   * 减少 90% 的状态更新和重渲染次数。
   */
  appendTextBlock: (content) => {
    const { currentMessage, tokenBuffer } = get()
    const now = new Date().toISOString()

    // 如果没有当前消息，创建一个新的（首次调用）
    if (!currentMessage) {
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

      // 创建 TokenBuffer 用于后续的批量处理
      const newBuffer = new TokenBuffer((batchedContent) => {
        // TokenBuffer 刷新时的回调 - 批量更新内容
        const state = get()
        const msg = state.currentMessage
        if (!msg) return

        const lastBlock = msg.blocks[msg.blocks.length - 1]
        if (lastBlock && lastBlock.type === 'text') {
          // 追加到现有文本块
          const updatedBlocks: ContentBlock[] = [...msg.blocks]
          updatedBlocks[updatedBlocks.length - 1] = {
            type: 'text',
            content: (lastBlock as any).content + batchedContent,
          }
          set((state) => ({
            currentMessage: state.currentMessage
              ? { ...state.currentMessage, blocks: updatedBlocks }
              : null,
          }))
          // 更新消息列表中的消息
          get().updateCurrentAssistantMessage(updatedBlocks)
        } else {
          // 最后一块不是文本块（如 tool_call），创建新的文本块
          // 这处理了工具调用后继续有文本的场景
          const textBlock: ContentBlock = { type: 'text', content: batchedContent }
          const updatedBlocks: ContentBlock[] = [...msg.blocks, textBlock]
          set((state) => ({
            currentMessage: state.currentMessage
              ? { ...state.currentMessage, blocks: updatedBlocks }
              : null,
          }))
          get().updateCurrentAssistantMessage(updatedBlocks)
        }
      }, { maxDelay: 50, maxSize: 500 })

      set({ tokenBuffer: newBuffer })
    } else if (tokenBuffer) {
      // 有 TokenBuffer，使用批量处理
      tokenBuffer.append(content)
    } else {
      // 降级：直接更新（用于非流式场景）
      const lastBlock = currentMessage.blocks[currentMessage.blocks.length - 1]
      if (lastBlock && lastBlock.type === 'text') {
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
        get().updateCurrentAssistantMessage(updatedBlocks)
      } else {
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

    // 优化：直接修改 toolBlockMap 而非创建新 Map
    // Zustand 支持 Map 的直接修改（只要返回的是同一个 Map 引用）
    const existingMap = get().toolBlockMap
    existingMap.set(toolId, blockIndex)

    set((state) => ({
      currentMessage: state.currentMessage
        ? { ...state.currentMessage, blocks: updatedBlocks }
        : null,
      // 保持相同的 Map 引用，避免不必要的重渲染
      toolBlockMap: existingMap,
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
   *
   * 架构说明（优化后）：
   * 1. 监听 Tauri 'chat-event'（StreamEvent 原始格式）
   * 2. convertStreamEventToAIEvents() 转换为 AIEvent
   * 3. eventBus.emit() 发送到 EventBus（DeveloperPanel 订阅）
   * 4. handleAIEvent() 更新本地状态
   *
   * 优化效果：
   * - 消除了重复的 switch (streamEvent.type) 逻辑
   * - 统一使用 AIEvent 进行状态更新
   * - 代码减少约 100 行
   */
  initializeEventListeners: () => {
    const cleanupCallbacks: Array<() => void> = []

    // 获取 EventBus 单例
    const eventBus = getEventBus({ debug: false })

    // ========== 监听 Tauri chat-event（桥接 IFlow/Claude Code 事件） ==========
    // 动态导入 Tauri API
    import('@tauri-apps/api/event').then(({ listen }) => {
      const unlistenPromise = listen<string>('chat-event', (tauriEvent) => {
        try {
          const streamEvent = JSON.parse(tauriEvent.payload) as StreamEvent
          const state = get()

          // 🔧 过滤不属于当前会话的事件（避免 AI Command 等独立会话的事件干扰主对话）
          const sessionId = (streamEvent as { session_id?: string }).session_id ||
                           (streamEvent as { sessionId?: string }).sessionId
          if (sessionId && sessionId !== state.conversationId) {
            console.log('[EventChatStore] 跳过不属于当前会话的事件:', sessionId, '当前会话:', state.conversationId)
            return
          }

          console.log('[EventChatStore] 收到 chat-event:', streamEvent.type)

          // ========== 步骤 1：转换为 AIEvent ==========
          const aiEvents = convertStreamEventToAIEvents(streamEvent, state.conversationId)

          // ========== 步骤 2：处理每个 AIEvent ==========
          for (const aiEvent of aiEvents) {
            // 2.1 发送到 EventBus（DeveloperPanel 可以订阅）
            eventBus.emit(aiEvent)

            // 2.2 更新本地状态
            handleAIEvent(aiEvent, set, get)
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

    // 获取工作区信息（包括关联工作区）
    const workspaceStore = useWorkspaceStore.getState()
    const currentWorkspace = workspaceStore.getCurrentWorkspace()

    // 如果没有工作区，不允许发送消息
    if (!currentWorkspace) {
      set({ error: '请先创建或选择一个工作区' })
      return
    }

    // 获取当前工作区路径作为默认值
    const actualWorkspaceDir = workspaceDir ?? currentWorkspace.path

    // 解析工作区引用（只处理文件引用，不再生成 contextHeader）
    const { processedMessage } = parseWorkspaceReferences(
      content,
      workspaceStore.workspaces,
      workspaceStore.getContextWorkspaces(),
      workspaceStore.currentWorkspaceId
    )

    // 构建系统提示词（用于 --system-prompt 参数）
    const systemPrompt = buildSystemPrompt(
      workspaceStore.workspaces,
      workspaceStore.getContextWorkspaces(),
      workspaceStore.currentWorkspaceId
    )

    // 规范化消息内容：将换行符替换为 \\n 字符串
    const normalizedMessage = processedMessage
      .replace(/\r\n/g, '\\n')
      .replace(/\r/g, '\\n')
      .replace(/\n/g, '\\n')
      .trim()

    // 规范化系统提示词中的换行
    const normalizedSystemPrompt = systemPrompt
      .replace(/\r\n/g, '\\n')
      .replace(/\r/g, '\\n')
      .replace(/\n/g, '\\n')
      .trim()

    // 添加用户消息（使用原始内容显示）
    const userMessage: UserChatMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content, // 保持原始内容显示
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
          message: normalizedMessage,
          systemPrompt: normalizedSystemPrompt,
          workDir: actualWorkspaceDir,
        })
      } else {
        const newSessionId = await invoke<string>('start_chat', {
          message: normalizedMessage,
          systemPrompt: normalizedSystemPrompt,
          workDir: actualWorkspaceDir,
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

    // 获取当前工作区路径作为默认值
    const actualWorkspaceDir = useWorkspaceStore.getState().getCurrentWorkspace()?.path

    // 规范化消息内容：将换行符替换为 \\n 字符串
    // 避免 iFlow CLI 参数解析器无法正确处理包含实际换行符的参数值
    const normalizedPrompt = prompt
      .replace(/\r\n/g, '\\n')
      .replace(/\r/g, '\\n')
      .replace(/\n/g, '\\n')
      .trim()

    set({ isStreaming: true, error: null })

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('continue_chat', {
        sessionId: conversationId,
        message: normalizedPrompt,
        workDir: actualWorkspaceDir,
      })
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '继续对话失败',
        isStreaming: false,
      })
    }
  },

  interruptChat: async () => {
    const { conversationId, tokenBuffer } = get()
    if (!conversationId) return

    // 先刷新 TokenBuffer，确保已接收的内容显示出来，再重置
    if (tokenBuffer) {
      tokenBuffer.end()
    }

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

  /**
   * 保存会话到历史
   */
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

      // 生成标题（从第一条用户消息提取）
      const firstUserMessage = state.messages.find(m => m.type === 'user')
      let sessionTitle = title || '新对话'
      if (!title && firstUserMessage && 'content' in firstUserMessage) {
        sessionTitle = (firstUserMessage.content as string).slice(0, 50) + '...'
      }

      // 创建历史记录
      const historyEntry: HistoryEntry = {
        id: state.conversationId,
        title: sessionTitle,
        timestamp: new Date().toISOString(),
        messageCount: state.messages.length,
        engineId,
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
      console.log('[EventChatStore] 会话已保存到历史:', sessionTitle, '引擎:', engineId)
    } catch (e) {
      console.error('[EventChatStore] 保存历史失败:', e)
    }
  },

  /**
   * 获取统一会话历史（包含 localStorage、IFlow 和 Claude Code 原生）
   */
  getUnifiedHistory: async () => {
    const items: UnifiedHistoryItem[] = []
    const iflowService = getIFlowHistoryService()
    const claudeCodeService = getClaudeCodeHistoryService()
    const workspaceStore = useWorkspaceStore.getState()
    const currentWorkspace = workspaceStore.getCurrentWorkspace()

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

      // 2. 获取 Claude Code 原生会话列表
      try {
        const claudeCodeSessions = await claudeCodeService.listSessions(
          currentWorkspace?.path
        )
        for (const session of claudeCodeSessions) {
          // 排除已经存在的会话
          if (!items.find(item => item.id === session.sessionId)) {
            items.push({
              id: session.sessionId,
              title: session.firstPrompt,
              timestamp: session.modified,
              messageCount: session.messageCount,
              engineId: 'claude-code',
              source: 'claude-code-native',
              fileSize: session.fileSize,
            })
          }
        }
      } catch (e) {
        console.warn('[EventChatStore] 获取 Claude Code 原生会话失败:', e)
      }

      // 3. 获取 IFlow 会话列表（如果当前工作区存在）
      try {
        const iflowSessions = await iflowService.listSessions()
        for (const session of iflowSessions) {
          // 排除已经存在的会话（避免重复）
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
        console.warn('[EventChatStore] 获取 IFlow 会话失败:', e)
      }

      // 4. 按时间戳排序
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      return items
    } catch (e) {
      console.error('[EventChatStore] 获取统一历史失败:', e)
      return []
    }
  },

  /**
   * 从历史恢复会话
   */
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
          isStreaming: false,
          error: null,
        })

        get().saveToStorage()
        console.log('[EventChatStore] 已从本地历史恢复会话:', localSession.title)
        return true
      }

      // 2. 尝试从 Claude Code 原生历史恢复
      if (!engineId || engineId === 'claude-code') {
        const claudeCodeService = getClaudeCodeHistoryService()
        const workspaceStore = useWorkspaceStore.getState()
        const currentWorkspace = workspaceStore.getCurrentWorkspace()

        const messages = await claudeCodeService.getSessionHistory(
          sessionId,
          currentWorkspace?.path
        )

        if (messages.length > 0) {
          // 使用新的 convertToChatMessages 方法，直接获取包含 blocks 的 ChatMessage
          const chatMessages = claudeCodeService.convertToChatMessages(messages)
          const toolCalls = claudeCodeService.extractToolCalls(messages)

          // 设置工具面板
          useToolPanelStore.getState().clearTools()
          for (const tool of toolCalls) {
            useToolPanelStore.getState().addTool(tool)
          }

          set({
            messages: chatMessages,
            archivedMessages: [],
            conversationId: sessionId,
            isStreaming: false,
            error: null,
          })

          console.log('[EventChatStore] 已从 Claude Code 原生历史恢复会话:', sessionId)
          return true
        }
      }

      // 3. 如果指定了 IFlow 或未指定，尝试从 IFlow 恢复
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

          // 将 Message 格式转换为 ChatMessage 格式
          const chatMessages: ChatMessage[] = convertedMessages.map((msg): ChatMessage => {
            if (msg.role === 'user') {
              return {
                id: msg.id,
                type: 'user',
                content: msg.content,
                timestamp: msg.timestamp,
              } as UserChatMessage
            } else if (msg.role === 'assistant') {
              return {
                id: msg.id,
                type: 'assistant',
                blocks: [
                  { type: 'text', content: msg.content }
                ],
                timestamp: msg.timestamp,
                content: msg.content,
                toolSummary: msg.toolSummary,
              } as AssistantChatMessage
            } else {
              return {
                id: msg.id,
                type: 'system',
                content: msg.content,
                timestamp: msg.timestamp,
              } as SystemChatMessage
            }
          })

          set({
            messages: chatMessages,
            archivedMessages: [],
            conversationId: sessionId,
            isStreaming: false,
            error: null,
          })

          console.log('[EventChatStore] 已从 IFlow 恢复会话:', sessionId)
          return true
        }
      }

      return false
    } catch (e) {
      console.error('[EventChatStore] 从历史恢复失败:', e)
      return false
    } finally {
      set({ isLoadingHistory: false })
    }
  },

  /**
   * 删除历史会话
   */
  deleteHistorySession: (sessionId: string, source?: 'local' | 'iflow') => {
    try {
      if (source === 'iflow' || (!source && sessionId.startsWith('session-'))) {
        // IFlow 会话不能删除，只能忽略
        console.log('[EventChatStore] IFlow 会话无法删除，仅作忽略:', sessionId)
        return
      }

      // 删除本地历史
      const historyJson = localStorage.getItem(SESSION_HISTORY_KEY)
      const history = historyJson ? JSON.parse(historyJson) : []

      const filteredHistory = history.filter((h: HistoryEntry) => h.id !== sessionId)
      localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(filteredHistory))
    } catch (e) {
      console.error('[EventChatStore] 删除历史会话失败:', e)
    }
  },

  /**
   * 清空历史
   */
  clearHistory: () => {
    try {
      localStorage.removeItem(SESSION_HISTORY_KEY)
      console.log('[EventChatStore] 历史已清空')
    } catch (e) {
      console.error('[EventChatStore] 清空历史失败:', e)
    }
  },
}))
