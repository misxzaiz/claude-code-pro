/**
 * Skill Matcher - Skills 智能匹配器
 *
 * 根据用户意图和消息内容，匹配最相关的 Skills。
 * 基于 Claude Skills 的 description 关键词匹配。
 *
 * @author Polaris Team
 * @since 2025-02-01
 */

import type { Skill } from './skill-loader'
import type { Intent } from '../core/intent-detector'

/**
 * Skill Matcher 配置
 */
export interface SkillMatcherConfig {
  /** 最大返回 Skills 数量 */
  maxSkills?: number
  /** 是否启用详细日志 */
  verbose?: boolean
}

/**
 * Skill Matcher
 *
 * 负责根据意图匹配相关 Skills
 */
export class SkillMatcher {
  private config: Required<SkillMatcherConfig>

  constructor(config?: SkillMatcherConfig) {
    this.config = {
      maxSkills: config?.maxSkills ?? 3,
      verbose: config?.verbose ?? false,
    }
  }

  /**
   * 根据意图匹配相关 Skills
   * 返回最相关的 1-3 个 Skills
   */
  async match(
    skills: Skill[],
    intent: Intent,
    userMessage: string
  ): Promise<Skill[]> {
    // 1. 计算每个 Skill 的得分
    const scored = skills.map(skill => ({
      skill,
      score: this.calculateScore(skill, intent, userMessage),
      reasons: this.getMatchReasons(skill, intent, userMessage),
    }))

    // 2. 过滤得分为 0 的
    const filtered = scored.filter(s => s.score > 0)

    // 3. 按得分排序
    const sorted = filtered.sort((a, b) => b.score - a.score)

    // 4. 返回前 N 个
    const topSkills = sorted.slice(0, this.config.maxSkills)

    if (this.config.verbose) {
      console.log('[SkillMatcher] Matched skills:', topSkills.map(s => ({
        id: s.skill.id,
        score: s.score,
        reasons: s.reasons,
      })))
    }

    // 更新使用统计
    const now = new Date()
    topSkills.forEach(({ skill }) => {
      skill.useCount = (skill.useCount || 0) + 1
      skill.lastUsed = now
    })

    return topSkills.map(s => s.skill)
  }

  /**
   * 计算 Skill 与意图的相关性得分
   *
   * 评分标准：
   * - 类型匹配: 30 分
   * - 关键词匹配: 50 分
   * - 优先级匹配: 20 分
   * - 使用历史: 10 分
   */
  private calculateScore(
    skill: Skill,
    intent: Intent,
    userMessage: string
  ): number {
    let score = 0

    // 1. 类型匹配 (30 分)
    score += this.scoreTypeMatch(skill, intent)

    // 2. 关键词匹配 (50 分)
    score += this.scoreKeywordMatch(skill, intent, userMessage)

    // 3. 优先级匹配 (20 分)
    score += this.scorePriorityMatch(skill, intent)

    // 4. 使用历史 (10 分)
    score += this.scoreUsageHistory(skill)

    return score
  }

  /**
   * 类型匹配得分 (30 分)
   */
  private scoreTypeMatch(skill: Skill, intent: Intent): number {
    const skillId = skill.id.toLowerCase()
    const intentType = intent.type.toLowerCase()

    // 完全匹配
    if (skillId.includes(intentType) || intentType.includes(skillId)) {
      return 30
    }

    // 部分匹配
    const typeMappings: Record<string, string[]> = {
      'test': ['testing', 'test', 'pytest', 'jest'],
      'write': ['create', 'build', 'generate', 'design'],
      'read': ['analyze', 'review', 'check'],
      'debug': ['fix', 'debug', 'troubleshoot'],
      'refactor': ['optimize', 'improve', 'refactor'],
    }

    const relatedTypes = typeMappings[intentType] || []
    if (relatedTypes.some(type => skillId.includes(type))) {
      return 15
    }

    return 0
  }

  /**
   * 关键词匹配得分 (50 分)
   */
  private scoreKeywordMatch(
    skill: Skill,
    _intent: Intent,
    userMessage: string
  ): number {
    const description = skill.description.toLowerCase()
    const message = userMessage.toLowerCase()

    let score = 0

    // 提取 description 中的关键词
    const keywords = this.extractKeywords(description)

    // 计算匹配的关键词数量
    const matchedKeywords = keywords.filter(kw => message.includes(kw))

    // 每个匹配的关键词 10 分，最多 50 分
    score = Math.min(matchedKeywords.length * 10, 50)

    return score
  }

  /**
   * 优先级匹配得分 (20 分)
   */
  private scorePriorityMatch(skill: Skill, _intent: Intent): number {
    // 项目级 Skill 优先于全局 Skill
    if (skill.scope === 'project') {
      return 10
    }

    return 0
  }

  /**
   * 使用历史得分 (10 分)
   */
  private scoreUsageHistory(skill: Skill): number {
    if (!skill.useCount || skill.useCount === 0) {
      return 0
    }

    // 使用过的 Skill 优先
    if (skill.useCount >= 5) {
      return 10
    } else if (skill.useCount >= 2) {
      return 5
    }

    return 0
  }

  /**
   * 获取匹配原因（用于日志）
   */
  private getMatchReasons(
    skill: Skill,
    _intent: Intent,
    userMessage: string
  ): string[] {
    const reasons: string[] = []

    // 类型匹配
    const skillId = skill.id.toLowerCase()
    const intentType = _intent.type.toLowerCase()
    if (skillId.includes(intentType)) {
      reasons.push('type-match')
    }

    // 关键词匹配
    const description = skill.description.toLowerCase()
    const message = userMessage.toLowerCase()
    const keywords = this.extractKeywords(description)
    const matchedKeywords = keywords.filter(kw => message.includes(kw))
    if (matchedKeywords.length > 0) {
      reasons.push(`keywords: ${matchedKeywords.join(', ')}`)
    }

    // 优先级
    if (skill.scope === 'project') {
      reasons.push('project-scope')
    }

    // 使用历史
    if (skill.useCount && skill.useCount > 0) {
      reasons.push(`used ${skill.useCount} times`)
    }

    return reasons
  }

  /**
   * 从 description 中提取关键词
   */
  private extractKeywords(description: string): string[] {
    // 移除常见停用词
    const stopWords = new Set([
      'use', 'when', 'for', 'the', 'and', 'or', 'but', 'in', 'on', 'at',
      'to', 'of', 'with', 'from', 'as', 'is', 'was', 'are', 'been',
      'claude', 'needs', 'should', 'can', 'will', 'this', 'that',
    ])

    // 分词并过滤
    const words = description
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')  // 移除标点
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word))

    // 去重
    return Array.from(new Set(words))
  }
}
