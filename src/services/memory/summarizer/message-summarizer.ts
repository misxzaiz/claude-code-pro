/**
 * 消息摘要器
 * 使用 AI 生成对话摘要
 *
 * @author Polaris Team
 * @since 2026-02-02
 */

import type { ChatMessage } from '@/types'
import type { ConversationSummary, CompressionConfig } from '../types'
import { SummaryRepository } from '../repositories/summary-repository'
import { detectLanguage } from '../utils/chat-message-adapter'
import { estimateTotalTokens, estimateTextTokens } from '../utils/token-estimator'
import { callAI } from '../utils/ai-caller'
import { generateSummaryPrompt } from './prompts'

/**
 * 消息摘要器
 */
export class MessageSummarizer {
  private summaryRepo: SummaryRepository
  private config: CompressionConfig

  constructor(config: CompressionConfig) {
    this.summaryRepo = new SummaryRepository()
    this.config = config
  }

  /**
   * 生成摘要（核心方法）
   */
  async summarize(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<ConversationSummary> {
    console.log('[MessageSummarizer] 开始生成摘要...', {
      sessionId,
      messageCount: messages.length,
    })

    // 1. 检测语言
    const language = detectLanguage(messages)
    console.log('[MessageSummarizer] 检测到语言:', language)

    // 2. 生成提示词
    const prompt = generateSummaryPrompt(messages, this.config, language)
    console.log('[MessageSummarizer] 提示词已生成', {
      promptLength: prompt.length,
    })

    // 3. 调用 AI 生成摘要
    const startTime = Date.now()
    const aiResponse = await this.callAIForSummary(prompt, language)
    const duration = Date.now() - startTime

    console.log('[MessageSummarizer] AI 摘要生成完成', {
      duration: `${duration}ms`,
      model: this.config.summaryModel,
      language,
      responseLength: aiResponse.length,
    })

    // 4. 解析 AI 响应
    const { summary, keyPoints } = this.parseAIResponse(aiResponse)

    // 5. 创建摘要对象
    const summaryEntity: ConversationSummary = {
      id: crypto.randomUUID(),
      sessionId,
      startTime: messages[0].timestamp,
      endTime: messages[messages.length - 1].timestamp,
      messageCount: messages.length,
      totalTokens: estimateTotalTokens(messages),
      summary,
      keyPoints,
      createdAt: new Date().toISOString(),
      modelUsed: this.config.summaryModel,
      costTokens: estimateTextTokens(prompt) + estimateTextTokens(aiResponse),
    }

    // 6. 保存到数据库
    await this.summaryRepo.create(summaryEntity)

    console.log('[MessageSummarizer] 摘要已保存到数据库', {
      summaryId: summaryEntity.id,
      summaryLength: summary.length,
      keyPointsCount: keyPoints.length,
      costTokens: summaryEntity.costTokens,
    })

    return summaryEntity
  }

  /**
   * 调用 AI 生成摘要
   */
  private async callAIForSummary(
    prompt: string,
    _language: 'zh' | 'en'  // 未使用，保留参数以备将来扩展
  ): Promise<string> {
    try {
      const response = await callAI({
        engineId: this.config.summaryModel as any,
        prompt,
        temperature: this.config.summaryTemperature,
      })

      return response
    } catch (error) {
      console.error('[MessageSummarizer] AI 调用失败:', error)
      throw new Error(`摘要生成失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 解析 AI 响应
   */
  private parseAIResponse(response: string): {
    summary: string
    keyPoints: string[]
  } {
    try {
      // 尝试解析 JSON
      const parsed = JSON.parse(response)

      // 验证格式
      if (!parsed.summary || !Array.isArray(parsed.keyPoints)) {
        throw new Error('AI 响应格式不正确')
      }

      return {
        summary: parsed.summary,
        keyPoints: parsed.keyPoints,
      }
    } catch (error) {
      console.error('[MessageSummarizer] JSON 解析失败:', error)

      // 降级：使用简单的文本处理
      return this.fallbackParse(response)
    }
  }

  /**
   * 降级解析（当 JSON 解析失败时）
   */
  private fallbackParse(response: string): {
    summary: string
    keyPoints: string[]
  } {
    console.warn('[MessageSummarizer] 使用降级解析策略')

    // 将整个响应作为摘要（限制长度）
    const summary = response.substring(0, this.config.maxSummaryLength)

    // 提取关键点（简单按行分割）
    const keyPoints = response
      .split('\n')
      .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
      .map(line => line.replace(/^[-•]\s*/, '').trim())
      .slice(0, this.config.maxKeyPoints)

    return {
      summary,
      keyPoints: keyPoints.length > 0 ? keyPoints : ['无法提取关键点'],
    }
  }
}
