/**
 * 上下文记忆服务 - 统一导出
 */

// 类型定义
export * from './types'

// 数据库管理
export { DatabaseManager } from './database'

// 仓储
export { SessionRepository } from './repositories/session-repository'
export { MessageRepository } from './repositories/message-repository'
export { SummaryRepository } from './repositories/summary-repository'

// 集成函数
export { initializeMemoryService, saveSessionToDatabase, loadSessionFromDatabase, getAllSessions, deleteSession } from './integration'

// 测试函数
export { testDatabase } from './test'

// Phase 2: 压缩服务
export { getCompressorService, resetCompressorService } from './compression/compressor-service'
export { CompressionScheduler } from './compression/scheduler'
export { TimeCompressionStrategy } from './compression/time-strategy'
export { SizeCompressionStrategy } from './compression/size-strategy'
export { ImportanceCompressionStrategy } from './compression/importance-strategy'

// Phase 2: 摘要服务
export { MessageSummarizer } from './summarizer/message-summarizer'
export { generateSummaryPrompt } from './summarizer/prompts'

// Phase 2: 工具函数
export * from './utils'

// Phase 3: 评分服务
export * from './scorer'

// Phase 3: 长期记忆服务
export * from './long-term-memory'
