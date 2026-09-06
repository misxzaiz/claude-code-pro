/**
 * 多设备消息同步验证测试
 *
 * 场景：A 设备发送用户消息，B 设备（Web/App 远程访问）能看到 AI 回复，
 * 但看不到 A 发送的用户消息。
 *
 * 根因：前端 eventHandler 曾主动忽略后端广播的 user_message 事件。
 * 修复：消费 user_message 事件，追加到 messages；用 content 去重防 A 设备重复渲染。
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/services/dialogStorage', () => ({ dialogStorageService: {} }))
vi.mock('@/services/voiceNotificationService', () => ({
  voiceNotificationService: { notifyError: () => {} },
}))
vi.mock('./sessionStoreManager', () => ({ sessionStoreManager: {} }))
vi.mock('@/stores/workspaceStore', () => ({ useWorkspaceStore: { getState: () => ({}) } }))
vi.mock('@/stores/cliInfoStore', () => ({
  useCliInfoStore: { getState: () => ({ updateFromInit: () => {} }) },
}))
vi.mock('@/plugin-system/chatCardRegistry', () => ({ chatCardRegistry: { get: () => undefined } }))

import { handleAIEvent } from './eventHandler'
import type { ConversationStore } from './types'
import type { AIEvent } from '@/ai-runtime'
import type { ChatMessage } from '@/types'

function makeStore() {
  let state = {
    sessionId: 's1',
    error: null,
    currentMessage: null,
    messages: [] as ChatMessage[],
    isStreaming: true,
  } as unknown as ConversationStore
  const store = state as unknown as ConversationStore & {
    finishMessage: () => void
    getPersistableMessages: () => unknown[]
    appendTextBlock: (content: string) => void
    addMessage: (message: ChatMessage) => void
  }
  store.finishMessage = () => {}
  store.getPersistableMessages = () => []
  store.appendTextBlock = (content: string) => {
    state.messages = [...state.messages, {
      id: 'mock-ai-' + Date.now(),
      type: 'assistant',
      blocks: [{ type: 'text', content }],
      timestamp: new Date().toISOString(),
    } as unknown as ChatMessage]
    Object.assign(store, state)
  }
  store.addMessage = (message: ChatMessage) => {
    state.messages = [...state.messages, message]
    Object.assign(store, state)
  }
  const set = (partial: Partial<ConversationStore>) => {
    state = { ...state, ...partial }
    Object.assign(store, state)
  }
  const get = () => state
  return { set, get, store }
}

describe('多设备消息同步验证（修复后）', () => {
  describe('user_message 事件消费', () => {
    it('B 设备：收到 user_message 事件 → 追加到 messages（修复后行为）', () => {
      const { set, get } = makeStore()
      const event: AIEvent = {
        type: 'user_message',
        sessionId: 's1',
        content: '来自 A 设备的问候',
      } as AIEvent

      handleAIEvent(event, set as never, get as never)

      const userMsgs = get().messages.filter((m) => m.type === 'user')
      expect(userMsgs.length).toBe(1)
      expect((userMsgs[0] as { content: string }).content).toBe('来自 A 设备的问候')
    })

    it('A 设备：本机已有相同 content 的 user 消息 → 不重复渲染', () => {
      const { set, get, store } = makeStore()
      // A 设备自己 sendMessage 时已 addMessage
      store.addMessage({
        id: 'local-1',
        type: 'user',
        content: 'A 发的消息',
        timestamp: new Date().toISOString(),
      } as unknown as ChatMessage)

      // 后端广播回来的 user_message 事件
      const event: AIEvent = {
        type: 'user_message',
        sessionId: 's1',
        content: 'A 发的消息',
      } as AIEvent

      handleAIEvent(event, set as never, get as never)

      const userMsgs = get().messages.filter((m) => m.type === 'user')
      expect(userMsgs.length).toBe(1) // 不重复
    })

    it('A 设备：不同 content 的 user_message → 追加（非重复）', () => {
      const { set, get, store } = makeStore()
      store.addMessage({
        id: 'local-1',
        type: 'user',
        content: '第一条消息',
        timestamp: new Date().toISOString(),
      } as unknown as ChatMessage)

      const event: AIEvent = {
        type: 'user_message',
        sessionId: 's1',
        content: '第二条消息',
      } as AIEvent

      handleAIEvent(event, set as never, get as never)

      const userMsgs = get().messages.filter((m) => m.type === 'user')
      expect(userMsgs.length).toBe(2)
    })

    it('空 content 的 user_message → 忽略', () => {
      const { set, get } = makeStore()
      const event: AIEvent = {
        type: 'user_message',
        sessionId: 's1',
        content: '',
      } as AIEvent

      handleAIEvent(event, set as never, get as never)
      expect(get().messages.length).toBe(0)
    })
  })

  describe('端到端场景：A 发消息 → B 收到完整对话', () => {
    it('B 设备收到 user_message + AI 事件流 → 可见完整对话', () => {
      const { set, get } = makeStore()

      const events: AIEvent[] = [
        { type: 'user_message', sessionId: 's1', content: 'A 发的消息' } as AIEvent,
        { type: 'session_start', sessionId: 's1' } as AIEvent,
        { type: 'assistant_message', sessionId: 's1', content: 'AI 回复', isDelta: false } as AIEvent,
        { type: 'session_end', sessionId: 's1', reason: 'completed' } as AIEvent,
      ]

      for (const event of events) {
        handleAIEvent(event, set as never, get as never)
      }

      // B 设备能看到 A 的用户消息
      const userMsgs = get().messages.filter((m) => m.type === 'user')
      expect(userMsgs.length).toBe(1)
      expect((userMsgs[0] as { content: string }).content).toBe('A 发的消息')

      // B 设备能看到 AI 回复
      const aiMsgs = get().messages.filter((m) => m.type === 'assistant')
      expect(aiMsgs.length).toBeGreaterThanOrEqual(1)
    })

    it('A 设备自己发送 → 不重复，AI 回复正常追加', () => {
      const { set, get, store } = makeStore()

      // A 设备 sendMessage 时已 addMessage
      store.addMessage({
        id: 'local-1',
        type: 'user',
        content: 'A 发的消息',
        timestamp: new Date().toISOString(),
      } as unknown as ChatMessage)

      const events: AIEvent[] = [
        // 后端广播回来的（A 本机收到，应去重）
        { type: 'user_message', sessionId: 's1', content: 'A 发的消息' } as AIEvent,
        { type: 'session_start', sessionId: 's1' } as AIEvent,
        { type: 'assistant_message', sessionId: 's1', content: 'AI 回复', isDelta: false } as AIEvent,
        { type: 'session_end', sessionId: 's1', reason: 'completed' } as AIEvent,
      ]

      for (const event of events) {
        handleAIEvent(event, set as never, get as never)
      }

      // A 设备只有 1 条 user 消息（去重生效）
      const userMsgs = get().messages.filter((m) => m.type === 'user')
      expect(userMsgs.length).toBe(1)

      // AI 回复正常
      const aiMsgs = get().messages.filter((m) => m.type === 'assistant')
      expect(aiMsgs.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('存储层验证：RemoteBackend 跨设备共享（不是根因）', () => {
    it('RemoteBackend 通过 invoke 调用后端命令（不隔离设备）', async () => {
      const { RemoteBackend } = await import('@/services/dialogStorage/dialogBackend')
      const backend = new RemoteBackend()
      expect(backend.kind).toBe('remote')
      // RemoteBackend 的所有操作都通过 invoke 调用后端
      // 意味着所有设备读写同一后端磁盘 → 存储本身已共享
    })
  })
})
