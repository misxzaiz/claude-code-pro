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
  type: KnowledgeType
  key: string
  value: string // JSON 字符串
  workspacePath?: string
  sessionId?: string
  hitCount: number
  lastHitAt?: string
  createdAt: string
  updatedAt: string
  isDeleted?: boolean
  confidence?: number
}

/**
 * 知识类型枚举
 */
export enum KnowledgeType {
  PROJECT_CONTEXT = 'project_context',
  KEY_DECISION = 'key_decision',
  USER_PREFERENCE = 'user_preference',
  FAQ = 'faq',
  CODE_PATTERN = 'code_pattern',
}

/**
 * 提取的知识
 */
export interface ExtractedKnowledge {
  id: string
  type: KnowledgeType
  key: string
  value: any // 解析后的 JSON 对象
  sessionId: string | undefined  // 允许 undefined，因为全局知识（如用户偏好）不需要 session
  workspacePath: string
  confidence: number // 置信度 0-1
  extractedAt: string
  hitCount: number
  lastHitAt: string | null
}

/**
 * 记忆搜索结果
 */
export interface MemorySearchResult {
  memories: LongTermMemory[]
  query: string
  totalHits: number
}

/**
 * 提醒结果
 */
export interface ReminderResult {
  shouldRemind: boolean
  reminder?: string
  memoryId?: string
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

// ============================================================================
// Phase 2: 压缩配置
// ============================================================================

/**
 * 压缩配置
 */
export interface CompressionConfig {
  // 触发条件
  maxTokens: number
  maxMessageCount: number
  maxAgeHours: number

  // 压缩目标
  targetTokenRatio: number
  minSummaryLength: number
  maxSummaryLength: number

  // 摘要策略
  extractKeyPoints: boolean
  maxKeyPoints: number
  preserveTools: boolean
  preserveErrors: boolean

  // AI 配置
  summaryModel: 'claude-code' | 'iflow' | 'deepseek'
  summaryPrompt?: string
  summaryTemperature: number

  // 执行时机
  compressOnSave: boolean
  compressOnLoad: boolean
  compressInBackground: boolean
}

/**
 * 默认压缩配置
 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  maxTokens: 10000,
  maxMessageCount: 100,
  maxAgeHours: 168, // 7 天

  targetTokenRatio: 0.3,
  minSummaryLength: 100,
  maxSummaryLength: 500,

  extractKeyPoints: true,
  maxKeyPoints: 5,
  preserveTools: true,
  preserveErrors: true,

  summaryModel: 'deepseek',
  summaryTemperature: 0.3,

  compressOnSave: true,
  compressOnLoad: false,
  compressInBackground: true,
}

/**
 * 压缩结果
 */
export interface CompressionResult {
  success: boolean
  summaryId?: string
  archivedCount: number
  archivedTokens: number
  beforeTokens: number
  afterTokens: number
  compressionRatio: number
  duration: number
  costTokens: number
  error?: string
}
