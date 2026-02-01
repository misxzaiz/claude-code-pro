/**
 * 消息仓储
 *
 * 负责消息的 CRUD 操作
 */

import Database from '@tauri-apps/plugin-sql'
import type { Message, QueryOptions, BatchResult } from '../types'
import { DatabaseManager } from '../database'

export class MessageRepository {
  private db: Database

  constructor() {
    this.db = DatabaseManager.getInstance().getDatabase()
  }

  /**
   * 创建消息
   */
  async create(message: Message): Promise<Message> {
    await this.db.execute(
      `INSERT INTO messages (
        id, session_id, role, content, tokens, is_archived, archived_at,
        importance_score, is_deleted, timestamp, tool_calls
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        message.id,
        message.sessionId,
        message.role,
        message.content,
        message.tokens,
        message.isArchived ? 1 : 0,
        message.archivedAt || null,
        message.importanceScore,
        message.isDeleted ? 1 : 0,
        message.timestamp,
        message.toolCalls || null,
      ]
    )

    return message
  }

  /**
   * 批量创建消息
   */
  async createBatch(messages: Message[]): Promise<BatchResult> {
    const result: BatchResult = {
      success: 0,
      failed: 0,
      errors: [],
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      try {
        await this.create(msg)
        result.success++
      } catch (error) {
        result.failed++
        result.errors.push({
          index: i,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return result
  }

  /**
   * 根据 ID 查询消息
   */
  async findById(id: string): Promise<Message | null> {
    type ResultRow = any

    const result = await this.db.select<ResultRow[]>(`SELECT * FROM messages WHERE id = $1`, [id])

    if (!result || result.length === 0) {
      return null
    }

    return this.mapToEntity(result[0])
  }

  /**
   * 根据会话 ID 查询消息
   */
  async findBySessionId(sessionId: string, options: QueryOptions = {}): Promise<Message[]> {
    const {
      limit = 100,
      offset = 0,
      includeArchived = false,
      includeDeleted = false,
      orderBy = 'timestamp',
      orderDirection = 'ASC',
    } = options

    const conditions: string[] = ['session_id = $1']
    const params: (string | number)[] = [sessionId]
    let paramIndex = 2

    if (!includeArchived) {
      conditions.push(`is_archived = $${paramIndex++}`)
      params.push(0)
    }

    if (!includeDeleted) {
      conditions.push(`is_deleted = $${paramIndex++}`)
      params.push(0)
    }

    params.push(limit, offset)

    type ResultRow = any

    const result = await this.db.select<ResultRow[]>(
      `SELECT * FROM messages
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy} ${orderDirection}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      params
    )

    if (!result) return []

    return result.map((row: ResultRow) => this.mapToEntity(row))
  }

  /**
   * 更新消息
   */
  async update(id: string, updates: Partial<Omit<Message, 'id' | 'sessionId' | 'timestamp'>>): Promise<void> {
    const fields: string[] = []
    const values: (string | number | boolean)[] = []

    if (updates.role !== undefined) {
      fields.push('role = ?')
      values.push(updates.role)
    }
    if (updates.content !== undefined) {
      fields.push('content = ?')
      values.push(updates.content)
    }
    if (updates.tokens !== undefined) {
      fields.push('tokens = ?')
      values.push(updates.tokens)
    }
    if (updates.isArchived !== undefined) {
      fields.push('is_archived = ?')
      values.push(updates.isArchived ? 1 : 0)
      if (updates.isArchived) {
        fields.push('archived_at = ?')
        values.push(new Date().toISOString())
      }
    }
    if (updates.importanceScore !== undefined) {
      fields.push('importance_score = ?')
      values.push(updates.importanceScore)
    }
    if (updates.isDeleted !== undefined) {
      fields.push('is_deleted = ?')
      values.push(updates.isDeleted ? 1 : 0)
    }
    if (updates.toolCalls !== undefined) {
      fields.push('tool_calls = ?')
      values.push(updates.toolCalls)
    }

    if (fields.length === 0) {
      return
    }

    values.push(id)

    await this.db.execute(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`, values)
  }

  /**
   * 批量归档消息
   */
  async archiveBatch(messageIds: string[]): Promise<BatchResult> {
    const result: BatchResult = {
      success: 0,
      failed: 0,
      errors: [],
    }

    for (let i = 0; i < messageIds.length; i++) {
      try {
        await this.update(messageIds[i], { isArchived: true })
        result.success++
      } catch (error) {
        result.failed++
        result.errors.push({
          index: i,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return result
  }

  /**
   * 批量更新重要性评分
   */
  async updateImportanceBatch(scores: Array<{ messageId: string; score: number }>): Promise<BatchResult> {
    const result: BatchResult = {
      success: 0,
      failed: 0,
      errors: [],
    }

    for (let i = 0; i < scores.length; i++) {
      const { messageId, score } = scores[i]
      try {
        await this.update(messageId, { importanceScore: score })
        result.success++
      } catch (error) {
        result.failed++
        result.errors.push({
          index: i,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return result
  }

  /**
   * 软删除消息
   */
  async softDelete(id: string): Promise<void> {
    await this.db.execute(`UPDATE messages SET is_deleted = 1 WHERE id = $1`, [id])
  }

  /**
   * 永久删除消息
   */
  async delete(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM messages WHERE id = $1`, [id])
  }

  /**
   * 统计消息数量
   */
  async count(sessionId?: string): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM messages WHERE is_deleted = 0`
    const params: (string | number)[] = []

    if (sessionId) {
      sql += ` AND session_id = $1`
      params.push(sessionId)
    }

    type ResultRow = { count: number }
    const result = await this.db.select<ResultRow>(sql, params.length > 0 ? params : undefined)
    return result?.count || 0
  }

  /**
   * 统计归档消息数量
   */
  async countArchived(sessionId: string): Promise<number> {
    type ResultRow = { count: number }
    const result = await this.db.select<ResultRow>(
      `SELECT COUNT(*) as count FROM messages
       WHERE session_id = $1 AND is_archived = 1 AND is_deleted = 0`,
      [sessionId]
    )
    return result?.count || 0
  }

  /**
   * 获取会话的 Token 总数
   */
  async getTotalTokens(sessionId: string): Promise<number> {
    type ResultRow = { total: number }
    const result = await this.db.select<ResultRow>(
      `SELECT SUM(tokens) as total FROM messages
       WHERE session_id = $1 AND is_deleted = 0`,
      [sessionId]
    )
    return result?.total || 0
  }

  /**
   * 映射数据库行到实体
   */
  private mapToEntity(row: any): Message {
    return {
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      tokens: row.tokens,
      isArchived: row.is_archived === 1,
      archivedAt: row.archived_at,
      importanceScore: row.importance_score,
      isDeleted: row.is_deleted === 1,
      timestamp: row.timestamp,
      toolCalls: row.tool_calls,
    }
  }
}
