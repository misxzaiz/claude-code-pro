/**
 * 数据库管理器
 *
 * 单例模式，全局只有一个数据库连接
 * 负责数据库的初始化、表结构创建、索引优化等
 */

import Database from '@tauri-apps/plugin-sql'

/**
 * 数据库管理器（单例模式）
 */
export class DatabaseManager {
  private static instance: DatabaseManager | null = null
  private db: Database | null = null
  private readonly dbPath = 'sqlite:polaris_memory.db'
  private isInitialized = false

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
    if (this.isInitialized) {
      console.warn('[DatabaseManager] 数据库已初始化，跳过')
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

      this.isInitialized = true
      console.log('[DatabaseManager] ✅ 数据库初始化成功')
    } catch (error) {
      console.error('[DatabaseManager] ❌ 数据库初始化失败:', error)
      throw error
    }
  }

  /**
   * 创建表结构
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化')

    console.log('[DatabaseManager] 正在创建表结构...')

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

    console.log('[DatabaseManager] ✅ 表结构创建完成')
  }

  /**
   * 创建索引
   */
  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化')

    console.log('[DatabaseManager] 正在创建索引...')

    // 会话表索引
    const sessionIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_path)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_engine ON sessions(engine_id)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_deleted ON sessions(is_deleted)',
    ]

    // 消息表索引
    const messageIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC)',
      'CREATE INDEX IF NOT EXISTS idx_messages_archived ON messages(is_archived)',
      'CREATE INDEX IF NOT EXISTS idx_messages_importance ON messages(importance_score DESC)',
      'CREATE INDEX IF NOT EXISTS idx_messages_deleted ON messages(is_deleted)',
      // 复合索引（关键性能优化）
      'CREATE INDEX IF NOT EXISTS idx_messages_session_archived ON messages(session_id, is_archived)',
      'CREATE INDEX IF NOT EXISTS idx_messages_session_timestamp ON messages(session_id, timestamp DESC)',
    ]

    // 摘要表索引
    const summaryIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_summaries_session ON conversation_summaries(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_summaries_created ON conversation_summaries(created_at DESC)',
    ]

    // 长期记忆索引
    const memoryIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_memories_type ON long_term_memories(type)',
      'CREATE INDEX IF NOT EXISTS idx_memories_workspace ON long_term_memories(workspace_path)',
      'CREATE INDEX IF NOT EXISTS idx_memories_key ON long_term_memories(key)',
      'CREATE INDEX IF NOT EXISTS idx_memories_hit_count ON long_term_memories(hit_count DESC)',
    ]

    // 批量创建索引
    for (const sql of [...sessionIndexes, ...messageIndexes, ...summaryIndexes, ...memoryIndexes]) {
      await this.db.execute(sql)
    }

    console.log('[DatabaseManager] ✅ 索引创建完成')
  }

  /**
   * 创建视图
   */
  private async createViews(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化')

    console.log('[DatabaseManager] 正在创建视图...')

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

    console.log('[DatabaseManager] ✅ 视图创建完成')
  }

  /**
   * 创建触发器
   */
  private async createTriggers(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化')

    console.log('[DatabaseManager] 正在创建触发器...')

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

    console.log('[DatabaseManager] ✅ 触发器创建完成')
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
   * 检查数据库是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized && this.db !== null
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close()
      this.db = null
      this.isInitialized = false
      console.log('[DatabaseManager] 数据库连接已关闭')
    }
  }

  /**
   * 重置数据库（危险操作，仅用于测试）
   */
  async reset(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化')

    console.warn('[DatabaseManager] ⚠️  正在重置数据库...')

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

    console.log('[DatabaseManager] ✅ 数据库重置完成')
  }

  /**
   * 获取数据库统计信息
   */
  async getStats(): Promise<{
    sessionCount: number
    messageCount: number
    summaryCount: number
    memoryCount: number
    dbSize: number
  }> {
    if (!this.db) throw new Error('数据库未初始化')

    type CountResult = { count: number }

    const [sessionResult, messageResult, summaryResult, memoryResult] = await Promise.all([
      this.db.select<CountResult>('SELECT COUNT(*) as count FROM sessions WHERE is_deleted = 0'),
      this.db.select<CountResult>('SELECT COUNT(*) as count FROM messages WHERE is_deleted = 0'),
      this.db.select<CountResult>('SELECT COUNT(*) as count FROM conversation_summaries'),
      this.db.select<CountResult>('SELECT COUNT(*) as count FROM long_term_memories'),
    ])

    return {
      sessionCount: sessionResult?.count || 0,
      messageCount: messageResult?.count || 0,
      summaryCount: summaryResult?.count || 0,
      memoryCount: memoryResult?.count || 0,
      dbSize: 0, // TODO: 实现文件大小计算
    }
  }
}
