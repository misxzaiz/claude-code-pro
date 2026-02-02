/**
 * 记忆检索服务
 * 负责搜索和主动提醒
 *
 * @author Polaris Team
 * @since 2026-02-03
 */

import type { ChatMessage } from '@/types'
import type { LongTermMemory, ReminderResult, MemorySearchResult } from '../types'
import { getLongTermMemoryService } from './long-term-memory-service'
import { KeywordAnalyzer } from '../scorer'

/**
 * 记忆检索服务
 */
export class MemoryRetrieval {
  private memoryService = getLongTermMemoryService()
  private keywordAnalyzer: KeywordAnalyzer

  constructor() {
    this.keywordAnalyzer = new KeywordAnalyzer()
  }

  /**
   * 语义搜索（简化版 - 关键词匹配）
   */
  async semanticSearch(
    query: string,
    workspacePath?: string,
    limit: number = 10
  ): Promise<MemorySearchResult> {
    console.log('[MemoryRetrieval] 语义搜索:', { query, workspacePath, limit })

    const memories = await this.memoryService.findRelevantMemories(
      query,
      workspacePath,
      limit
    )

    // 计算相关性并排序
    const rankedMemories = this.rankMemories(memories, query)

    console.log(`[MemoryRetrieval] 找到 ${rankedMemories.length} 个相关记忆`)

    return {
      memories: rankedMemories,
      query,
      totalHits: rankedMemories.length,
    }
  }

  /**
   * 获取相关记忆（用于上下文增强）
   */
  async getRelatedMemories(
    currentMessage: ChatMessage,
    workspacePath?: string,
    limit: number = 5
  ): Promise<LongTermMemory[]> {
    // 提取当前消息的关键词
    const keywords = this.extractKeywords(currentMessage)

    if (keywords.length === 0) {
      return []
    }

    // 搜索相关记忆
    const { memories } = await this.semanticSearch(
      keywords.join(' '),
      workspacePath,
      limit
    )

    // 更新命中次数
    for (const memory of memories) {
      await this.memoryService.recordMemoryHit(memory.id)
    }

    return memories
  }

  /**
   * 检查是否应该主动提醒
   */
  async shouldRemind(
    userInput: ChatMessage,
    workspacePath?: string
  ): Promise<ReminderResult> {
    console.log('[MemoryRetrieval] 检查是否应该提醒...')

    // 获取相关记忆
    const memories = await this.getRelatedMemories(userInput, workspacePath, 3)

    if (memories.length === 0) {
      return { shouldRemind: false }
    }

    // 检查最相关的记忆
    const topMemory = memories[0]

    // 判断条件：命中次数 > 5 且最近命中 < 30 天
    const isRecentHit = topMemory.lastHitAt
    const daysSinceHit = isRecentHit
      ? (Date.now() - new Date(isRecentHit).getTime()) / (1000 * 60 * 60 * 24)
      : 999

    // 高命中率且最近使用过
    if (topMemory.hitCount >= 5 && daysSinceHit < 30) {
      const reminder = this.generateReminder(topMemory)

      console.log('[MemoryRetrieval] 应该提醒', {
        memoryId: topMemory.id,
        hitCount: topMemory.hitCount,
        daysSinceHit,
      })

      return {
        shouldRemind: true,
        reminder,
        memoryId: topMemory.id,
      }
    }

    // 热门记忆（命中次数 >= 10）
    if (topMemory.hitCount >= 10) {
      const reminder = this.generateReminder(topMemory)

      console.log('[MemoryRetrieval] 热门记忆提醒', {
        memoryId: topMemory.id,
        hitCount: topMemory.hitCount,
      })

      return {
        shouldRemind: true,
        reminder,
        memoryId: topMemory.id,
      }
    }

    return { shouldRemind: false }
  }

  /**
   * 获取记忆摘要（用于上下文增强）
   */
  async getMemorySummary(
    workspacePath?: string,
    limit: number = 10
  ): Promise<{
    totalMemories: number
    recentMemories: LongTermMemory[]
    topMemories: LongTermMemory[]
    byType: Record<string, number>
  }> {
    const stats = await this.memoryService.getStats(workspacePath)
    const recentMemories = await this.memoryService.getAll({
      workspacePath,
      limit,
    })

    return {
      totalMemories: stats.total,
      recentMemories,
      topMemories: stats.topMemories,
      byType: stats.byType,
    }
  }

  /**
   * 提取关键词
   */
  private extractKeywords(message: ChatMessage): string[] {
    const content = this.extractContent(message)
    const keywords: string[] = []

    // 1. 使用关键词分析器
    const analysis = this.keywordAnalyzer.analyze(content)
    keywords.push(...analysis.keywords)

    // 2. 提取文件路径
    const paths = this.extractFilePaths(content)
    keywords.push(...paths)

    // 3. 提取决策关键词
    const decisions = this.extractDecisionKeywords(content)
    keywords.push(...decisions)

    // 去重
    return [...new Set(keywords)]
  }

  /**
   * 提取消息文本内容
   */
  private extractContent(message: ChatMessage): string {
    switch (message.type) {
      case 'user':
      case 'system':
        return message.content
      case 'assistant':
        return (message as any).blocks
          ?.filter((b: any) => b.type === 'text')
          .map((b: any) => b.content)
          .join('\n') || ''
      case 'tool':
        return (message as any).output || ''
      case 'tool_group':
        return (message as any).summary || ''
      default:
        return ''
    }
  }

  /**
   * 提取文件路径
   */
  private extractFilePaths(content: string): string[] {
    const pathPatterns = [
      /[\w\-./]+\.[a-z]+/gi, // 相对路径
      /[A-Za-z]:\\[\\/][\w\-./]+/gi, // Windows 路径
      /\/[\w\-./]+\.[a-z]+/gi, // Unix 路径
    ]

    const paths: string[] = []

    for (const pattern of pathPatterns) {
      const matches = content.match(pattern)
      if (matches) {
        paths.push(...matches)
      }
    }

    return [...new Set(paths)].filter(
      (p) => !p.includes('http') && p.length > 3 && p.includes('.')
    )
  }

  /**
   * 提取决策关键词
   */
  private extractDecisionKeywords(content: string): string[] {
    const decisionKeywords = [
      '决定',
      '决策',
      '选择',
      '使用',
      '采用',
      'decided',
      'chose',
      'selected',
      'adopted',
    ]

    return decisionKeywords.filter((keyword) =>
      content.toLowerCase().includes(keyword.toLowerCase())
    )
  }

  /**
   * 对记忆进行相关性排序
   */
  private rankMemories(memories: LongTermMemory[], query: string): LongTermMemory[] {
    const queryLower = query.toLowerCase()

    return memories
      .map((memory) => ({
        memory,
        relevance: this.calculateRelevance(queryLower, memory),
      }))
      .sort((a, b) => b.relevance - a.relevance)
      .map((item) => item.memory)
  }

  /**
   * 计算相关性得分
   */
  private calculateRelevance(query: string, memory: LongTermMemory): number {
    let score = 0

    // 1. key 完全匹配
    if (memory.key.toLowerCase().includes(query)) {
      score += 50
    }

    // 2. key 部分匹配（按词）
    const queryWords = query.split(/\s+/)
    const keyLower = memory.key.toLowerCase()
    for (const word of queryWords) {
      if (keyLower.includes(word)) {
        score += 10
      }
    }

    // 3. value 匹配
    const valueStr = JSON.stringify(memory.value).toLowerCase()
    if (valueStr.includes(query)) {
      score += 30
    }

    // 4. 命中次数权重
    score += Math.min(memory.hitCount * 2, 20)

    // 5. 置信度权重
    score += (memory.confidence ?? 0.5) * 10

    // 6. 时间衰减（最近创建的更重要）
    const daysSinceCreated =
      (Date.now() - new Date(memory.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceCreated < 7) {
      score += 10
    } else if (daysSinceCreated < 30) {
      score += 5
    }

    return score
  }

  /**
   * 生成提醒文本
   */
  private generateReminder(memory: LongTermMemory): string {
    const type = memory.type
    const value = typeof memory.value === 'string' ? JSON.parse(memory.value) : memory.value

    switch (type) {
      case 'project_context':
        if (value.path) {
          return `💭 项目文件: ${value.path}`
        }
        return `💭 项目上下文: ${memory.key}`

      case 'key_decision':
        if (value.decision) {
          return `💭 之前的决策: ${value.decision}`
        }
        if (value.content) {
          return `💭 决策记录: ${value.content.substring(0, 50)}...`
        }
        return `💭 决策: ${memory.key}`

      case 'faq':
        if (value.question) {
          return `💭 常见问题: ${value.question}`
        }
        return `💭 FAQ: ${memory.key}`

      case 'user_preference':
        if (value.engine) {
          return `💭 偏好引擎: ${value.engine} (使用 ${Math.round(value.ratio * 100)}%)`
        }
        return `💭 用户偏好: ${memory.key}`

      case 'code_pattern':
        if (value.pattern) {
          return `💭 代码模式: ${value.pattern.substring(0, 50)}...`
        }
        return `💭 代码模式: ${memory.key}`

      default:
        return `💭 相关记忆: ${memory.key}`
    }
  }
}

// ============================================================================
// 单例模式
// ============================================================================

let retrievalInstance: MemoryRetrieval | null = null

/**
 * 获取记忆检索实例
 */
export function getMemoryRetrieval(): MemoryRetrieval {
  if (!retrievalInstance) {
    retrievalInstance = new MemoryRetrieval()
  }
  return retrievalInstance
}

/**
 * 重置记忆检索实例
 */
export function resetMemoryRetrieval(): void {
  retrievalInstance = null
}
