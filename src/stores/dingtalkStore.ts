/**
 * 钉钉消息状态管理
 */

import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { DingTalkMessage, DingTalkServiceStatus } from '../types/dingtalk';
import * as tauri from '../services/tauri';

interface DingTalkState {
  /** 消息列表 */
  messages: DingTalkMessage[];
  /** 服务是否运行中 */
  isServiceRunning: boolean;
  /** 服务状态 */
  serviceStatus: DingTalkServiceStatus | null;
  /** 正在发送的消息列表 */
  pendingMessages: Set<string>;
  /** 取消监听的函数 */
  unlistenFn: UnlistenFn | null;

  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;

  /** 初始化事件监听 */
  initialize: () => Promise<void>;
  /** 添加消息 */
  addMessage: (message: DingTalkMessage) => void;
  /** 发送消息 */
  sendMessage: (content: string, conversationId: string) => Promise<void>;
  /** 清空消息 */
  clearMessages: () => void;
  /** 删除消息 */
  deleteMessage: (messageId: string) => void;
  /** 更新消息状态 */
  updateMessageStatus: (messageId: string, status: 'sent' | 'failed', error?: string) => void;
  /** 启动服务 */
  startService: () => Promise<void>;
  /** 停止服务 */
  stopService: () => Promise<void>;
  /** 刷新服务状态 */
  refreshServiceStatus: () => Promise<void>;
}

export const useDingTalkStore = create<DingTalkState>((set, get) => ({
  messages: [],
  isServiceRunning: false,
  serviceStatus: null,
  pendingMessages: new Set(),
  unlistenFn: null,
  loading: false,
  error: null,

  initialize: async () => {
    try {
      // 如果已经初始化,先取消之前的监听
      const { unlistenFn } = get();
      if (unlistenFn) {
        unlistenFn();
      }

      // 监听钉钉消息事件
      const unlisten = await listen<DingTalkMessage>('dingtalk:message', (event) => {
        console.log('[DingTalkStore] 收到消息:', event.payload);
        get().addMessage(event.payload);
      });

      // 监听钉钉错误事件
      const unlistenError = await listen<string>('dingtalk:error', (event) => {
        console.error('[DingTalkStore] 收到错误:', event.payload);
        set({ error: event.payload });
      });

      // 监听服务状态变化
      const unlistenStatus = await listen<DingTalkServiceStatus>('dingtalk:status', (event) => {
        console.log('[DingTalkStore] 服务状态更新:', event.payload);
        set({
          serviceStatus: event.payload,
          isServiceRunning: event.payload.isRunning,
        });
      });

      // 合并所有取消监听函数
      set({
        unlistenFn: () => {
          unlisten();
          unlistenError();
          unlistenStatus();
        },
      });

      // 初始化时刷新服务状态
      await get().refreshServiceStatus();
    } catch (error) {
      console.error('[DingTalkStore] 初始化失败:', error);
      set({ error: error instanceof Error ? error.message : '初始化失败' });
    }
  },

  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  sendMessage: async (content, conversationId) => {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 先添加到消息列表 (显示为发送中)
    const message: DingTalkMessage = {
      id: messageId,
      conversationId,
      senderName: '我',
      content,
      timestamp: Date.now(),
      direction: 'outbound',
      status: 'pending',
    };

    get().addMessage(message);

    // 标记为发送中
    set((state) => ({
      pendingMessages: new Set([...state.pendingMessages, messageId]),
    }));

    try {
      await tauri.sendDingTalkMessage(content, conversationId);

      // 更新为发送成功
      get().updateMessageStatus(messageId, 'sent');
    } catch (error) {
      console.error('[DingTalkStore] 发送消息失败:', error);
      // 更新为发送失败
      get().updateMessageStatus(
        messageId,
        'failed',
        error instanceof Error ? error.message : '发送失败'
      );
    } finally {
      // 从发送中列表移除
      set((state) => {
        const newPending = new Set(state.pendingMessages);
        newPending.delete(messageId);
        return { pendingMessages: newPending };
      });
    }
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  deleteMessage: (messageId) => {
    set((state) => ({
      messages: state.messages.filter((msg) => msg.id !== messageId),
    }));
  },

  updateMessageStatus: (messageId, status, error) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, status, error } : msg
      ),
    }));
  },

  startService: async () => {
    set({ loading: true, error: null });
    try {
      await tauri.startDingTalkService();
      await get().refreshServiceStatus();
    } catch (error) {
      console.error('[DingTalkStore] 启动服务失败:', error);
      set({ error: error instanceof Error ? error.message : '启动服务失败' });
    } finally {
      set({ loading: false });
    }
  },

  stopService: async () => {
    set({ loading: true, error: null });
    try {
      await tauri.stopDingTalkService();
      await get().refreshServiceStatus();
    } catch (error) {
      console.error('[DingTalkStore] 停止服务失败:', error);
      set({ error: error instanceof Error ? error.message : '停止服务失败' });
    } finally {
      set({ loading: false });
    }
  },

  refreshServiceStatus: async () => {
    try {
      const status = await tauri.getDingTalkServiceStatus();
      set({
        serviceStatus: status,
        isServiceRunning: status.isRunning,
      });
    } catch (error) {
      console.error('[DingTalkStore] 获取服务状态失败:', error);
    }
  },
}));
