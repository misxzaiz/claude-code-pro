/**
 * 压缩服务
 * 对外提供简单的压缩接口
 *
 * @author Polaris Team
 * @since 2026-02-02
 */

import type { ChatMessage } from '@/types'
import type { CompressionConfig, CompressionResult } from '../types'
import { CompressionScheduler } from './scheduler'
import { MessageRepository } from '../repositories/message-repository'
import { dbMsgToChatMessage } from '../utils/chat-message-adapter'

/**
 * 压缩服务
 */
export class CompressorService {
  private scheduler: CompressionScheduler
  private config: CompressionConfig

  constructor(config: CompressionConfig) {
    this.config = config
    this.scheduler = new CompressionScheduler(config)
    console.log('[CompressorService] 服务已创建', {
      maxTokens: config.maxTokens,
      maxMessageCount: config.maxMessageCount,
      maxAgeHours: config.maxAgeHours,
    })
  }

  /**
   * 检查是否需要压缩
   */
  shouldCompress(sessionId: string, messages: ChatMessage[]): boolean {
    return this.scheduler.shouldCompress(sessionId, messages)
  }

  /**
   * 执行压缩（返回压缩后的消息列表）
   */
  async compress(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<{
    result: CompressionResult
    compressedMessages: ChatMessage[]
  }> {
    console.log('[CompressorService] 开始压缩会话...', {
      sessionId,
      messageCount: messages.length,
    })

    const result = await this.scheduler.compress(sessionId, messages)

    if (!result.success) {
      console.warn('[CompressorService] 压缩失败，返回原始消息')
      return { result, compressedMessages: messages }
    }

    // 加载压缩后的消息（只包含未归档的）
    try {
      const messageRepo = new MessageRepository()
      // 使用 findBySessionId 并过滤 isArchived = false
      const allDbMessages = await messageRepo.findBySessionId(sessionId)
      const dbMessages = allDbMessages.filter(msg => !msg.isArchived)

      // 转换为 ChatMessage
      const compressedMessages = dbMessages.map(dbMsgToChatMessage)

      console.log('[CompressorService] 压缩成功，已加载活跃消息', {
        beforeCount: messages.length,
        afterCount: compressedMessages.length,
        archivedCount: result.archivedCount,
      })

      return { result, compressedMessages }
    } catch (error) {
      console.error('[CompressorService] 加载压缩后消息失败:', error)
      // 失败时返回原始消息
      return { result, compressedMessages: messages }
    }
  }

  /**
   * 后台异步压缩
   */
  async compressInBackground(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<void> {
    if (!this.config.compressInBackground) {
      return
    }

    setTimeout(async () => {
      if (this.shouldCompress(sessionId, messages)) {
        console.log('[CompressorService] 后台压缩触发')
        await this.compress(sessionId, messages)
      }
    }, 1000)
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<CompressionConfig>) {
    this.config = { ...this.config, ...config }
    this.scheduler = new CompressionScheduler(this.config)
    console.log('[CompressorService] 配置已更新', config)
  }

  /**
   * 获取当前配置
   */
  getConfig(): CompressionConfig {
    return { ...this.config }
  }
}

// 单例
let compressorInstance: CompressorService | null = null

/**
 * 获取压缩服务实例
 */
export function getCompressorService(config?: CompressionConfig): CompressorService {
  if (!compressorInstance) {
    // 如果没有提供配置，从 compressionStore 读取
    if (!config) {
      try {
        // 动态导入避免循环依赖
        const { useCompressionStore } = require('@/stores/compressionStore')
        config = useCompressionStore.getState().compressionConfig
      } catch (error) {
        console.warn('[CompressorService] 无法从 compressionStore 读取配置，使用默认配置')
        const { DEFAULT_COMPRESSION_CONFIG } = require('../types')
        config = DEFAULT_COMPRESSION_CONFIG
      }
    }

    compressorInstance = new CompressorService(config!)
  }
  return compressorInstance
}

/**
 * 重置压缩服务实例
 */
export function resetCompressorService() {
  compressorInstance = null
  console.log('[CompressorService] 服务实例已重置')
}
