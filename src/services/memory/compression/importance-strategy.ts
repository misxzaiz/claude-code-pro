/**
 * 重要性压缩策略
 * 保留高重要性消息，压缩低重要性消息
 *
 * @author Polaris Team
 * @since 2026-02-02
 */

import { CompressionStrategy } from './strategy'
import type { ChatMessage } from '@/types'
import type { CompressionResult, CompressionConfig } from '../types'
import { MessageRepository } from '../repositories/message-repository'
import { estimateMessageTokens } from '../utils/token-estimator'

/**
 * 重要性压缩策略
 */
export class ImportanceCompressionStrategy extends CompressionStrategy {
  protected messageRepo: MessageRepository  // 改为 protected

  constructor(config: CompressionConfig) {
    super(config)
    this.messageRepo = new MessageRepository()
  }

  async compress(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<CompressionResult> {
    // 1. 获取消息的重要性评分
    const messageScores = await this.getMessageScores(sessionId, messages)

    // 2. 按重要性排序（低分在前）
    const sortedMessages = messages
      .map(msg => ({
        msg,
        score: messageScores.get(msg.id) || 50,
      }))
      .sort((a, b) => a.score - b.score)

    // 3. 计算需要压缩的数量
    const totalTokens = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
    const targetTokens = totalTokens * this.config.targetTokenRatio
    let accumulatedTokens = 0
    const messagesToCompress: ChatMessage[] = []

    for (const { msg, score } of sortedMessages) {
      if (accumulatedTokens >= totalTokens - targetTokens) {
        break
      }

      // 跳过高重要性消息（评分 > 70）
      if (score > 70) {
        continue
      }

      messagesToCompress.push(msg)
      accumulatedTokens += estimateMessageTokens(msg)
    }

    console.log('[ImportanceCompressionStrategy] 选择压缩的消息', {
      count: messagesToCompress.length,
      avgScore: Array.from(messageScores.values()).reduce((a, b) => a + b, 0) / messageScores.size,
      highScoreCount: Array.from(messageScores.values()).filter(s => s > 70).length,
    })

    return this.executeCompression(sessionId, messagesToCompress, messages)
  }

  /**
   * 获取消息重要性评分
   */
  protected async getMessageScores(  // 改为 protected，方便测试
    _sessionId: string,  // 添加下划线表示未使用
    messages: ChatMessage[]
  ): Promise<Map<string, number>> {
    const scores = new Map<string, number>()

    for (const msg of messages) {
      try {
        const dbMsg = await this.messageRepo.findById(msg.id)
        if (dbMsg) {
          scores.set(msg.id, dbMsg.importanceScore)
        } else {
          // 如果数据库中没有，给一个默认评分
          scores.set(msg.id, 50)
        }
      } catch (error) {
        console.warn(`[ImportanceStrategy] 无法获取消息 ${msg.id} 的评分:`, error)
        scores.set(msg.id, 50)
      }
    }

    return scores
  }
}
