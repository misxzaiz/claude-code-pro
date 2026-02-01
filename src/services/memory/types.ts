/**
 * 上下文记忆服务 - 类型定义
 *
 * 定义所有实体类型和接口
 */

// ============================================================================
// 实体类型
// ============================================================================

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
  metadata?: string // JSON 字符串
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
  importanceScore: number // 0-100
  isDeleted: boolean
  timestamp: string
  toolCalls?: string // JSON 字符串
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
  keyPoints: string[] // JSON 数组
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
  value: string // JSON 字符串
  workspacePath?: string
  sessionId?: string
  hitCount: number
  lastHitAt?: string
  createdAt: string
  updatedAt: string
}

// ============================================================================
// 查询和操作类型
// ============================================================================

/**
 * 查询选项
 */
export interface QueryOptions {
  limit?: number
  offset?: number
  includeArchived?: boolean
  includeDeleted?: boolean
  orderBy?: 'timestamp' | 'importance' | 'created_at'
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

/**
 * 摘要生成选项
 */
export interface SummarizeOptions {
  force?: boolean // 强制生成，忽略 ROI 检查
  maxMessages?: number // 最大消息数量
}

/**
 * 裁剪选项
 */
export interface TrimOptions {
  maxTokens?: number
  maxMessages?: number
  keepHighImportance?: boolean
}

// ============================================================================
// 统计类型
// ============================================================================

/**
 * 会话统计信息
 */
export interface SessionStats {
  sessionId: string
  messageCount: number
  totalTokens: number
  archivedCount: number
  archivedTokens: number
  activeMessageCount: number
  lastMessageAt?: string
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  operation: string
  duration: number
  success: boolean
  error?: string
}

// ============================================================================
// 配置类型
// ============================================================================

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  path: string // 数据库文件路径
  enableWAL?: boolean // 是否启用 WAL 模式
  cacheSize?: number // 缓存大小（页）
}

/**
 * 记忆服务配置
 */
export interface MemoryConfig {
  database: DatabaseConfig
  autoSummarize: boolean
  summarizeThreshold: {
    messageCount: number
    tokenCount: number
  }
  autoTrim: boolean
  trimThreshold: {
    maxTokens: number
    maxMessages: number
  }
}
