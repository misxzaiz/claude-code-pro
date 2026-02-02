/**
 * 长期记忆服务
 * 负责知识的提取、存储和管理
 *
 * @author Polaris Team
 * @since 2026-02-03
 */

import type { Session, Message } from '../types'
import { KnowledgeType, type ExtractedKnowledge, type LongTermMemory } from '../types'
import { KnowledgeExtractor } from './knowledge-extractor'
import { LongTermMemoryRepository } from './repository'
import { DatabaseManager } from '../database'

/**
 * 长期记忆服务
 */
export class LongTermMemoryService {
  private extractor: KnowledgeExtractor
  private repository: LongTermMemoryRepository | null = null
  private isInitialized = false

  constructor() {
    this.extractor = new KnowledgeExtractor()
  }

  /**
   * 初始化服务
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      console.warn('[LongTermMemoryService] 已初始化，跳过')
      return
    }

    try {
      const dbManager = DatabaseManager.getInstance()
      const db = await dbManager.getDatabase()
      this.repository = new LongTermMemoryRepository(db)
      this.isInitialized = true

      console.log('[LongTermMemoryService] ✅ 初始化成功')
    } catch (error) {
      console.error('[LongTermMemoryService] ❌ 初始化失败:', error)
      throw error
    }
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.repository) {
      throw new Error('[LongTermMemoryService] 未初始化，请先调用 init()')
    }
  }

  /**
   * 从会话列表提取长期记忆
   */
  async extractFromSessions(
    sessions: Session[],
    allMessages: Message[]
  ): Promise<{
    projectKnowledge: ExtractedKnowledge[]
    userPreferences: ExtractedKnowledge[]
    faq: ExtractedKnowledge[]
    total: number
  }> {
    console.log('[LongTermMemoryService] 开始提取长期记忆...', {
      sessionCount: sessions.length,
      messageCount: allMessages.length,
    })

    // 1. 提取项目知识（从第一个会话）
    const projectKnowledge = await this.extractor.extractProjectKnowledge(
      sessions[0] || sessions[0],
      allMessages.filter((m) => m.sessionId === sessions[0]?.id)
    )

    // 2. 提取用户偏好
    const userPreferences = await this.extractor.extractUserPreferences(
      sessions,
      allMessages
    )

    // 3. 提取 FAQ
    const faq = await this.extractor.extractFAQ(sessions, allMessages)

    const total = projectKnowledge.length + userPreferences.length + faq.length

    console.log('[LongTermMemoryService] 提取完成', {
      projectKnowledgeCount: projectKnowledge.length,
      userPreferencesCount: userPreferences.length,
      faqCount: faq.length,
      total,
    })

    return {
      projectKnowledge,
      userPreferences,
      faq,
      total,
    }
  }

  /**
   * 保存知识到数据库
   */
  async saveKnowledge(knowledge: ExtractedKnowledge): Promise<LongTermMemory> {
    this.ensureInitialized()

    // 检查是否已存在
    const existing = await this.repository!.findByKey(knowledge.key)

    if (existing) {
      // 更新而不是创建新记录
      await this.repository!.update(existing.id, {
        hitCount: existing.hitCount + 1,
        lastHitAt: new Date().toISOString(),
      })

      console.log('[LongTermMemoryService] 更新已有知识', {
        key: knowledge.key,
        newHitCount: existing.hitCount + 1,
      })

      return {
        ...existing,
        hitCount: existing.hitCount + 1,
        lastHitAt: new Date().toISOString(),
      }
    }

    // 创建新记录
    const memory = await this.repository!.create({
      type: knowledge.type,
      key: knowledge.key,
      value: JSON.stringify(knowledge.value),
      workspacePath: knowledge.workspacePath,
      sessionId: knowledge.sessionId,
      hitCount: knowledge.hitCount,
      lastHitAt: knowledge.lastHitAt ?? undefined,
      createdAt: knowledge.extractedAt,
      updatedAt: knowledge.extractedAt,
      isDeleted: false,
      confidence: knowledge.confidence,
    })

    console.log('[LongTermMemoryService] 保存新知识', {
      id: memory.id,
      type: memory.type,
      key: memory.key,
    })

    return memory
  }

  /**
   * 批量保存知识
   */
  async saveBatch(knowledges: ExtractedKnowledge[]): Promise<{
    created: number
    updated: number
    failed: number
  }> {
    this.ensureInitialized()

    let created = 0
    let updated = 0
    let failed = 0

    console.log('[LongTermMemoryService] 批量保存知识...', {
      total: knowledges.length,
    })

    for (const knowledge of knowledges) {
      try {
        const existing = await this.repository!.findByKey(knowledge.key)

        if (existing) {
          await this.repository!.update(existing.id, {
            hitCount: existing.hitCount + 1,
            lastHitAt: new Date().toISOString(),
          })
          updated++
        } else {
          // 不传递 sessionId 以避免外键约束错误
          // 会话关联是可选的，主要用于跟踪来源，不是必需的
          await this.repository!.create({
            type: knowledge.type,
            key: knowledge.key,
            value: JSON.stringify(knowledge.value),
            workspacePath: knowledge.workspacePath,
            // sessionId: knowledge.sessionId, // 注释掉，避免外键约束错误
            hitCount: knowledge.hitCount,
            lastHitAt: knowledge.lastHitAt ?? undefined,
            createdAt: knowledge.extractedAt,
            updatedAt: knowledge.extractedAt,
            isDeleted: false,
            confidence: knowledge.confidence,
          })
          created++
        }
      } catch (error) {
        console.error('[LongTermMemoryService] 保存知识失败:', {
          key: knowledge.key,
          error,
        })
        failed++
      }
    }

    console.log('[LongTermMemoryService] 批量保存完成', {
      created,
      updated,
      failed,
    })

    return { created, updated, failed }
  }

  /**
   * 查找相关记忆
   */
  async findRelevantMemories(
    query: string,
    workspacePath?: string,
    limit: number = 10
  ): Promise<LongTermMemory[]> {
    this.ensureInitialized()

    return await this.repository!.search(query, workspacePath, limit)
  }

  /**
   * 按类型获取记忆
   */
  async getByType(
    type: KnowledgeType,
    workspacePath?: string,
    limit?: number
  ): Promise<LongTermMemory[]> {
    this.ensureInitialized()

    return await this.repository!.findByType(type, workspacePath, limit)
  }

  /**
   * 获取所有记忆
   */
  async getAll(options?: {
    type?: KnowledgeType
    workspacePath?: string
    limit?: number
    offset?: number
  }): Promise<LongTermMemory[]> {
    this.ensureInitialized()

    return await this.repository!.getAll(options)
  }

  /**
   * 记录记忆命中
   */
  async recordMemoryHit(id: string): Promise<void> {
    this.ensureInitialized()

    await this.repository!.updateHitCount(id)
  }

  /**
   * 获取热门记忆
   */
  async getTopMemories(
    limit: number = 10,
    workspacePath?: string
  ): Promise<LongTermMemory[]> {
    this.ensureInitialized()

    return await this.repository!.getTopMemories(limit, workspacePath)
  }

  /**
   * 根据 key 获取记忆
   */
  async getByKey(key: string): Promise<LongTermMemory | null> {
    this.ensureInitialized()

    return await this.repository!.findByKey(key)
  }

  /**
   * 根据会话 ID 获取记忆
   */
  async getBySessionId(sessionId: string): Promise<LongTermMemory[]> {
    this.ensureInitialized()

    return await this.repository!.findBySessionId(sessionId)
  }

  /**
   * 根据工作区获取记忆
   */
  async getByWorkspace(workspacePath: string): Promise<LongTermMemory[]> {
    this.ensureInitialized()

    return await this.repository!.findByWorkspace(workspacePath)
  }

  /**
   * 更新记忆
   */
  async updateMemory(
    id: string,
    updates: Partial<Omit<LongTermMemory, 'id' | 'createdAt'>>
  ): Promise<void> {
    this.ensureInitialized()

    await this.repository!.update(id, updates)
  }

  /**
   * 删除记忆（软删除）
   */
  async deleteMemory(id: string): Promise<void> {
    this.ensureInitialized()

    await this.repository!.softDelete(id)
  }

  /**
   * 永久删除记忆
   */
  async permanentlyDeleteMemory(id: string): Promise<void> {
    this.ensureInitialized()

    await this.repository!.delete(id)
  }

  /**
   * 统计记忆数量
   */
  async count(options?: {
    type?: KnowledgeType
    workspacePath?: string
  }): Promise<number> {
    this.ensureInitialized()

    return await this.repository!.count(options)
  }

  /**
   * 获取统计信息
   */
  async getStats(workspacePath?: string): Promise<{
    total: number
    byType: Record<KnowledgeType, number>
    topMemories: LongTermMemory[]
  }> {
    this.ensureInitialized()

    const total = await this.repository!.count({ workspacePath })

    const byType: Record<KnowledgeType, number> = {
      [KnowledgeType.PROJECT_CONTEXT]: 0,
      [KnowledgeType.KEY_DECISION]: 0,
      [KnowledgeType.USER_PREFERENCE]: 0,
      [KnowledgeType.FAQ]: 0,
      [KnowledgeType.CODE_PATTERN]: 0,
    }

    for (const type of Object.values(KnowledgeType)) {
      byType[type] = await this.repository!.count({ type, workspacePath })
    }

    const topMemories = await this.repository!.getTopMemories(5, workspacePath)

    return {
      total,
      byType,
      topMemories,
    }
  }
}

// ============================================================================
// 单例模式
// ============================================================================

let serviceInstance: LongTermMemoryService | null = null

/**
 * 获取长期记忆服务实例
 */
export function getLongTermMemoryService(): LongTermMemoryService {
  if (!serviceInstance) {
    serviceInstance = new LongTermMemoryService()
  }
  return serviceInstance
}

/**
 * 重置长期记忆服务实例
 */
export function resetLongTermMemoryService(): void {
  serviceInstance = null
}
