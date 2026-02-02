/**
 * 压缩策略基类
 *
 * @author Polaris Team
 * @since 2026-02-02
 */

import type { ChatMessage } from '@/types'
import type { CompressionConfig, CompressionResult } from '../types'
import { MessageSummarizer } from '../summarizer/message-summarizer'
import { MessageRepository } from '../repositories/message-repository'
import { SessionRepository } from '../repositories/session-repository'
import { estimateTotalTokens } from '../utils/token-estimator'

/**
 * 压缩策略基类
 */
export abstract class CompressionStrategy {
  protected summarizer: MessageSummarizer
  protected messageRepo: MessageRepository
  protected sessionRepo: SessionRepository
  protected config: CompressionConfig

  constructor(config: CompressionConfig) {
    this.summarizer = new MessageSummarizer(config)
    this.messageRepo = new MessageRepository()
    this.sessionRepo = new SessionRepository()
    this.config = config
  }

  /**
   * 执行压缩（子类实现）
   */
  abstract compress(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<CompressionResult>

  /**
   * 通用的压缩执行逻辑
   */
  protected async executeCompression(
    sessionId: string,
    messagesToCompress: ChatMessage[],
    allMessages: ChatMessage[]
  ): Promise<CompressionResult> {
    const startTime = Date.now()

    try {
      console.log('[CompressionStrategy] 开始压缩...', {
        sessionId,
        compressCount: messagesToCompress.length,
        totalCount: allMessages.length,
      })

      // 1. 生成摘要
      const summary = await this.summarizer.summarize(
        sessionId,
        messagesToCompress
      )

      // 2. 归档消息
      const messageIds = messagesToCompress.map(m => m.id)
      await this.messageRepo.archiveBatch(messageIds)

      // 3. 更新会话统计
      const session = await this.sessionRepo.findById(sessionId)
      if (session) {
        await this.sessionRepo.update(sessionId, {
          archivedCount: session.archivedCount + messagesToCompress.length,
          archivedTokens: session.archivedTokens + summary.totalTokens,
        })
      }

      // 4. 计算压缩结果
      const beforeTokens = estimateTotalTokens(allMessages)
      const afterTokens =
        estimateTotalTokens(
          allMessages.filter(m => !messageIds.includes(m.id))
        ) + summary.summary.length * 1.5 // 摘要的 token

      const duration = Date.now() - startTime

      const result: CompressionResult = {
        success: true,
        summaryId: summary.id,
        archivedCount: messagesToCompress.length,
        archivedTokens: summary.totalTokens,
        beforeTokens,
        afterTokens,
        compressionRatio: afterTokens / beforeTokens,
        duration,
        costTokens: summary.costTokens || 0,
      }

      console.log('[CompressionStrategy] 压缩完成', {
        archivedCount: result.archivedCount,
        compressionRatio: `${(result.compressionRatio * 100).toFixed(1)}%`,
        duration: `${duration}ms`,
        savedTokens: beforeTokens - afterTokens,
      })

      return result
    } catch (error) {
      console.error('[CompressionStrategy] 压缩失败:', error)

      return {
        success: false,
        archivedCount: 0,
        archivedTokens: 0,
        beforeTokens: estimateTotalTokens(allMessages),
        afterTokens: estimateTotalTokens(allMessages),
        compressionRatio: 1.0,
        duration: Date.now() - startTime,
        costTokens: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
