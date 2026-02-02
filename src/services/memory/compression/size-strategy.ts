/**
 * 大小压缩策略
 * 当总 token 数超过阈值时，压缩最早的消息
 *
 * @author Polaris Team
 * @since 2026-02-02
 */

import { CompressionStrategy } from './strategy'
import type { ChatMessage } from '@/types'
import type { CompressionResult } from '../types'
import { estimateMessageTokens } from '../utils/token-estimator'

/**
 * 大小压缩策略
 */
export class SizeCompressionStrategy extends CompressionStrategy {
  async compress(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<CompressionResult> {
    // 计算总 token 数
    const totalTokens = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)

    if (totalTokens < this.config.maxTokens) {
      console.log('[SizeCompressionStrategy] Token 数量未超过阈值', {
        totalTokens,
        maxTokens: this.config.maxTokens,
      })
      return {
        success: true,
        archivedCount: 0,
        archivedTokens: 0,
        beforeTokens: totalTokens,
        afterTokens: totalTokens,
        compressionRatio: 1.0,
        duration: 0,
        costTokens: 0,
      }
    }

    // 计算需要压缩的 token 数量
    const targetTokens = totalTokens * this.config.targetTokenRatio
    const tokensToCompress = totalTokens - targetTokens

    console.log('[SizeCompressionStrategy] Token 数量超过阈值', {
      totalTokens,
      maxTokens: this.config.maxTokens,
      tokensToCompress,
      targetTokens,
    })

    // 从最早的消息开始，累积到需要压缩的 token 数
    let accumulatedTokens = 0
    const messagesToCompress: ChatMessage[] = []

    for (const msg of messages) {
      const msgTokens = estimateMessageTokens(msg)

      if (accumulatedTokens >= tokensToCompress) {
        break
      }

      messagesToCompress.push(msg)
      accumulatedTokens += msgTokens
    }

    console.log('[SizeCompressionStrategy] 选择压缩的消息', {
      count: messagesToCompress.length,
      accumulatedTokens,
    })

    return this.executeCompression(sessionId, messagesToCompress, messages)
  }
}
