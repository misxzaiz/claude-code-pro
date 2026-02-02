/**
 * 长期记忆模块导出
 *
 * @author Polaris Team
 * @since 2026-02-03
 */

// 知识提取器
export { KnowledgeExtractor } from './knowledge-extractor'

// 数据访问层
export { LongTermMemoryRepository } from './repository'

// 业务逻辑层
export {
  LongTermMemoryService,
  getLongTermMemoryService,
  resetLongTermMemoryService,
} from './long-term-memory-service'

// 记忆检索
export {
  MemoryRetrieval,
  getMemoryRetrieval,
  resetMemoryRetrieval,
} from './memory-retrieval'
