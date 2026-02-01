/**
 * 摘要仓储
 *
 * 负责对话摘要的 CRUD 操作
 */

import Database from '@tauri-apps/plugin-sql'
import type { ConversationSummary } from '../types'
import { DatabaseManager } from '../database'

export class SummaryRepository {
  private db: Database

  constructor() {
    this.db = DatabaseManager.getInstance().getDatabase()
  }

  /**
   * 创建摘要
   */
  async create(summary: ConversationSummary): Promise<ConversationSummary> {
    await this.db.execute(
      `INSERT INTO conversation_summaries (
        id, session_id, start_time, end_time, message_count, total_tokens,
        summary, key_points, created_at, model_used, cost_tokens
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        summary.id,
        summary.sessionId,
        summary.startTime,
        summary.endTime,
        summary.messageCount,
        summary.totalTokens,
        summary.summary,
        JSON.stringify(summary.keyPoints),
        summary.createdAt,
        summary.modelUsed,
        summary.costTokens,
      ]
    )

    return summary
  }

  /**
   * 批量创建摘要
   */
  async createBatch(summaries: ConversationSummary[]): Promise<void> {
    for (const summary of summaries) {
      await this.create(summary)
    }
  }

  /**
   * 根据 ID 查询摘要
   */
  async findById(id: string): Promise<ConversationSummary | null> {
    type ResultRow = any

    const result = await this.db.select<ResultRow[]>(`SELECT * FROM conversation_summaries WHERE id = $1`, [id])

    if (!result || result.length === 0) {
      return null
    }

    return this.mapToEntity(result[0])
  }

  /**
   * 根据会话 ID 查询所有摘要
   */
  async findBySessionId(sessionId: string): Promise<ConversationSummary[]> {
    type ResultRow = any

    const result = await this.db.select<ResultRow[]>(
      `SELECT * FROM conversation_summaries
       WHERE session_id = $1
       ORDER BY start_time ASC`,
      [sessionId]
    )

    if (!result) return []

    return result.map((row: ResultRow) => this.mapToEntity(row))
  }

  /**
   * 删除摘要
   */
  async delete(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM conversation_summaries WHERE id = $1`, [id])
  }

  /**
   * 删除会话的所有摘要
   */
  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.db.execute(`DELETE FROM conversation_summaries WHERE session_id = $1`, [sessionId])
  }

  /**
   * 统计摘要数量
   */
  async count(sessionId?: string): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM conversation_summaries`
    const params: (string | number)[] = []

    if (sessionId) {
      sql += ` WHERE session_id = $1`
      params.push(sessionId)
    }

    type ResultRow = { count: number }
    const result = await this.db.select<ResultRow>(sql, params.length > 0 ? params : undefined)
    return result?.count || 0
  }

  /**
   * 获取会话的总摘要成本（tokens）
   */
  async getTotalCostTokens(sessionId: string): Promise<number> {
    type ResultRow = { total: number }
    const result = await this.db.select<ResultRow>(
      `SELECT SUM(cost_tokens) as total FROM conversation_summaries
       WHERE session_id = $1`,
      [sessionId]
    )
    return result?.total || 0
  }

  /**
   * 映射数据库行到实体
   */
  private mapToEntity(row: any): ConversationSummary {
    return {
      id: row.id,
      sessionId: row.session_id,
      startTime: row.start_time,
      endTime: row.end_time,
      messageCount: row.message_count,
      totalTokens: row.total_tokens,
      summary: row.summary,
      keyPoints: JSON.parse(row.key_points),
      createdAt: row.created_at,
      modelUsed: row.model_used,
      costTokens: row.cost_tokens,
    }
  }
}
