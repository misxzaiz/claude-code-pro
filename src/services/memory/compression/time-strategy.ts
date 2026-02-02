/**
 * 时间压缩策略
 * 压缩超过指定时间的旧消息
 *
 * @author Polaris Team
 * @since 2026-02-02
 */

import { CompressionStrategy } from './strategy'
import type { ChatMessage } from '@/types'
import type { CompressionResult } from '../types'

/**
 * 时间压缩策略
 */
export class TimeCompressionStrategy extends CompressionStrategy {
  async compress(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<CompressionResult> {
    const now = Date.now()
    const maxAge = this.config.maxAgeHours * 60 * 60 * 1000

    // 找出需要压缩的旧消息
    const messagesToCompress = messages.filter(msg => {
      const msgAge = now - new Date(msg.timestamp).getTime()
      return msgAge > maxAge
    })

    if (messagesToCompress.length === 0) {
      console.log('[TimeCompressionStrategy] 没有需要压缩的消息')
      return {
        success: true,
        archivedCount: 0,
        archivedTokens: 0,
        beforeTokens: 0,
        afterTokens: 0,
        compressionRatio: 1.0,
        duration: 0,
        costTokens: 0,
      }
    }

    console.log('[TimeCompressionStrategy] 找到需要压缩的消息', {
      count: messagesToCompress.length,
      maxAgeHours: this.config.maxAgeHours,
    })

    return this.executeCompression(sessionId, messagesToCompress, messages)
  }
}
