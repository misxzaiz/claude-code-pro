/**
 * 压缩调度器
 * 决定何时以及如何压缩
 *
 * @author Polaris Team
 * @since 2026-02-02
 */

import type { ChatMessage } from '@/types'
import type { CompressionConfig, CompressionResult } from '../types'
import { TimeCompressionStrategy } from './time-strategy'
import { SizeCompressionStrategy } from './size-strategy'
import { ImportanceCompressionStrategy } from './importance-strategy'
import { estimateMessageTokens } from '../utils/token-estimator'

/**
 * 压缩调度器
 */
export class CompressionScheduler {
  private config: CompressionConfig
  private timeStrategy: TimeCompressionStrategy
  private sizeStrategy: SizeCompressionStrategy
  private importanceStrategy: ImportanceCompressionStrategy

  constructor(config: CompressionConfig) {
    this.config = config
    this.timeStrategy = new TimeCompressionStrategy(config)
    this.sizeStrategy = new SizeCompressionStrategy(config)
    this.importanceStrategy = new ImportanceCompressionStrategy(config)
  }

  /**
   * 检查是否需要压缩
   */
  shouldCompress(_sessionId: string, messages: ChatMessage[]): boolean {  // sessionId 未使用
    const totalTokens = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
    const messageCount = messages.length
    const oldestMessage = messages[0]
    const ageHours =
      (Date.now() - new Date(oldestMessage.timestamp).getTime()) /
      (1000 * 60 * 60)

    // 检查触发条件
    if (totalTokens >= this.config.maxTokens) {
      console.log('[CompressionScheduler] Token 数量超过阈值', {
        totalTokens,
        maxTokens: this.config.maxTokens,
      })
      return true
    }

    if (messageCount >= this.config.maxMessageCount) {
      console.log('[CompressionScheduler] 消息数量超过阈值', {
        messageCount,
        maxMessageCount: this.config.maxMessageCount,
      })
      return true
    }

    if (ageHours >= this.config.maxAgeHours) {
      console.log('[CompressionScheduler] 消息年龄超过阈值', {
        ageHours: ageHours.toFixed(1),
        maxAgeHours: this.config.maxAgeHours,
      })
      return true
    }

    return false
  }

  /**
   * 执行压缩（自动选择最佳策略）
   */
  async compress(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<CompressionResult> {
    console.log('[CompressionScheduler] 开始执行压缩...', {
      sessionId,
      messageCount: messages.length,
    })

    // 策略选择逻辑
    let result: CompressionResult

    const totalTokens = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
    const ageHours =
      (Date.now() - new Date(messages[0].timestamp).getTime()) /
      (1000 * 60 * 60)

    // 决策树
    if (ageHours >= this.config.maxAgeHours) {
      // 优先使用时间策略（旧消息）
      console.log('[CompressionScheduler] 使用时间压缩策略')
      result = await this.timeStrategy.compress(sessionId, messages)
    } else if (totalTokens >= this.config.maxTokens) {
      // 其次使用大小策略（超大对话）
      console.log('[CompressionScheduler] 使用大小压缩策略')
      result = await this.sizeStrategy.compress(sessionId, messages)
    } else {
      // 最后使用重要性策略（需要评分系统）
      console.log('[CompressionScheduler] 使用重要性压缩策略')
      result = await this.importanceStrategy.compress(sessionId, messages)
    }

    // 记录压缩统计
    if (result.success) {
      console.log('[CompressionScheduler] 压缩成功', {
        summaryId: result.summaryId,
        archivedCount: result.archivedCount,
        compressionRatio: `${(result.compressionRatio * 100).toFixed(1)}%`,
        duration: `${result.duration}ms`,
        costTokens: result.costTokens,
        savedTokens: result.beforeTokens - result.afterTokens,
      })
    } else {
      console.error('[CompressionScheduler] 压缩失败', {
        error: result.error,
      })
    }

    return result
  }
}
