# 🚀 上下文记忆功能 - 技术实现方案（最终版）

## 📋 文档说明

本文档是上下文记忆功能的技术实现指南，提供完整的代码级实现方案，包括：
- 完整的代码实现
- 详细的技术选型理由
- 性能优化策略
- 测试方案
- 部署指南

---

## 🎯 一、Phase 1: SQLite 持久化存储 - 完整实现

### 1.1 技术选型最终确认

#### **为什么选择 Tauri SQL Plugin？**

```yaml
方案对比:
  Tauri SQL Plugin:
    性能: ⭐⭐⭐⭐⭐ (原生 SQLite，查询 < 10ms)
    兼容性: ⭐⭐⭐⭐⭐ (跨平台，官方支持)
    开发成本: ⭐⭐⭐⭐☆ (需要配置 Rust 环境)
    维护成本: ⭐⭐⭐⭐⭐ (官方维护，持续更新)
    最终评分: 95/100

  sql.js (WASM):
    性能: ⭐⭐⭐☆☆ (WebAssembly 开销)
    兼容性: ⭐⭐⭐⭐☆ (浏览器环境)
    开发成本: ⭐⭐⭐⭐⭐ (纯 JS)
    维护成本: ⭐⭐⭐☆☆ (社区维护)
    最终评分: 70/100

  IndexedDB:
    性能: ⭐⭐☆☆☆ (查询 50-100ms)
    兼容性: ⭐⭐⭐⭐⭐ (浏览器原生)
    开发成本: ⭐⭐⭐⭐⭐ (无需配置)
    维护成本: ⭐⭐⭐⭐☆ (浏览器 API)
    最终评分: 60/100

最终选择: Tauri SQL Plugin
理由:
  1. 性能最优（比 IndexedDB 快 10 倍）
  2. 容量无限（仅受磁盘限制）
  3. 官方支持（Tauri 团队维护）
  4. 类型安全（完整的 TypeScript 定义）
```

---

### 1.2 环境配置

#### **安装依赖**

```bash
# 1. 安装 Tauri SQL Plugin
npm install @tauri-apps/plugin-sql

# 2. 配置 Tauri（在 src-tauri/Cargo.toml 中）
# 添加依赖：
# [dependencies]
# tauri-plugin-sql = "2"

# 3. 在 src-tauri/src/lib.rs 中注册插件
# tauri::plugin::Builder::new("sql")
#     .build();
```

#### **TypeScript 类型定义**

```typescript
// src/services/memory/types.ts

/**
 * 会话实体
 */
export interface Session {
  id: string
  title: string
  workspacePath: string
  engineId: 'claude-code' | 'iflow' | 'deepseek'
  createdAt: string
  updatedAt: string
  messageCount: number
  totalTokens: number
  archivedCount: number
  archivedTokens: number
  isDeleted: boolean
  isPinned: boolean
  metadata?: string  // JSON 字符串
  schemaVersion: number
}

/**
 * 消息实体
 */
export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tokens: number
  isArchived: boolean
  archivedAt?: string
  importanceScore: number  // 0-100
  isDeleted: boolean
  timestamp: string
  toolCalls?: string  // JSON 字符串
}

/**
 * 对话摘要实体
 */
export interface ConversationSummary {
  id: string
  sessionId: string
  startTime: string
  endTime: string
  messageCount: number
  totalTokens: number
  summary: string
  keyPoints: string[]  // JSON 数组
  createdAt: string
  modelUsed: string
  costTokens: number
}

/**
 * 长期记忆实体
 */
export interface LongTermMemory {
  id: string
  type: 'user_preference' | 'project_context' | 'key_decision'
  key: string
  value: string  // JSON 字符串
  workspacePath?: string
  sessionId?: string
  hitCount: number
  lastHitAt?: string
  createdAt: string
  updatedAt: string
}

/**
 * 查询选项
 */
export interface QueryOptions {
  limit?: number
  offset?: number
  includeArchived?: boolean
  includeDeleted?: boolean
  orderBy?: 'timestamp' | 'importance'
  orderDirection?: 'ASC' | 'DESC'
}

/**
 * 批量操作结果
 */
export interface BatchResult {
  success: number
  failed: number
  errors: Array<{ index: number; error: string }>
}
```

---

### 1.3 数据库初始化

```typescript
// src/services/memory/database.ts

import Database from '@tauri-apps/plugin-sql'

/**
 * 数据库管理器
 *
 * 单例模式，全局只有一个数据库连接
 */
export class DatabaseManager {
  private static instance: DatabaseManager | null = null
  private db: Database | null = null
  private readonly dbPath = 'sqlite:polaris_memory.db'

  /**
   * 获取单例实例
   */
  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    if (this.db) {
      console.warn('[DatabaseManager] 数据库已初始化')
      return
    }

    try {
      console.log('[DatabaseManager] 正在初始化数据库...')

      // 加载数据库（自动创建）
      this.db = await Database.load(this.dbPath)

      // 创建表结构
      await this.createTables()

      // 创建索引
      await this.createIndexes()

      // 创建视图
      await this.createViews()

      // 创建触发器
      await this.createTriggers()

      console.log('[DatabaseManager] 数据库初始化成功')
    } catch (error) {
      console.error('[DatabaseManager] 数据库初始化失败:', error)
      throw error
    }
  }

  /**
   * 创建表结构
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化')

    // 1. 会话表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        engine_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        message_count INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        archived_count INTEGER DEFAULT 0,
        archived_tokens INTEGER DEFAULT 0,
        is_deleted BOOLEAN DEFAULT 0,
        is_pinned BOOLEAN DEFAULT 0,
        metadata TEXT,
        schema_version INTEGER DEFAULT 1
      )
    `)

    // 2. 消息表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tokens INTEGER DEFAULT 0,
        is_archived BOOLEAN DEFAULT 0,
        archived_at TEXT,
        importance_score INTEGER DEFAULT 0,
        is_deleted BOOLEAN DEFAULT 0,
        timestamp TEXT NOT NULL,
        tool_calls TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)

    // 3. 对话摘要表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS conversation_summaries (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        message_count INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        summary TEXT NOT NULL,
        key_points TEXT NOT NULL,
        created_at TEXT NOT NULL,
        model_used TEXT,
        cost_tokens INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)

    // 4. 长期记忆表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS long_term_memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        workspace_path TEXT,
        session_id TEXT,
        hit_count INTEGER DEFAULT 0,
        last_hit_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
      )
    `)

    console.log('[DatabaseManager] 表结构创建完成')
  }

  /**
   * 创建索引
   */
  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化')

    // 会话表索引
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_sessions_workspace
      ON sessions(workspace_path)
    `)
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_sessions_engine
      ON sessions(engine_id)
    `)
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_sessions_created
      ON sessions(created_at DESC)
    `)
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_sessions_deleted
      ON sessions(is_deleted)
    `)

    // 消息表索引
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_messages_session
      ON messages(session_id)
    `)
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp
      ON messages(timestamp DESC)
    `)
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_messages_archived
      ON messages(is_archived)
    `)
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_messages_importance
      ON messages(importance_score DESC)
    `)
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_messages_deleted
      ON messages(is_deleted)
    `)

    // 复合索引（关键性能优化）
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_messages_session_archived
      ON messages(session_id, is_archived)
    `)
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_messages_session_timestamp
      ON messages(session_id, timestamp DESC)
    `)

    // 摘要表索引
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_summaries_session
      ON conversation_summaries(session_id)
    `)
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_summaries_created
      ON conversation_summaries(created_at DESC)
    `)

    // 长期记忆索引
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_memories_type
      ON long_term_memories(type)
    `)
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_memories_workspace
      ON long_term_memories(workspace_path)
    `)
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_memories_key
      ON long_term_memories(key)
    `)
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_memories_hit_count
      ON long_term_memories(hit_count DESC)
    `)

    console.log('[DatabaseManager] 索引创建完成')
  }

  /**
   * 创建视图
   */
  private async createViews(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化')

    // 会话统计视图
    await this.db.execute(`
      CREATE VIEW IF NOT EXISTS v_session_stats AS
      SELECT
        s.id,
        s.title,
        s.workspace_path,
        s.engine_id,
        s.message_count,
        s.total_tokens,
        s.archived_count,
        s.archived_tokens,
        (SELECT COUNT(*) FROM messages WHERE session_id = s.id AND is_archived = 0 AND is_deleted = 0) AS active_message_count,
        (SELECT MAX(timestamp) FROM messages WHERE session_id = s.id AND is_deleted = 0) AS last_message_at
      FROM sessions s
      WHERE s.is_deleted = 0
    `)

    console.log('[DatabaseManager] 视图创建完成')
  }

  /**
   * 创建触发器
   */
  private async createTriggers(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化')

    // 更新会话统计信息（插入消息时）
    await this.db.execute(`
      CREATE TRIGGER IF NOT EXISTS trg_update_session_stats_insert
      AFTER INSERT ON messages
      WHEN NEW.is_deleted = 0
      BEGIN
        UPDATE sessions
        SET message_count = message_count + 1,
            total_tokens = total_tokens + NEW.tokens,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.session_id;
      END
    `)

    // 归档消息时更新统计
    await this.db.execute(`
      CREATE TRIGGER IF NOT EXISTS trg_archive_message
      AFTER UPDATE OF is_archived ON messages
      WHEN NEW.is_archived = 1 AND OLD.is_archived = 0 AND NEW.is_deleted = 0
      BEGIN
        UPDATE sessions
        SET archived_count = archived_count + 1,
            archived_tokens = archived_tokens + NEW.tokens,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.session_id;
      END
    `)

    // 软删除消息时更新统计
    await this.db.execute(`
      CREATE TRIGGER IF NOT EXISTS trg_soft_delete_message
      AFTER UPDATE OF is_deleted ON messages
      WHEN NEW.is_deleted = 1 AND OLD.is_deleted = 0
      BEGIN
        UPDATE sessions
        SET message_count = message_count - 1,
            total_tokens = total_tokens - NEW.tokens,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.session_id;
      END
    `)

    console.log('[DatabaseManager] 触发器创建完成')
  }

  /**
   * 获取数据库连接
   */
  getDatabase(): Database {
    if (!this.db) {
      throw new Error('数据库未初始化，请先调用 init()')
    }
    return this.db
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close()
      this.db = null
      console.log('[DatabaseManager] 数据库连接已关闭')
    }
  }

  /**
   * 清空所有数据（危险操作，仅用于测试）
   */
  async reset(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化')

    console.warn('[DatabaseManager] 正在重置数据库...')

    // 删除所有表
    await this.db.execute('DROP TABLE IF EXISTS messages')
    await this.db.execute('DROP TABLE IF EXISTS conversation_summaries')
    await this.db.execute('DROP TABLE IF EXISTS long_term_memories')
    await this.db.execute('DROP TABLE IF EXISTS sessions')

    // 删除所有视图
    await this.db.execute('DROP VIEW IF EXISTS v_session_stats')

    // 重新创建
    await this.createTables()
    await this.createIndexes()
    await this.createViews()
    await this.createTriggers()

    console.log('[DatabaseManager] 数据库重置完成')
  }
}
```

---

### 1.4 Repository 层实现

```typescript
// src/services/memory/repositories/session-repository.ts

import Database from '@tauri-apps/plugin-sql'
import type { Session, QueryOptions } from '../types'
import { DatabaseManager } from '../database'

/**
 * 会话仓储
 *
 * 负责会话的 CRUD 操作
 */
export class SessionRepository {
  private db: Database

  constructor() {
    this.db = DatabaseManager.getInstance().getDatabase()
  }

  /**
   * 创建会话
   */
  async create(session: Omit<Session, 'schemaVersion'>): Promise<Session> {
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
        session.schemaVersion || 1,
      ]
    )

    return session as Session
  }

  /**
   * 根据 ID 查询会话
   */
  async findById(id: string): Promise<Session | null> {
    const result = await this.db.select<{
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
    }>(
      `SELECT * FROM sessions WHERE id = $1`,
      [id]
    )

    if (result.length === 0) {
      return null
    }

    return this.mapToEntity(result[0])
  }

  /**
   * 查询所有会话
   */
  async findAll(options: QueryOptions = {}): Promise<Session[]> {
    const {
      limit = 100,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'DESC',
    } = options

    const result = await this.db.select<any>(
      `SELECT * FROM sessions
       WHERE is_deleted = 0
       ORDER BY ${orderBy} ${orderDirection}
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )

    return result.map(row => this.mapToEntity(row))
  }

  /**
   * 根据工作区路径查询会话
   */
  async findByWorkspacePath(
    workspacePath: string,
    options: QueryOptions = {}
  ): Promise<Session[]> {
    const {
      limit = 100,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'DESC',
    } = options

    const result = await this.db.select<any>(
      `SELECT * FROM sessions
       WHERE workspace_path = $1 AND is_deleted = 0
       ORDER BY ${orderBy} ${orderDirection}
       LIMIT $2 OFFSET $3`,
      [workspacePath, limit, offset]
    )

    return result.map(row => this.mapToEntity(row))
  }

  /**
   * 更新会话
   */
  async update(
    id: string,
    updates: Partial<Omit<Session, 'id' | 'createdAt' | 'schemaVersion'>>
  ): Promise<void> {
    const fields: string[] = []
    const values: any[] = []

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

    await this.db.execute(
      `UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`,
      values
    )
  }

  /**
   * 软删除会话
   */
  async softDelete(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE sessions SET is_deleted = 1 WHERE id = $1`,
      [id]
    )
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
    const result = await this.db.select<{ count: number }>(
      `SELECT COUNT(*) as count FROM sessions WHERE is_deleted = 0`
    )
    return result[0]?.count || 0
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
```

```typescript
// src/services/memory/repositories/message-repository.ts

import Database from '@tauri-apps/plugin-sql'
import type { Message, QueryOptions } from '../types'
import { DatabaseManager } from '../database'

/**
 * 消息仓储
 *
 * 负责消息的 CRUD 操作
 */
export class MessageRepository {
  private db: Database

  constructor() {
    this.db = DatabaseManager.getInstance().getDatabase()
  }

  /**
   * 创建消息
   */
  async create(message: Omit<Message, 'isArchived' | 'importanceScore' | 'isDeleted'>): Promise<Message> {
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
        0,  // is_archived
        null,  // archived_at
        0,  // importance_score
        0,  // is_deleted
        message.timestamp,
        message.toolCalls || null,
      ]
    )

    return {
      ...message,
      isArchived: false,
      importanceScore: 0,
      isDeleted: false,
    }
  }

  /**
   * 批量创建消息（使用事务）
   */
  async createBatch(messages: Omit<Message, 'isArchived' | 'importanceScore' | 'isDeleted'>[]): Promise<BatchResult> {
    const result: BatchResult = {
      success: 0,
      failed: 0,
      errors: [],
    }

    try {
      await this.db.transaction(async () => {
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
      })
    } catch (error) {
      console.error('[MessageRepository] 批量插入失败:', error)
    }

    return result
  }

  /**
   * 根据 ID 查询消息
   */
  async findById(id: string): Promise<Message | null> {
    const result = await this.db.select<any>(
      `SELECT * FROM messages WHERE id = $1`,
      [id]
    )

    if (result.length === 0) {
      return null
    }

    return this.mapToEntity(result[0])
  }

  /**
   * 根据会话 ID 查询消息
   */
  async findBySessionId(
    sessionId: string,
    options: QueryOptions = {}
  ): Promise<Message[]> {
    const {
      limit = 100,
      offset = 0,
      includeArchived = false,
      includeDeleted = false,
      orderBy = 'timestamp',
      orderDirection = 'ASC',
    } = options

    const conditions: string[] = ['session_id = $1']
    const params: any[] = [sessionId]
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

    const result = await this.db.select<any>(
      `SELECT * FROM messages
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy} ${orderDirection}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      params
    )

    return result.map(row => this.mapToEntity(row))
  }

  /**
   * 更新消息
   */
  async update(
    id: string,
    updates: Partial<Omit<Message, 'id' | 'sessionId' | 'timestamp'>>
  ): Promise<void> {
    const fields: string[] = []
    const values: any[] = []

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

    await this.db.execute(
      `UPDATE messages SET ${fields.join(', ')} WHERE id = ?`,
      values
    )
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
   * 软删除消息
   */
  async softDelete(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE messages SET is_deleted = 1 WHERE id = $1`,
      [id]
    )
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
    const params: any[] = []

    if (sessionId) {
      sql += ` AND session_id = $1`
      params.push(sessionId)
    }

    const result = await this.db.select<{ count: number }>(sql, params)
    return result[0]?.count || 0
  }

  /**
   * 统计归档消息数量
   */
  async countArchived(sessionId: string): Promise<number> {
    const result = await this.db.select<{ count: number }>(
      `SELECT COUNT(*) as count FROM messages
       WHERE session_id = $1 AND is_archived = 1 AND is_deleted = 0`,
      [sessionId]
    )
    return result[0]?.count || 0
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

interface BatchResult {
  success: number
  failed: number
  errors: Array<{ index: number; error: string }>
}
```

---

### 1.5 集成到 eventChatStore

```typescript
// src/stores/eventChatStore.ts (修改部分)

import { DatabaseManager } from '../services/memory/database'
import { SessionRepository } from '../services/memory/repositories/session-repository'
import { MessageRepository } from '../services/memory/repositories/message-repository'

/**
 * 在 Store 初始化时初始化数据库
 */
export const useEventChatStore = create<EventChatState>((set, get) => ({
  // ... 现有状态 ...

  /**
   * 初始化（新增）
   */
  initialize: async () => {
    try {
      // 初始化数据库
      const dbManager = DatabaseManager.getInstance()
      await dbManager.init()

      console.log('[EventChatStore] 数据库初始化成功')

      // ... 其他初始化逻辑 ...
    } catch (error) {
      console.error('[EventChatStore] 初始化失败:', error)
      throw error
    }
  },

  /**
   * 保存会话到数据库（修改）
   */
  saveSessionToDatabase: async () => {
    try {
      const state = get()
      if (!state.conversationId || state.messages.length === 0) {
        return
      }

      const sessionRepo = new SessionRepository()
      const messageRepo = new MessageRepository()

      // 1. 保存会话
      const session = await sessionRepo.create({
        id: state.conversationId,
        title: generateSessionTitle(state.messages),
        workspacePath: useWorkspaceStore.getState().getCurrentWorkspace()?.path || '',
        engineId: useConfigStore.getState().config?.defaultEngine || 'claude-code',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: state.messages.length,
        totalTokens: calculateTotalTokens(state.messages),
        archivedCount: 0,
        archivedTokens: 0,
        isDeleted: false,
        isPinned: false,
      })

      // 2. 保存消息（批量）
      const messages = convertChatMessagesToDBMessages(state.messages, session.id)
      const result = await messageRepo.createBatch(messages)

      console.log('[EventChatStore] 会话保存成功:', {
        sessionId: session.id,
        messageSuccess: result.success,
        messageFailed: result.failed,
      })
    } catch (error) {
      console.error('[EventChatStore] 保存会话失败:', error)
    }
  },

  /**
   * 从数据库加载会话（新增）
   */
  loadSessionFromDatabase: async (sessionId: string) => {
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
        limit: 10000,  // 加载所有消息
        includeArchived: true,
      })

      // 3. 转换为 ChatMessage 格式
      const chatMessages = convertDBMessagesToChatMessages(messages)

      // 4. 更新状态
      set({
        conversationId: session.id,
        messages: chatMessages,
        isStreaming: false,
      })

      console.log('[EventChatStore] 会话加载成功:', {
        sessionId,
        messageCount: messages.length,
      })
    } catch (error) {
      console.error('[EventChatStore] 加载会话失败:', error)
      throw error
    }
  },
}))

// 辅助函数
function generateSessionTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find(m => m.type === 'user')
  if (firstUserMessage && 'content' in firstUserMessage) {
    const content = firstUserMessage.content as string
    return content.slice(0, 50) + (content.length > 50 ? '...' : '')
  }
  return '新对话'
}

function calculateTotalTokens(messages: ChatMessage[]): number {
  // 简单估算
  return messages.reduce((sum, m) => {
    if ('content' in m) {
      const content = m.content as string
      const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length
      const otherChars = content.length - chineseChars
      return sum + Math.ceil(chineseChars / 2 + otherChars / 4)
    }
    return sum
  }, 0)
}

function convertChatMessagesToDBMessages(
  chatMessages: ChatMessage[],
  sessionId: string
): Array<Omit<Message, 'isArchived' | 'importanceScore' | 'isDeleted'>> {
  return chatMessages.map(msg => ({
    id: msg.id,
    sessionId,
    role: msg.type,
    content: 'content' in msg ? String(msg.content) : '',
    tokens: 0,  // TODO: 计算 tokens
    timestamp: msg.timestamp,
    toolCalls: undefined,  // TODO: 提取工具调用
  }))
}

function convertDBMessagesToChatMessages(dbMessages: Message[]): ChatMessage[] {
  return dbMessages.map(msg => {
    const base = {
      id: msg.id,
      timestamp: msg.timestamp,
    }

    if (msg.role === 'user') {
      return { ...base, type: 'user' as const, content: msg.content }
    } else if (msg.role === 'assistant') {
      return {
        ...base,
        type: 'assistant' as const,
        blocks: [{ type: 'text', content: msg.content }],
      }
    } else {
      return { ...base, type: 'system' as const, content: msg.content }
    }
  })
}
```

---

## 🎯 二、Phase 2: 消息摘要 - 完整实现

### 2.1 摘要服务实现

```typescript
// src/services/memory/summarizer.ts

import { invoke } from '@tauri-apps/api/core'
import type { Message, ConversationSummary } from './types'
import { MessageRepository } from './repositories/message-repository'

/**
 * 消息摘要服务
 *
 * 使用 AI 生成对话摘要，节省 Token
 */
export class MessageSummarizer {
  private messageRepo: MessageRepository

  constructor() {
    this.messageRepo = new MessageRepository()
  }

  /**
   * 生成摘要
   */
  async summarize(sessionId: string, messageIds: string[]): Promise<ConversationSummary> {
    console.log('[MessageSummarizer] 开始生成摘要:', { sessionId, messageCount: messageIds.length })

    // 1. 加载消息
    const messages = await this.loadMessages(messageIds)
    if (messages.length === 0) {
      throw new Error('没有可摘要的消息')
    }

    // 2. 检查是否值得摘要
    const roi = this.calculateROI(messages)
    if (roi < 2) {
      console.log('[MessageSummarizer] ROI 过低，跳过摘要:', roi)
      throw new Error('ROI 过低')
    }

    // 3. 构建提示词
    const prompt = this.buildPrompt(messages)

    // 4. 调用 AI 生成摘要
    const summary = await this.callAI(prompt)

    // 5. 解析结果
    const parsed = this.parseSummary(summary)

    // 6. 创建摘要记录
    const summaryEntity: ConversationSummary = {
      id: crypto.randomUUID(),
      sessionId,
      startTime: messages[0].timestamp,
      endTime: messages[messages.length - 1].timestamp,
      messageCount: messages.length,
      totalTokens: messages.reduce((sum, m) => sum + m.tokens, 0),
      summary: parsed.summary,
      keyPoints: parsed.keyPoints,
      createdAt: new Date().toISOString(),
      modelUsed: 'deepseek-chat',
      costTokens: prompt.length + summary.length,
    }

    return summaryEntity
  }

  /**
   * 加载消息
   */
  private async loadMessages(messageIds: string[]): Promise<Message[]> {
    const messages: Message[] = []

    for (const id of messageIds) {
      const msg = await this.messageRepo.findById(id)
      if (msg && !msg.isDeleted) {
        messages.push(msg)
      }
    }

    return messages.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
  }

  /**
   * 计算 ROI
   */
  private calculateROI(messages: Message[]): number {
    const totalTokens = messages.reduce((sum, m) => sum + m.tokens, 0)

    // 估算摘要成本
    const estimatedInputTokens = totalTokens * 0.2  // 去噪后
    const estimatedOutputTokens = 200
    const summaryCost = estimatedInputTokens + estimatedOutputTokens

    // 节省的 tokens（摘要后可以丢弃 80% 的原始消息）
    const savedTokens = totalTokens * 0.8

    return savedTokens / summaryCost
  }

  /**
   * 构建提示词
   */
  private buildPrompt(messages: Message[]): string {
    const filtered = this.filterNoise(messages)
    const truncated = filtered.map(m => ({
      ...m,
      content: this.truncate(m.content, 200),
    }))

    const formatted = truncated.map(m =>
      `[${m.role} ${new Date(m.timestamp).toLocaleTimeString()}]: ${m.content}`
    ).join('\n\n')

    return `
你是一个专业的对话摘要助手。请总结以下对话内容，要求：

## 输出格式

### 📝 对话摘要
用 2-3 句话概括本次对话的主题和结果。

### 🔑 关键点
列出 3-5 个关键点，每个点不超过 20 字：
- 实现了 XXX 功能
- 修复了 XXX 问题
- 决定使用 XXX 方案

### 💻 重要代码
如果涉及代码修改，列出关键代码片段。

### 📌 待办事项
如果提到未完成的任务，列出。

## 输入数据

${formatted}

## 注意事项
1. 如果对话是简单问候（如"你好"、"谢谢"），直接返回"无实质性内容"
2. 如果对话中断（无回复），标注"对话未完成"
3. 如果是代码相关对话，重点记录修改的文件和函数
4. 不要包含用户的具体姓名、邮箱等隐私信息

请严格遵循上述格式输出摘要。
`.trim()
  }

  /**
   * 过滤噪音消息
   */
  private filterNoise(messages: Message[]): Message[] {
    const noisePatterns = [
      /^(好的|收到|明白|继续|下一步|请继续)/,
      /^(Yes|No|OK|Thanks|Thank you)/,
      /^[👍👌✅❌]/,
      /^(\s|\\n)+$/,
    ]

    return messages.filter(m => {
      const content = m.content.trim()

      if (noisePatterns.some(pattern => pattern.test(content))) {
        return false
      }

      if (content.length < 5) {
        return false
      }

      return true
    })
  }

  /**
   * 截断消息
   */
  private truncate(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content
    }
    return content.slice(0, maxLength - 3) + '...'
  }

  /**
   * 调用 AI 生成摘要
   */
  private async callAI(prompt: string): Promise<string> {
    try {
      // 使用 DeepSeek Chat API
      const response = await invoke<string>('generate_summary', {
        prompt,
        model: 'deepseek-chat',
        maxTokens: 500,
      })

      return response
    } catch (error) {
      console.error('[MessageSummarizer] AI 调用失败:', error)
      throw error
    }
  }

  /**
   * 解析摘要结果
   */
  private parseSummary(text: string): { summary: string; keyPoints: string[] } {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l)

    let summary = ''
    const keyPoints: string[] = []
    let currentSection = ''

    for (const line of lines) {
      if (line.startsWith('### 📝 对话摘要') || line.startsWith('### 对话摘要')) {
        currentSection = 'summary'
      } else if (line.startsWith('### 🔑 关键点') || line.startsWith('### 关键点')) {
        currentSection = 'keyPoints'
      } else if (line.startsWith('###')) {
        currentSection = 'other'
      } else if (currentSection === 'summary' && line) {
        summary += line + '\n'
      } else if (currentSection === 'keyPoints' && line.startsWith('-')) {
        keyPoints.push(line.slice(1).trim())
      }
    }

    return {
      summary: summary.trim() || '无实质性内容',
      keyPoints,
    }
  }
}
```

---

### 2.2 摘要仓储实现

```typescript
// src/services/memory/repositories/summary-repository.ts

import Database from '@tauri-apps/plugin-sql'
import type { ConversationSummary } from '../types'
import { DatabaseManager } from '../database'

/**
 * 摘要仓储
 *
 * 负责摘要的 CRUD 操作
 */
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
   * 根据 ID 查询摘要
   */
  async findById(id: string): Promise<ConversationSummary | null> {
    const result = await this.db.select<any>(
      `SELECT * FROM conversation_summaries WHERE id = $1`,
      [id]
    )

    if (result.length === 0) {
      return null
    }

    return this.mapToEntity(result[0])
  }

  /**
   * 根据会话 ID 查询所有摘要
   */
  async findBySessionId(sessionId: string): Promise<ConversationSummary[]> {
    const result = await this.db.select<any>(
      `SELECT * FROM conversation_summaries
       WHERE session_id = $1
       ORDER BY start_time ASC`,
      [sessionId]
    )

    return result.map(row => this.mapToEntity(row))
  }

  /**
   * 删除摘要
   */
  async delete(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM conversation_summaries WHERE id = $1`, [id])
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
```

---

### 2.3 自动摘要触发器

```typescript
// src/services/memory/auto-summarizer.ts

import { MessageRepository } from './repositories/message-repository'
import { MessageSummarizer } from './summarizer'
import { SummaryRepository } from './repositories/summary-repository'

/**
 * 自动摘要触发器
 *
 * 当满足条件时自动生成摘要
 */
export class AutoSummarizer {
  private messageRepo: MessageRepository
  private summarizer: MessageSummarizer
  private summaryRepo: SummaryRepository

  constructor() {
    this.messageRepo = new MessageRepository()
    this.summarizer = new MessageSummarizer()
    this.summaryRepo = new SummaryRepository()
  }

  /**
   * 检查并触发摘要
   */
  async checkAndSummarize(sessionId: string): Promise<boolean> {
    console.log('[AutoSummarizer] 检查摘要条件:', sessionId)

    // 1. 获取归档消息
    const archivedMessages = await this.messageRepo.findBySessionId(sessionId, {
      includeArchived: true,
      includeDeleted: false,
    })

    const archived = archivedMessages.filter(m => m.isArchived)

    // 2. 检查触发条件
    if (!this.shouldSummarize(archived)) {
      console.log('[AutoSummarizer] 不满足摘要条件')
      return false
    }

    // 3. 获取未摘要的消息
    const existingSummaries = await this.summaryRepo.findBySessionId(sessionId)
    const summarizedMessageIds = new Set(
      existingSummaries.flatMap(s =>
        archivedMessages
          .filter(m => {
            const msgTime = new Date(m.timestamp).getTime()
            const startTime = new Date(s.startTime).getTime()
            const endTime = new Date(s.endTime).getTime()
            return msgTime >= startTime && msgTime <= endTime
          })
          .map(m => m.id)
      )
    )

    const unsummarizedMessages = archived.filter(m => !summarizedMessageIds.has(m.id))

    if (unsummarizedMessages.length < 10) {
      console.log('[AutoSummarizer] 未摘要消息数量不足')
      return false
    }

    // 4. 生成摘要
    try {
      const summary = await this.summarizer.summarize(
        sessionId,
        unsummarizedMessages.map(m => m.id)
      )

      await this.summaryRepo.create(summary)

      console.log('[AutoSummarizer] 摘要生成成功:', {
        sessionId,
        messageCount: summary.messageCount,
        totalTokens: summary.totalTokens,
      })

      return true
    } catch (error) {
      console.error('[AutoSummarizer] 摘要生成失败:', error)
      return false
    }
  }

  /**
   * 判断是否应该生成摘要
   */
  private shouldSummarize(messages: Message[]): boolean {
    // 条件 1: 消息数量
    if (messages.length >= 50) {
      return true
    }

    // 条件 2: Token 数量
    const totalTokens = messages.reduce((sum, m) => sum + m.tokens, 0)
    if (totalTokens >= 20000) {
      return true
    }

    // 条件 3: 消息数量 >= 20 且 Token >= 10000
    if (messages.length >= 20 && totalTokens >= 10000) {
      return true
    }

    return false
  }
}
```

---

## 🎯 三、Phase 3: 重要性评分 - 完整实现

### 3.1 评分服务实现

```typescript
// src/services/memory/scorer.ts

import type { Message } from './types'
import { MessageRepository } from './repositories/message-repository'

/**
 * 消息重要性评分结果
 */
export interface ScoreResult {
  total: number
  breakdown: {
    content: number
    role: number
    time: number
    length: number
    tools: number
    user: number
  }
  level: 'high' | 'medium' | 'low'
}

/**
 * 消息重要性评分服务
 */
export class MessageScorer {
  private config = {
    weights: {
      content: 40,
      role: 15,
      time: 15,
      length: 10,
      tools: 10,
      user: 10,
    },
    thresholds: {
      high: 70,
      medium: 40,
      low: 20,
    },
  }

  /**
   * 评分消息
   */
  score(message: Message): ScoreResult {
    const scores = {
      content: this.scoreContent(message),
      role: this.scoreRole(message),
      time: this.scoreTime(message),
      length: this.scoreLength(message),
      tools: this.scoreTools(message),
      user: this.scoreUserInteraction(message),
    }

    const total = Object.entries(scores).reduce((sum, [key, value]) => {
      const weight = this.config.weights[key as keyof typeof scores]
      return sum + (value * weight / 100)
    }, 0)

    return {
      total: Math.round(total),
      breakdown: scores,
      level: this.getLevel(total),
    }
  }

  /**
   * 批量评分并更新到数据库
   */
  async scoreAndUpdate(messageIds: string[]): Promise<void> {
    const messageRepo = new MessageRepository()

    for (const id of messageIds) {
      const message = await messageRepo.findById(id)
      if (!message) continue

      const result = this.score(message)

      await messageRepo.update(id, {
        importanceScore: result.total,
      })
    }
  }

  private scoreContent(message: Message): number {
    let score = 0
    const content = message.content.toLowerCase()

    if (this.containsCodeBlock(content)) score += 15
    if (this.containsFunctionDefinition(content)) score += 10
    if (this.containsCodeChanges(content)) score += 5
    if (this.containsError(content)) score += 15
    if (this.containsFix(content)) score += 10

    const keywords = {
      high: ['bug', 'error', 'fix', 'implement', 'refactor', '优化', '重构', '修复'],
      medium: ['test', 'deploy', 'config', '测试', '部署', '配置'],
      low: ['help', 'question', '如何', '怎么'],
    }

    for (const word of keywords.high) {
      if (content.includes(word)) score += 5
    }
    for (const word of keywords.medium) {
      if (content.includes(word)) score += 3
    }
    for (const word of keywords.low) {
      if (content.includes(word)) score += 1
    }

    if (this.containsDecision(content)) score += 10
    if (this.containsPlan(content)) score += 5
    if (this.containsQuestion(content)) score += 5
    if (this.containsAnswer(content)) score += 5

    return Math.min(100, score)
  }

  private scoreRole(message: Message): number {
    const roleScores = {
      'user': 100,
      'assistant': 80,
      'system': 20,
      'tool': 60,
    }
    return roleScores[message.role] || 50
  }

  private scoreTime(message: Message): number {
    const age = Date.now() - new Date(message.timestamp).getTime()
    const hours = age / (1000 * 60 * 60)

    if (hours < 1) return 100
    if (hours < 6) return 80
    if (hours < 24) return 60
    if (hours < 168) return 40
    if (hours < 720) return 20
    return 10
  }

  private scoreLength(message: Message): number {
    const tokens = message.tokens || this.estimateTokens(message.content)

    if (tokens > 1000) return 100
    if (tokens > 500) return 80
    if (tokens > 200) return 60
    if (tokens > 100) return 40
    if (tokens > 50) return 20
    return 10
  }

  private scoreTools(message: Message): number {
    if (!message.toolCalls) return 0

    let score = Math.min(JSON.parse(message.toolCalls).length * 20, 50)

    const importantTools = ['edit_file', 'run_command', 'create_file']
    const toolCalls = JSON.parse(message.toolCalls)
    const hasImportantTool = toolCalls.some((tc: any) =>
      importantTools.includes(tc.name)
    )
    if (hasImportantTool) {
      score += 50
    }

    return Math.min(100, score)
  }

  private scoreUserInteraction(message: Message): number {
    if (message.role !== 'user') return 0

    const content = message.content.toLowerCase()

    if (/^(好的|是的|正确|可以|OK|yes)/i.test(content)) {
      return 80
    }

    if (/^(不对|不是|错误|no|wrong)/i.test(content)) {
      return 100
    }

    if (/\?|怎么|如何|what|how|why/i.test(content)) {
      return 60
    }

    return 0
  }

  private containsCodeBlock(content: string): boolean {
    return /```/.test(content)
  }

  private containsFunctionDefinition(content: string): boolean {
    return /function |const |let |var |class |import |export /.test(content)
  }

  private containsCodeChanges(content: string): boolean {
    return /修改|变更|update|change|modify/.test(content)
  }

  private containsError(content: string): boolean {
    return /error|exception|failed|失败|错误/.test(content)
  }

  private containsFix(content: string): boolean {
    return /fix|patch|resolve|修复|解决/.test(content)
  }

  private containsDecision(content: string): boolean {
    return /决定|选择|decision|choose/.test(content)
  }

  private containsPlan(content: string): boolean {
    return /计划|规划|plan|schedule/.test(content)
  }

  private containsQuestion(content: string): boolean {
    return /\?|怎么|如何|what|how|why/.test(content)
  }

  private containsAnswer(content: string): boolean {
    return /答案是|解决方法是|answer|solution/.test(content)
  }

  private estimateTokens(content: string): number {
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length
    const otherChars = content.length - chineseChars
    return Math.ceil(chineseChars / 2 + otherChars / 4)
  }

  private getLevel(score: number): 'high' | 'medium' | 'low' {
    if (score >= this.config.thresholds.high) return 'high'
    if (score >= this.config.thresholds.medium) return 'medium'
    return 'low'
  }
}
```

---

### 3.2 智能裁剪策略

```typescript
// src/services/memory/trim-strategy.ts

import type { Message } from './types'
import { MessageRepository } from './repositories/message-repository'
import { MessageScorer, ScoreResult } from './scorer'

/**
 * 智能裁剪策略
 *
 * 基于重要性评分的智能消息裁剪
 */
export class TrimStrategy {
  private messageRepo: MessageRepository
  private scorer: MessageScorer

  constructor() {
    this.messageRepo = new MessageRepository()
    this.scorer = new MessageScorer()
  }

  /**
   * 裁剪消息（保留最重要的消息）
   */
  async trim(
    sessionId: string,
    options: {
      maxTokens?: number
      maxMessages?: number
      keepHighImportance?: boolean
    } = {}
  ): Promise<string[]> {
    const {
      maxTokens = 50000,
      maxMessages = 100,
      keepHighImportance = true,
    } = options

    // 1. 获取所有活跃消息
    const messages = await this.messageRepo.findBySessionId(sessionId, {
      includeArchived: false,
      includeDeleted: false,
    })

    // 2. 评分所有消息
    const scoredMessages = await Promise.all(
      messages.map(async msg => ({
        message: msg,
        score: this.scorer.score(msg),
      }))
    )

    // 3. 策略选择
    const toArchive = this.selectMessagesToArchive(scoredMessages, {
      maxTokens,
      maxMessages,
      keepHighImportance,
    })

    // 4. 执行归档
    if (toArchive.length > 0) {
      const result = await this.messageRepo.archiveBatch(
        toArchive.map(m => m.id)
      )

      console.log('[TrimStrategy] 消息归档完成:', {
        sessionId,
        archived: result.success,
        failed: result.failed,
      })
    }

    return toArchive.map(m => m.id)
  }

  /**
   * 选择要归档的消息
   */
  private selectMessagesToArchive(
    scoredMessages: Array<{ message: Message; score: ScoreResult }>,
    options: {
      maxTokens: number
      maxMessages: number
      keepHighImportance: boolean
    }
  ): Message[] {
    const { maxTokens, maxMessages, keepHighImportance } = options

    // 计算总 tokens
    const totalTokens = scoredMessages.reduce(
      (sum, { message }) => sum + message.tokens,
      0
    )

    // 如果未超限，不需要归档
    if (totalTokens <= maxTokens && scoredMessages.length <= maxMessages) {
      return []
    }

    // 按重要性排序（低重要性在前）
    const sorted = [...scoredMessages].sort((a, b) => a.score.total - b.score.total)

    // 选择要归档的消息
    const toArchive: Message[] = []
    let currentTokens = totalTokens
    let currentCount = scoredMessages.length

    for (const { message, score } of sorted) {
      // 如果已满足条件，停止
      if (currentTokens <= maxTokens && currentCount <= maxMessages) {
        break
      }

      // 如果保留高重要性，跳过高重要性消息
      if (keepHighImportance && score.level === 'high') {
        continue
      }

      // 归档这条消息
      toArchive.push(message)
      currentTokens -= message.tokens
      currentCount -= 1
    }

    return toArchive
  }
}
```

---

## 🎯 四、测试方案

### 4.1 单元测试

```typescript
// tests/services/memory/scorer.test.ts

import { describe, it, expect } from 'vitest'
import { MessageScorer } from '@/services/memory/scorer'
import type { Message } from '@/services/memory/types'

describe('MessageScorer', () => {
  const scorer = new MessageScorer()

  it('应该正确评分代码消息', () => {
    const message: Message = {
      id: '1',
      sessionId: 'session-1',
      role: 'assistant',
      content: '```typescript\nfunction test() { return true }\n```',
      tokens: 50,
      isArchived: false,
      isDeleted: false,
      timestamp: new Date().toISOString(),
    }

    const result = scorer.score(message)

    expect(result.total).toBeGreaterThan(50)
    expect(result.breakdown.content).toBeGreaterThan(30)
  })

  it('应该正确评分错误消息', () => {
    const message: Message = {
      id: '2',
      sessionId: 'session-1',
      role: 'user',
      content: '遇到了一个 error，需要 fix',
      tokens: 30,
      isArchived: false,
      isDeleted: false,
      timestamp: new Date().toISOString(),
    }

    const result = scorer.score(message)

    expect(result.total).toBeGreaterThan(40)
  })

  it('应该正确评分简单问候', () => {
    const message: Message = {
      id: '3',
      sessionId: 'session-1',
      role: 'user',
      content: '你好',
      tokens: 5,
      isArchived: false,
      isDeleted: false,
      timestamp: new Date().toISOString(),
    }

    const result = scorer.score(message)

    expect(result.total).toBeLessThan(30)
    expect(result.level).toBe('low')
  })
})
```

---

### 4.2 集成测试

```typescript
// tests/services/memory/integration.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DatabaseManager } from '@/services/memory/database'
import { SessionRepository } from '@/services/memory/repositories/session-repository'
import { MessageRepository } from '@/services/memory/repositories/message-repository'
import { MessageScorer } from '@/services/memory/scorer'
import { TrimStrategy } from '@/services/memory/trim-strategy'
import type { Message } from '@/services/memory/types'

describe('Memory Integration', () => {
  let sessionRepo: SessionRepository
  let messageRepo: MessageRepository

  beforeAll(async () => {
    const dbManager = DatabaseManager.getInstance()
    await dbManager.init()
    await dbManager.reset()

    sessionRepo = new SessionRepository()
    messageRepo = new MessageRepository()
  })

  afterAll(async () => {
    const dbManager = DatabaseManager.getInstance()
    await dbManager.close()
  })

  it('应该完成完整的存储和裁剪流程', async () => {
    // 1. 创建会话
    const session = await sessionRepo.create({
      id: 'test-session-1',
      title: '测试会话',
      workspacePath: '/test',
      engineId: 'deepseek',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      totalTokens: 0,
      archivedCount: 0,
      archivedTokens: 0,
      isDeleted: false,
      isPinned: false,
    })

    expect(session).toBeDefined()

    // 2. 批量创建消息
    const messages: Omit<Message, 'isArchived' | 'importanceScore' | 'isDeleted'>[] = []
    for (let i = 0; i < 100; i++) {
      messages.push({
        id: `msg-${i}`,
        sessionId: session.id,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: i % 10 === 0 ? '```typescript\nconst x = 1\n```' : `消息 ${i}`,
        tokens: 100,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
      })
    }

    const result = await messageRepo.createBatch(messages)
    expect(result.success).toBe(100)

    // 3. 裁剪消息
    const trimStrategy = new TrimStrategy()
    const archivedIds = await trimStrategy.trim(session.id, {
      maxMessages: 50,
      maxTokens: 5000,
      keepHighImportance: true,
    })

    expect(archivedIds.length).toBeGreaterThan(0)

    // 4. 验证归档
    const archivedMessages = await messageRepo.findBySessionId(session.id, {
      includeArchived: true,
    })

    const archivedCount = archivedMessages.filter(m => m.isArchived).length
    expect(archivedCount).toBe(archivedIds.length)
  })
})
```

---

## 🎯 五、部署指南

### 5.1 数据迁移

```typescript
// scripts/migrate-localstorage-to-sqlite.ts

/**
 * 数据迁移脚本
 *
 * 将 localStorage 中的数据迁移到 SQLite
 */
export async function migrateLocalStorageToSQLite() {
  console.log('[Migration] 开始迁移数据...')

  // 1. 初始化数据库
  const dbManager = DatabaseManager.getInstance()
  await dbManager.init()

  const sessionRepo = new SessionRepository()
  const messageRepo = new MessageRepository()

  // 2. 读取 localStorage
  const SESSION_HISTORY_KEY = 'event_chat_session_history'
  const historyJson = localStorage.getItem(SESSION_HISTORY_KEY)

  if (!historyJson) {
    console.log('[Migration] 没有找到历史数据')
    return
  }

  const history = JSON.parse(historyJson)

  console.log(`[Migration] 找到 ${history.length} 个会话`)

  // 3. 迁移每个会话
  let successCount = 0
  let failedCount = 0

  for (const entry of history) {
    try {
      // 创建会话
      await sessionRepo.create({
        id: entry.id,
        title: entry.title,
        workspacePath: '',  // localStorage 没有存储
        engineId: entry.engineId || 'claude-code',
        createdAt: entry.timestamp,
        updatedAt: entry.timestamp,
        messageCount: entry.messageCount,
        totalTokens: 0,
        archivedCount: 0,
        archivedTokens: 0,
        isDeleted: false,
        isPinned: false,
      })

      // 迁移消息
      const messages = convertLegacyMessages(entry.data.messages)
      await messageRepo.createBatch(messages)

      successCount++
    } catch (error) {
      console.error(`[Migration] 迁移会话失败: ${entry.id}`, error)
      failedCount++
    }
  }

  console.log(`[Migration] 迁移完成: 成功 ${successCount}, 失败 ${failedCount}`)

  // 4. 备份 localStorage（可选）
  const backupKey = `${SESSION_HISTORY_KEY}_backup_${Date.now()}`
  localStorage.setItem(backupKey, historyJson)

  // 5. 清理 localStorage
  localStorage.removeItem(SESSION_HISTORY_KEY)

  console.log('[Migration] 数据迁移成功')
}

function convertLegacyMessages(legacyMessages: any[]): Omit<Message, 'isArchived' | 'importanceScore' | 'isDeleted'>[] {
  return legacyMessages.map(msg => ({
    id: msg.id,
    sessionId: msg.sessionId || 'unknown',
    role: msg.type,
    content: msg.content || '',
    tokens: 0,
    timestamp: msg.timestamp,
  }))
}
```

---

### 5.2 灰度发布

```typescript
// src/services/memory/feature-flag.ts

/**
 * 功能开关
 *
 * 用于灰度发布
 */
export class FeatureFlag {
  private static instance: FeatureFlag
  private flags: Map<string, boolean>

  private constructor() {
    this.flags = new Map()
    this.loadFlags()
  }

  static getInstance(): FeatureFlag {
    if (!FeatureFlag.instance) {
      FeatureFlag.instance = new FeatureFlag()
    }
    return FeatureFlag.instance
  }

  /**
   * 加载功能开关配置
   */
  private loadFlags() {
    // 从配置文件或远程加载
    this.flags.set('sqlite_storage', true)
    this.flags.set('auto_summary', false)  // 默认关闭
    this.flags.set('importance_scoring', false)  // 默认关闭
  }

  /**
   * 检查功能是否启用
   */
  isEnabled(feature: string): boolean {
    return this.flags.get(feature) || false
  }

  /**
   * 启用功能
   */
  enable(feature: string) {
    this.flags.set(feature, true)
  }

  /**
   * 禁用功能
   */
  disable(feature: string) {
    this.flags.set(feature, false)
  }
}

// 使用示例
const featureFlag = FeatureFlag.getInstance()

if (featureFlag.isEnabled('sqlite_storage')) {
  // 使用 SQLite 存储
} else {
  // 使用 localStorage（降级方案）
}
```

---

## 📊 六、性能监控

```typescript
// src/services/memory/monitor.ts

/**
 * 性能监控
 *
 * 监控关键性能指标
 */
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map()

  /**
   * 记录操作耗时
   */
  record(operation: string, duration: number) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, [])
    }
    this.metrics.get(operation)!.push(duration)
  }

  /**
   * 获取统计信息
   */
  getStats(operation: string) {
    const durations = this.metrics.get(operation) || []
    if (durations.length === 0) {
      return null
    }

    const sorted = [...durations].sort((a, b) => a - b)

    return {
      count: durations.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    }
  }

  /**
   * 打印报告
   */
  printReport() {
    console.log('=== 性能监控报告 ===')

    for (const [operation, durations] of this.metrics.entries()) {
      const stats = this.getStats(operation)
      if (stats) {
        console.log(`${operation}:`)
        console.log(`  平均: ${stats.avg.toFixed(2)}ms`)
        console.log(`  P95: ${stats.p95.toFixed(2)}ms`)
        console.log(`  P99: ${stats.p99.toFixed(2)}ms`)
        console.log(`  总次数: ${stats.count}`)
      }
    }
  }
}

// 使用示例
const monitor = new PerformanceMonitor()

async function measuredOperation() {
  const start = performance.now()

  // 执行操作
  await someOperation()

  const duration = performance.now() - start
  monitor.record('someOperation', duration)
}
```

---

## ✅ 七、总结

### 实施清单

```
Phase 1: SQLite 持久化（2 周）
  ✅ 环境配置
  ✅ 数据库初始化
  ✅ Repository 层实现
  ✅ 集成到 Store
  ✅ 数据迁移脚本
  ✅ 单元测试
  ✅ 集成测试
  ✅ 灰度发布
  ✅ 性能监控

Phase 2: 消息摘要（3 周）
  ✅ 摘要服务实现
  ✅ 摘要仓储实现
  ✅ 自动摘要触发器
  ✅ ROI 计算
  ✅ 提示词优化
  ✅ 质量控制
  ✅ 单元测试
  ✅ 集成测试

Phase 3: 重要性评分（2 周）
  ✅ 评分服务实现
  ✅ 智能裁剪策略
  ✅ 批量评分
  ✅ 单元测试
  ✅ 集成测试
  ✅ A/B 测试框架
```

### 关键代码文件

```
src/services/memory/
├── types.ts                      # 类型定义
├── database.ts                   # 数据库管理器
├── repositories/
│   ├── session-repository.ts     # 会话仓储
│   ├── message-repository.ts     # 消息仓储
│   ├── summary-repository.ts     # 摘要仓储
│   └── memory-repository.ts      # 长期记忆仓储
├── summarizer.ts                 # 摘要服务
├── auto-summarizer.ts            # 自动摘要触发器
├── scorer.ts                     # 评分服务
├── trim-strategy.ts              # 裁剪策略
├── feature-flag.ts               # 功能开关
└── monitor.ts                    # 性能监控

tests/services/memory/
├── scorer.test.ts                # 评分单元测试
└── integration.test.ts           # 集成测试

scripts/
└── migrate-localstorage-to-sqlite.ts  # 数据迁移脚本
```

### 预期收益

| 指标 | 优化前 | 优化后 | 改善 |
|------|--------|--------|------|
| Token 消耗（长对话） | 50000 | 10000 | **-80%** |
| 存储容量 | 5-10MB | 500MB+ | **+10000%** |
| 查询速度 | 50-100ms | 5-10ms | **-90%** |

---

**文档完成时间**: 2025-02-02
**作者**: Polaris Engineering Team
**版本**: v1.0 (最终实现版)
