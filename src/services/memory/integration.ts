/**
 * 上下文记忆服务集成示例
 *
 * 展示如何在 eventChatStore 中集成 SQLite 持久化存储
 */

import { DatabaseManager } from '@/services/memory'
import { SessionRepository, MessageRepository } from '@/services/memory'

/**
 * 初始化数据库（在应用启动时调用）
 */
export async function initializeMemoryService() {
  try {
    const dbManager = DatabaseManager.getInstance()
    await dbManager.init()

    console.log('[MemoryService] ✅ 数据库初始化成功')

    // 打印统计信息
    const stats = await dbManager.getStats()
    console.log('[MemoryService] 数据库统计:', stats)

    return true
  } catch (error) {
    console.error('[MemoryService] ❌ 数据库初始化失败:', error)
    return false
  }
}

/**
 * 保存会话到数据库
 */
export async function saveSessionToDatabase(
  sessionId: string,
  messages: any[],
  workspacePath: string,
  engineId: string
) {
  try {
    const sessionRepo = new SessionRepository()
    const messageRepo = new MessageRepository()

    // 1. 保存会话
    const firstUserMessage = messages.find((m) => m.type === 'user')
    const title = firstUserMessage
      ? String(firstUserMessage.content || '').slice(0, 50) + '...'
      : '新对话'

    await sessionRepo.create({
      id: sessionId,
      title,
      workspacePath,
      engineId: engineId as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: messages.length,
      totalTokens: 0, // TODO: 计算 tokens
      archivedCount: 0,
      archivedTokens: 0,
      isDeleted: false,
      isPinned: false,
      schemaVersion: 1,
    })

    // 2. 保存消息
    const dbMessages = messages.map((msg) => ({
      id: msg.id,
      sessionId,
      role: msg.type as any,
      content: String(msg.content || ''),
      tokens: 0, // TODO: 计算 tokens
      isArchived: false,
      importanceScore: 0,
      isDeleted: false,
      timestamp: msg.timestamp || new Date().toISOString(),
      toolCalls: undefined,
    }))

    const result = await messageRepo.createBatch(dbMessages)

    console.log('[MemoryService] 会话保存成功:', {
      sessionId,
      messageSuccess: result.success,
      messageFailed: result.failed,
    })

    return true
  } catch (error) {
    console.error('[MemoryService] 保存会话失败:', error)
    return false
  }
}

/**
 * 从数据库加载会话
 */
export async function loadSessionFromDatabase(sessionId: string) {
  try {
    const sessionRepo = new SessionRepository()
    const messageRepo = new MessageRepository()

    // 1. 加载会话
    const session = await sessionRepo.findById(sessionId)
    if (!session) {
      throw new Error('会话不存在')
    }

    // 2. 加载消息
    const messages = await messageRepo.findBySessionId(sessionId, {
      limit: 10000,
      includeArchived: false,
      includeDeleted: false,
    })

    console.log('[MemoryService] 会话加载成功:', {
      sessionId,
      messageCount: messages.length,
    })

    return {
      session,
      messages,
    }
  } catch (error) {
    console.error('[MemoryService] 加载会话失败:', error)
    throw error
  }
}

/**
 * 获取所有会话列表
 */
export async function getAllSessions(workspacePath?: string) {
  try {
    const sessionRepo = new SessionRepository()

    const sessions = workspacePath
      ? await sessionRepo.findByWorkspacePath(workspacePath)
      : await sessionRepo.findAll()

    return sessions
  } catch (error) {
    console.error('[MemoryService] 获取会话列表失败:', error)
    return []
  }
}

/**
 * 删除会话
 */
export async function deleteSession(sessionId: string) {
  try {
    const sessionRepo = new SessionRepository()
    await sessionRepo.softDelete(sessionId)

    console.log('[MemoryService] 会话删除成功:', sessionId)
    return true
  } catch (error) {
    console.error('[MemoryService] 删除会话失败:', error)
    return false
  }
}
