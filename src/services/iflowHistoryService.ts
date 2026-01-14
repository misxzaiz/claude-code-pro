/**
 * IFlow 历史服务
 *
 * 负责与后端交互，获取 IFlow 会话历史、文件上下文等信息
 */

import { invoke } from '@tauri-apps/api/core'
import type { Message, ToolCall } from '../types'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * IFlow 会话元数据
 */
export interface IFlowSessionMeta {
  sessionId: string
  title: string
  messageCount: number
  fileSize: number
  createdAt: string
  updatedAt: string
  inputTokens: number
  outputTokens: number
}

/**
 * IFlow 历史消息
 */
export interface IFlowHistoryMessage {
  uuid: string
  parentUuid?: string
  timestamp: string
  type: 'user' | 'assistant'
  content: string
  model?: string
  stopReason?: string
  inputTokens?: number
  outputTokens?: number
  toolCalls: IFlowToolCall[]
}

/**
 * IFlow 工具调用
 */
export interface IFlowToolCall {
  id: string
  name: string
  input: unknown
}

/**
 * IFlow 文件上下文
 */
export interface IFlowFileContext {
  path: string
  fileType: 'file' | 'directory' | 'image'
  accessCount: number
  firstAccessed: string
  lastAccessed: string
}

/**
 * IFlow Token 统计
 */
export interface IFlowTokenStats {
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  messageCount: number
  userMessageCount: number
  assistantMessageCount: number
}

// ============================================================================
// 服务类
// ============================================================================

/**
 * IFlow 历史服务类
 */
export class IFlowHistoryService {
  /**
   * 列出项目的所有 IFlow 会话
   */
  async listSessions(): Promise<IFlowSessionMeta[]> {
    try {
      const sessions = await invoke<IFlowSessionMeta[]>('list_iflow_sessions')
      return sessions
    } catch (e) {
      console.error('[IFlowHistoryService] 列出会话失败:', e)
      return []
    }
  }

  /**
   * 获取会话历史消息
   */
  async getSessionHistory(sessionId: string): Promise<IFlowHistoryMessage[]> {
    try {
      const messages = await invoke<IFlowHistoryMessage[]>('get_iflow_session_history', { sessionId })
      return messages
    } catch (e) {
      console.error('[IFlowHistoryService] 获取会话历史失败:', e)
      return []
    }
  }

  /**
   * 获取文件上下文
   */
  async getFileContexts(sessionId: string): Promise<IFlowFileContext[]> {
    try {
      const contexts = await invoke<IFlowFileContext[]>('get_iflow_file_contexts', { sessionId })
      return contexts
    } catch (e) {
      console.error('[IFlowHistoryService] 获取文件上下文失败:', e)
      return []
    }
  }

  /**
   * 获取 Token 统计
   */
  async getTokenStats(sessionId: string): Promise<IFlowTokenStats | null> {
    try {
      const stats = await invoke<IFlowTokenStats>('get_iflow_token_stats', { sessionId })
      return stats
    } catch (e) {
      console.error('[IFlowHistoryService] 获取 Token 统计失败:', e)
      return null
    }
  }

  /**
   * 将 IFlow 消息转换为通用 Message 格式
   */
  convertMessagesToFormat(messages: IFlowHistoryMessage[]): Message[] {
    return messages.map(msg => ({
      id: msg.uuid,
      role: msg.type,
      content: msg.content,
      timestamp: msg.timestamp,
      // 如果有工具调用，添加摘要
      toolSummary: msg.toolCalls.length > 0 ? {
        count: msg.toolCalls.length,
        names: Array.from(new Set(msg.toolCalls.map(t => t.name))),
      } : undefined,
    }))
  }

  /**
   * 从 IFlow 消息中提取工具调用
   */
  extractToolCalls(messages: IFlowHistoryMessage[]): ToolCall[] {
    const toolCalls: ToolCall[] = []

    for (const msg of messages) {
      for (const tc of msg.toolCalls) {
        toolCalls.push({
          id: tc.id,
          name: tc.name,
          status: 'completed' as const,
          input: tc.input as Record<string, unknown>,
          startedAt: msg.timestamp,
        })
      }
    }

    return toolCalls
  }

  /**
   * 生成会话标题（如果消息中没有标题）
   */
  generateSessionTitle(messages: IFlowHistoryMessage[]): string {
    const firstUserMessage = messages.find(m => m.type === 'user')
    if (firstUserMessage) {
      const content = firstUserMessage.content.trim()
      if (content.length > 50) {
        return content.slice(0, 50) + '...'
      }
      return content || 'IFlow 对话'
    }
    return 'IFlow 对话'
  }

  /**
   * 获取会话摘要
   */
  getSessionSummary(meta: IFlowSessionMeta, stats?: IFlowTokenStats | null): string {
    const parts: string[] = []

    parts.push(`${meta.messageCount} 条消息`)

    if (stats) {
      parts.push(`${stats.totalTokens.toLocaleString()} Tokens`)
    } else if (meta.inputTokens > 0 || meta.outputTokens > 0) {
      const total = meta.inputTokens + meta.outputTokens
      parts.push(`${total.toLocaleString()} Tokens`)
    }

    return parts.join(' · ')
  }

  /**
   * 格式化文件大小
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  /**
   * 格式化时间
   */
  formatTime(timestamp: string): string {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins} 分钟前`
    if (diffHours < 24) return `${diffHours} 小时前`
    if (diffDays < 7) return `${diffDays} 天前`

    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    })
  }
}

// ============================================================================
// 全局单例
// ============================================================================

let globalService: IFlowHistoryService | null = null

/**
 * 获取 IFlow 历史服务单例
 */
export function getIFlowHistoryService(): IFlowHistoryService {
  if (!globalService) {
    globalService = new IFlowHistoryService()
  }
  return globalService
}

/**
 * 重置服务（主要用于测试）
 */
export function resetIFlowHistoryService(): void {
  globalService = null
}
