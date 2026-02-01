/**
 * 会话仓储
 *
 * 负责会话的 CRUD 操作
 */

import Database from '@tauri-apps/plugin-sql'
import type { Session, QueryOptions } from '../types'
import { DatabaseManager } from '../database'

export class SessionRepository {
  private db: Database

  constructor() {
    this.db = DatabaseManager.getInstance().getDatabase()
  }

  /**
   * 创建会话
   */
  async create(session: Session): Promise<Session> {
    await this.db.execute(
      `INSERT INTO sessions (
        id, title, workspace_path, engine_id, created_at, updated_at,
        message_count, total_tokens, archived_count, archived_tokens,
        is_deleted, is_pinned, metadata, schema_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        session.id,
        session.title,
        session.workspacePath,
        session.engineId,
        session.createdAt,
        session.updatedAt,
        session.messageCount,
        session.totalTokens,
        session.archivedCount,
        session.archivedTokens,
        session.isDeleted ? 1 : 0,
        session.isPinned ? 1 : 0,
        session.metadata || null,
        session.schemaVersion,
      ]
    )

    return session
  }

  /**
   * 根据 ID 查询会话
   */
  async findById(id: string): Promise<Session | null> {
    type ResultRow = {
      id: string
      title: string
      workspace_path: string
      engine_id: string
      created_at: string
      updated_at: string
      message_count: number
      total_tokens: number
      archived_count: number
      archived_tokens: number
      is_deleted: number
      is_pinned: number
      metadata: string | null
      schema_version: number
    }

    const result = await this.db.select<ResultRow[]>(`SELECT * FROM sessions WHERE id = $1`, [id])

    if (!result || result.length === 0) {
      return null
    }

    return this.mapToEntity(result[0])
  }

  /**
   * 查询所有会话
   */
  async findAll(options: QueryOptions = {}): Promise<Session[]> {
    const { limit = 100, offset = 0, orderBy = 'created_at', orderDirection = 'DESC' } = options

    type ResultRow = any

    const result = await this.db.select<ResultRow[]>(
      `SELECT * FROM sessions
       WHERE is_deleted = 0
       ORDER BY ${orderBy} ${orderDirection}
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )

    if (!result) return []

    return result.map((row: ResultRow) => this.mapToEntity(row))
  }

  /**
   * 根据工作区路径查询会话
   */
  async findByWorkspacePath(workspacePath: string, options: QueryOptions = {}): Promise<Session[]> {
    const { limit = 100, offset = 0, orderBy = 'created_at', orderDirection = 'DESC' } = options

    type ResultRow = any

    const result = await this.db.select<ResultRow[]>(
      `SELECT * FROM sessions
       WHERE workspace_path = $1 AND is_deleted = 0
       ORDER BY ${orderBy} ${orderDirection}
       LIMIT $2 OFFSET $3`,
      [workspacePath, limit, offset]
    )

    if (!result) return []

    return result.map((row: ResultRow) => this.mapToEntity(row))
  }

  /**
   * 根据引擎 ID 查询会话
   */
  async findByEngineId(engineId: string, options: QueryOptions = {}): Promise<Session[]> {
    const { limit = 100, offset = 0, orderBy = 'created_at', orderDirection = 'DESC' } = options

    type ResultRow = any

    const result = await this.db.select<ResultRow[]>(
      `SELECT * FROM sessions
       WHERE engine_id = $1 AND is_deleted = 0
       ORDER BY ${orderBy} ${orderDirection}
       LIMIT $2 OFFSET $3`,
      [engineId, limit, offset]
    )

    if (!result) return []

    return result.map((row: ResultRow) => this.mapToEntity(row))
  }

  /**
   * 更新会话
   */
  async update(id: string, updates: Partial<Omit<Session, 'id' | 'createdAt' | 'schemaVersion'>>): Promise<void> {
    const fields: string[] = []
    const values: (string | number | boolean)[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      values.push(updates.title)
    }
    if (updates.workspacePath !== undefined) {
      fields.push('workspace_path = ?')
      values.push(updates.workspacePath)
    }
    if (updates.engineId !== undefined) {
      fields.push('engine_id = ?')
      values.push(updates.engineId)
    }
    if (updates.updatedAt !== undefined) {
      fields.push('updated_at = ?')
      values.push(updates.updatedAt)
    }
    if (updates.messageCount !== undefined) {
      fields.push('message_count = ?')
      values.push(updates.messageCount)
    }
    if (updates.totalTokens !== undefined) {
      fields.push('total_tokens = ?')
      values.push(updates.totalTokens)
    }
    if (updates.archivedCount !== undefined) {
      fields.push('archived_count = ?')
      values.push(updates.archivedCount)
    }
    if (updates.archivedTokens !== undefined) {
      fields.push('archived_tokens = ?')
      values.push(updates.archivedTokens)
    }
    if (updates.isDeleted !== undefined) {
      fields.push('is_deleted = ?')
      values.push(updates.isDeleted ? 1 : 0)
    }
    if (updates.isPinned !== undefined) {
      fields.push('is_pinned = ?')
      values.push(updates.isPinned ? 1 : 0)
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?')
      values.push(updates.metadata)
    }

    if (fields.length === 0) {
      return
    }

    values.push(id)

    await this.db.execute(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`, values)
  }

  /**
   * 软删除会话
   */
  async softDelete(id: string): Promise<void> {
    await this.db.execute(`UPDATE sessions SET is_deleted = 1 WHERE id = $1`, [id])
  }

  /**
   * 永久删除会话
   */
  async delete(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM sessions WHERE id = $1`, [id])
  }

  /**
   * 统计会话数量
   */
  async count(): Promise<number> {
    type ResultRow = { count: number }
    const result = await this.db.select<ResultRow>(`SELECT COUNT(*) as count FROM sessions WHERE is_deleted = 0`)
    return result?.count || 0
  }

  /**
   * 映射数据库行到实体
   */
  private mapToEntity(row: any): Session {
    return {
      id: row.id,
      title: row.title,
      workspacePath: row.workspace_path,
      engineId: row.engine_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
      totalTokens: row.total_tokens,
      archivedCount: row.archived_count,
      archivedTokens: row.archived_tokens,
      isDeleted: row.is_deleted === 1,
      isPinned: row.is_pinned === 1,
      metadata: row.metadata,
      schemaVersion: row.schema_version,
    }
  }
}
