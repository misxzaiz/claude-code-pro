/**
 * 长期记忆存储库
 * 负责长期记忆的数据库操作
 *
 * @author Polaris Team
 * @since 2026-02-03
 */

import Database from '@tauri-apps/plugin-sql'
import type { LongTermMemory, KnowledgeType } from '../types'

/**
 * 长期记忆存储库
 */
export class LongTermMemoryRepository {
  constructor(private db: Database) {}

  /**
   * 创建长期记忆
   */
  async create(memory: Omit<LongTermMemory, 'id'>): Promise<LongTermMemory> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await this.db.execute(
      `INSERT INTO long_term_memories (
        id, type, key, value, workspace_path, session_id,
        hit_count, last_hit_at, created_at, updated_at, is_deleted, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        memory.type,
        memory.key,
        JSON.stringify(memory.value),
        memory.workspacePath || '',
        memory.sessionId ?? null,
        memory.hitCount || 0,
        memory.lastHitAt || null,
        memory.createdAt || now,
        memory.updatedAt || now,
        memory.isDeleted !== undefined ? (memory.isDeleted ? 1 : 0) : 0,
        memory.confidence !== undefined ? memory.confidence : 0.5,
      ]
    )

    return {
      ...memory,
      id,
      createdAt: memory.createdAt || now,
      updatedAt: memory.updatedAt || now,
    }
  }

  /**
   * 根据 key 查找记忆
   */
  async findByKey(key: string): Promise<LongTermMemory | null> {
    const results = await this.db.select<any>(
      `SELECT * FROM long_term_memories WHERE key = $1 AND is_deleted = 0`,
      [key]
    )

    if (!results || results.length === 0) return null

    return this.mapToLongTermMemory(results[0])
  }

  /**
   * 根据类型查找记忆
   */
  async findByType(
    type: KnowledgeType,
    workspacePath?: string,
    limit?: number
  ): Promise<LongTermMemory[]> {
    let sql = `SELECT * FROM long_term_memories WHERE type = $1 AND is_deleted = 0`
    const params: any[] = [type]

    if (workspacePath) {
      sql += ` AND workspace_path = $2`
      params.push(workspacePath)
    }

    sql += ` ORDER BY hit_count DESC, created_at DESC`

    if (limit) {
      sql += ` LIMIT $${params.length + 1}`
      params.push(limit)
    }

    const results = await this.db.select<any>(sql, params)

    return results.map((r: any) => this.mapToLongTermMemory(r))
  }

  /**
   * 根据会话 ID 查找记忆
   */
  async findBySessionId(sessionId: string): Promise<LongTermMemory[]> {
    const results = await this.db.select<any>(
      `SELECT * FROM long_term_memories
       WHERE session_id = $1 AND is_deleted = 0
       ORDER BY created_at DESC`,
      [sessionId]
    )

    return results.map((r: any) => this.mapToLongTermMemory(r))
  }

  /**
   * 根据工作区查找记忆
   */
  async findByWorkspace(workspacePath: string): Promise<LongTermMemory[]> {
    const results = await this.db.select<any>(
      `SELECT * FROM long_term_memories
       WHERE workspace_path = $1 AND is_deleted = 0
       ORDER BY hit_count DESC, created_at DESC`,
      [workspacePath]
    )

    return results.map((r: any) => this.mapToLongTermMemory(r))
  }

  /**
   * 搜索记忆（关键词匹配）
   */
  async search(
    query: string,
    workspacePath?: string,
    limit: number = 20
  ): Promise<LongTermMemory[]> {
    let sql = `SELECT * FROM long_term_memories WHERE is_deleted = 0`
    const params: any[] = []

    // 关键词搜索（在 key 和 value 中）
    sql += ` AND (key LIKE $1 OR value LIKE $2)`
    params.push(`%${query}%`, `%${query}%`)

    if (workspacePath) {
      sql += ` AND workspace_path = $3`
      params.push(workspacePath)
    }

    sql += ` ORDER BY hit_count DESC, created_at DESC LIMIT $${params.length + 1}`
    params.push(limit)

    const results = await this.db.select<any>(sql, params)

    return results.map((r: any) => this.mapToLongTermMemory(r))
  }

  /**
   * 更新命中次数
   */
  async updateHitCount(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE long_term_memories
       SET hit_count = hit_count + 1,
           last_hit_at = $1,
           updated_at = $2
       WHERE id = $3`,
      [new Date().toISOString(), new Date().toISOString(), id]
    )
  }

  /**
   * 更新记忆
   */
  async update(
    id: string,
    updates: Partial<Omit<LongTermMemory, 'id' | 'createdAt'>>
  ): Promise<void> {
    const setParts: string[] = []
    const params: any[] = []

    if (updates.type !== undefined) {
      setParts.push(`type = $${params.length + 1}`)
      params.push(updates.type)
    }

    if (updates.key !== undefined) {
      setParts.push(`key = $${params.length + 1}`)
      params.push(updates.key)
    }

    if (updates.value !== undefined) {
      setParts.push(`value = $${params.length + 1}`)
      params.push(JSON.stringify(updates.value))
    }

    if (updates.workspacePath !== undefined) {
      setParts.push(`workspace_path = $${params.length + 1}`)
      params.push(updates.workspacePath)
    }

    if (updates.sessionId !== undefined) {
      setParts.push(`session_id = $${params.length + 1}`)
      params.push(updates.sessionId)
    }

    if (updates.hitCount !== undefined) {
      setParts.push(`hit_count = $${params.length + 1}`)
      params.push(updates.hitCount)
    }

    if (updates.lastHitAt !== undefined) {
      setParts.push(`last_hit_at = $${params.length + 1}`)
      params.push(updates.lastHitAt)
    }

    if (updates.isDeleted !== undefined) {
      setParts.push(`is_deleted = $${params.length + 1}`)
      params.push(updates.isDeleted ? 1 : 0)
    }

    if (updates.confidence !== undefined) {
      setParts.push(`confidence = $${params.length + 1}`)
      params.push(updates.confidence)
    }

    setParts.push(`updated_at = $${params.length + 1}`)
    params.push(new Date().toISOString())

    params.push(id)

    await this.db.execute(
      `UPDATE long_term_memories SET ${setParts.join(', ')} WHERE id = $${params.length}`,
      params
    )
  }

  /**
   * 软删除记忆
   */
  async softDelete(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE long_term_memories
       SET is_deleted = 1, updated_at = $1
       WHERE id = $2`,
      [new Date().toISOString(), id]
    )
  }

  /**
   * 永久删除记忆
   */
  async delete(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM long_term_memories WHERE id = $1`, [id])
  }

  /**
   * 获取热门记忆（按命中次数排序）
   */
  async getTopMemories(
    limit: number = 10,
    workspacePath?: string
  ): Promise<LongTermMemory[]> {
    let sql = `SELECT * FROM long_term_memories WHERE is_deleted = 0`
    const params: any[] = []

    if (workspacePath) {
      sql += ` AND workspace_path = $1`
      params.push(workspacePath)
    }

    sql += ` ORDER BY hit_count DESC, created_at DESC LIMIT $${params.length + 1}`
    params.push(limit)

    const results = await this.db.select<any>(sql, params)

    return results.map((r: any) => this.mapToLongTermMemory(r))
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
    let sql = `SELECT * FROM long_term_memories WHERE is_deleted = 0`
    const params: any[] = []

    if (options?.type) {
      sql += ` AND type = $${params.length + 1}`
      params.push(options.type)
    }

    if (options?.workspacePath) {
      sql += ` AND workspace_path = $${params.length + 1}`
      params.push(options.workspacePath)
    }

    sql += ` ORDER BY created_at DESC`

    if (options?.limit) {
      sql += ` LIMIT $${params.length + 1}`
      params.push(options.limit)

      if (options?.offset) {
        sql += ` OFFSET $${params.length + 1}`
        params.push(options.offset)
      }
    }

    const results = await this.db.select<any>(sql, params)

    return results.map((r: any) => this.mapToLongTermMemory(r))
  }

  /**
   * 统计记忆数量
   */
  async count(options?: {
    type?: KnowledgeType
    workspacePath?: string
  }): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM long_term_memories WHERE is_deleted = 0`
    const params: any[] = []

    if (options?.type) {
      sql += ` AND type = $${params.length + 1}`
      params.push(options.type)
    }

    if (options?.workspacePath) {
      sql += ` AND workspace_path = $${params.length + 1}`
      params.push(options.workspacePath)
    }

    const results = await this.db.select<any>(sql, params)

    return results[0]?.count || 0
  }

  /**
   * 批量创建记忆
   */
  async createBatch(memories: Omit<LongTermMemory, 'id'>[]): Promise<void> {
    const now = new Date().toISOString()

    for (const memory of memories) {
      await this.db.execute(
        `INSERT INTO long_term_memories (
          id, type, key, value, workspace_path, session_id,
          hit_count, last_hit_at, created_at, updated_at, is_deleted, confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          crypto.randomUUID(),
          memory.type,
          memory.key,
          JSON.stringify(memory.value),
          memory.workspacePath || '',
          memory.sessionId ?? null,
          memory.hitCount || 0,
          memory.lastHitAt || null,
          memory.createdAt || now,
          memory.updatedAt || now,
          memory.isDeleted !== undefined ? (memory.isDeleted ? 1 : 0) : 0,
          memory.confidence !== undefined ? memory.confidence : 0.5,
        ]
      )
    }
  }

  /**
   * 清空所有记忆（慎用）
   */
  async clear(): Promise<void> {
    await this.db.execute(`DELETE FROM long_term_memories`)
  }

  /**
   * 将数据库记录映射为 LongTermMemory 对象
   */
  private mapToLongTermMemory(row: any): LongTermMemory {
    return {
      id: row.id,
      type: row.type as KnowledgeType,
      key: row.key,
      value: typeof row.value === 'string' ? JSON.parse(row.value) : row.value,
      workspacePath: row.workspace_path || undefined,
      sessionId: row.session_id || undefined,
      hitCount: row.hit_count || 0,
      lastHitAt: row.last_hit_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isDeleted: row.is_deleted === 1,
      confidence: row.confidence || 0.5,
    }
  }
}
