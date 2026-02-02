/**
 * 消息评分服务
 * 根据多个维度评估消息的重要性
 *
 * @author Polaris Team
 * @since 2026-02-03
 */

import type { ChatMessage } from '@/types'
import { ScoreRuleEngine } from './scoring-rules'
import { KeywordAnalyzer } from './keyword-analyzer'

/**
 * 评分结果
 */
export interface ScoreResult {
  /** 总分 (0-100) */
  total: number
  /** 各维度得分 */
  breakdown: ScoreBreakdown
  /** 重要性等级 */
  level: 'high' | 'medium' | 'low'
}

/**
 * 各维度得分
 */
export interface ScoreBreakdown {
  /** 内容质量得分 (0-100) */
  content: number
  /** 角色重要性得分 (0-100) */
  role: number
  /** 时间衰减得分 (0-100) */
  time: number
  /** 长度得分 (0-100) */
  length: number
  /** 工具调用得分 (0-100) */
  tools: number
  /** 用户交互得分 (0-100) */
  user: number
}

/**
 * 消息评分配置
 */
export interface ScorerConfig {
  /** 各维度权重 (总和应为 100) */
  weights: {
    content: number
    role: number
    time: number
    length: number
    tools: number
    user: number
  }
  /** 重要性阈值 */
  thresholds: {
    high: number
    medium: number
    low: number
  }
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ScorerConfig = {
  weights: {
    content: 40,   // 内容质量最重要
    role: 15,     // 角色权重
    time: 15,     // 时间衰减
    length: 10,   // 消息长度
    tools: 10,    // 工具调用
    user: 10,     // 用户交互
  },
  thresholds: {
    high: 70,     // 高重要性
    medium: 40,   // 中等重要性
    low: 20,      // 低重要性
  },
}

/**
 * 消息评分器
 */
export class MessageScorer {
  private config: ScorerConfig
  private ruleEngine: ScoreRuleEngine
  private keywordAnalyzer: KeywordAnalyzer

  constructor(config?: Partial<ScorerConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: { ...DEFAULT_CONFIG.weights, ...config?.weights },
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...config?.thresholds },
    }
    this.ruleEngine = new ScoreRuleEngine()
    this.keywordAnalyzer = new KeywordAnalyzer()
  }

  /**
   * 评分单条消息
   */
  score(message: ChatMessage): ScoreResult {
    const breakdown: ScoreBreakdown = {
      content: this.scoreContent(message),
      role: this.scoreRole(message),
      time: this.scoreTime(message),
      length: this.scoreLength(message),
      tools: this.scoreTools(message),
      user: this.scoreUserInteraction(message),
    }

    // 计算加权总分
    const total = this.calculateWeightedScore(breakdown)

    return {
      total: Math.round(total),
      breakdown,
      level: this.getLevel(total),
    }
  }

  /**
   * 批量评分消息
   */
  scoreBatch(messages: ChatMessage[]): Map<string, ScoreResult> {
    const results = new Map<string, ScoreResult>()

    for (const message of messages) {
      results.set(message.id, this.score(message))
    }

    return results
  }

  /**
   * 计算加权得分
   */
  private calculateWeightedScore(breakdown: ScoreBreakdown): number {
    const { weights } = this.config

    return (
      breakdown.content * (weights.content / 100) +
      breakdown.role * (weights.role / 100) +
      breakdown.time * (weights.time / 100) +
      breakdown.length * (weights.length / 100) +
      breakdown.tools * (weights.tools / 100) +
      breakdown.user * (weights.user / 100)
    )
  }

  /**
   * 获取重要性等级
   */
  private getLevel(score: number): 'high' | 'medium' | 'low' {
    const { thresholds } = this.config

    if (score >= thresholds.high) return 'high'
    if (score >= thresholds.medium) return 'medium'
    return 'low'
  }

  /**
   * 评分：内容质量 (40% 权重)
   */
  private scoreContent(message: ChatMessage): number {
    let score = 0

    // 1. 使用规则引擎评分
    const ruleScore = this.ruleEngine.score(message)
    score += ruleScore

    // 2. 关键词分析
    const content = this.extractContent(message)
    const keywords = this.keywordAnalyzer.analyze(content)

    // 关键词密度
    if (keywords.technical > 5) score += 10
    if (keywords.action > 3) score += 5
    if (keywords.question > 0) score += 5

    // 3. 内容特征
    if (this.containsCodeBlock(content)) score += 15
    if (this.containsError(content)) score += 10
    if (this.containsFix(content)) score += 10
    if (this.containsFunctionDefinition(content)) score += 10
    if (this.containsDataStructure(content)) score += 5

    return Math.min(100, score)
  }

  /**
   * 评分：角色重要性 (15% 权重)
   */
  private scoreRole(message: ChatMessage): number {
    switch (message.type) {
      case 'user':
        return 100  // 用户消息最重要
      case 'assistant':
        return 80   // 助手回复次之
      case 'system':
        return 60   // 系统消息
      case 'tool':
        return 40   // 工具调用
      case 'tool_group':
        return 30   // 工具组
      default:
        return 20
    }
  }

  /**
   * 评分：时间衰减 (15% 权重)
   */
  private scoreTime(message: ChatMessage): number {
    const now = Date.now()
    const msgTime = new Date(message.timestamp).getTime()
    const ageHours = (now - msgTime) / (1000 * 60 * 60)

    // 时间衰减公式
    // 1 小时内：100 分
    // 24 小时：80 分
    // 7 天：60 分
    // 30 天：40 分
    // 90 天：20 分

    if (ageHours < 1) return 100
    if (ageHours < 24) return 100 - (ageHours / 24) * 20  // 100 -> 80
    if (ageHours < 168) return 80 - ((ageHours - 24) / 144) * 20  // 80 -> 60
    if (ageHours < 720) return 60 - ((ageHours - 168) / 552) * 20  // 60 -> 40
    return Math.max(20, 40 - ((ageHours - 720) / 2160) * 20)  // 40 -> 20
  }

  /**
   * 评分：消息长度 (10% 权重)
   */
  private scoreLength(message: ChatMessage): number {
    const content = this.extractContent(message)
    const length = content.length

    // 长度得分曲线
    // 0-100 字：20 分（太短）
    // 100-500 字：60 分（适中）
    // 500-2000 字：100 分（理想）
    // 2000+ 字：80 分（过长）

    if (length < 100) return 20
    if (length < 500) return 20 + ((length - 100) / 400) * 40
    if (length < 2000) return 60 + ((length - 500) / 1500) * 40
    return Math.max(80, 100 - ((length - 2000) / 3000) * 20)
  }

  /**
   * 评分：工具调用 (10% 权重)
   */
  private scoreTools(message: ChatMessage): number {
    let score = 0

    if (message.type === 'assistant') {
      const blocks = (message as any).blocks || []
      const toolCalls = blocks.filter((b: any) => b.type === 'tool_call')

      // 工具调用数量
      score += Math.min(30, toolCalls.length * 10)

      // 工具类型多样性
      const uniqueTools = new Set(toolCalls.map((tc: any) => tc.name))
      score += Math.min(20, uniqueTools.size * 5)

      // 工具调用结果
      for (const tc of toolCalls) {
        if (tc.error) score += 10  // 错误的工具调用更重要
        if (tc.output && tc.output.length > 500) score += 5
      }
    }

    if (message.type === 'tool') {
      score += 30  // 单个工具调用
    }

    if (message.type === 'tool_group') {
      score += 50  // 工具组很重要
    }

    return Math.min(100, score)
  }

  /**
   * 评分：用户交互 (10% 权重)
   */
  private scoreUserInteraction(message: ChatMessage): number {
    let score = 0
    const content = this.extractContent(message)

    if (message.type === 'user') {
      // 用户提问
      if (this.containsQuestion(content)) score += 30

      // 用户指令
      if (this.containsCommand(content)) score += 20

      // 用户反馈
      if (this.containsFeedback(content)) score += 20

      // 用户确认
      if (this.containsConfirmation(content)) score += 10
    }

    if (message.type === 'assistant') {
      // 助手解答
      const assistantContent = (message as any).blocks
        ?.filter((b: any) => b.type === 'text')
        .map((b: any) => b.content)
        .join('\n') || ''

      if (this.containsAnswer(assistantContent)) score += 30
      if (this.containsExplanation(assistantContent)) score += 20
    }

    return Math.min(100, score)
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
   * 内容特征检测
   */
  private containsCodeBlock(content: string): boolean {
    return /```[\s\S]*?```/.test(content)
  }

  private containsFunctionDefinition(content: string): boolean {
    return /function\s+\w+|const\s+\w+\s*=\s*\(|=>\s*{/.test(content)
  }

  private containsError(content: string): boolean {
    return /error|错误|exception|失败|fail/i.test(content)
  }

  private containsFix(content: string): boolean {
    return /修复|fix|solve|解决|patch/i.test(content)
  }

  private containsDataStructure(content: string): boolean {
    return /interface|type|class|struct|enum/.test(content)
  }

  private containsQuestion(content: string): boolean {
    return /\?|怎么|如何|what|how|why|when|where/i.test(content)
  }

  private containsCommand(content: string): boolean {
    return /^(请|帮我|can you|could you|please)/i.test(content)
  }

  private containsFeedback(content: string): boolean {
    return /对|是的|正确|wrong|不对|good|bad/i.test(content)
  }

  private containsConfirmation(content: string): boolean {
    return /好的|可以|行|OK|确认|confirm/i.test(content)
  }

  private containsAnswer(content: string): boolean {
    return /答案是|答案是|答案是|答案是/i.test(content)
  }

  private containsExplanation(content: string): boolean {
    return /因为|原因是|解释|explain|reason/i.test(content)
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ScorerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      weights: { ...this.config.weights, ...config?.weights },
      thresholds: { ...this.config.thresholds, ...config?.thresholds },
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): ScorerConfig {
    return { ...this.config }
  }
}
