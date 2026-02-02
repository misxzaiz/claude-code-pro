/**
 * 评分规则引擎
 * 基于规则的消息内容评分
 *
 * @author Polaris Team
 * @since 2026-02-03
 */

import type { ChatMessage } from '@/types'

/**
 * 评分规则
 */
export interface ScoringRule {
  /** 规则名称 */
  name: string
  /** 规则描述 */
  description: string
  /** 规则权重 (0-100) */
  weight: number
  /** 匹配函数 */
  matcher: (content: string) => boolean
}

/**
 * 规则类别
 */
enum RuleCategory {
  /** 技术内容 */
  TECHNICAL = 'technical',
  /** 问题解决 */
  PROBLEM_SOLVING = 'problem_solving',
  /** 决策制定 */
  DECISION_MAKING = 'decision_making',
  /** 用户偏好 */
  USER_PREFERENCE = 'user_preference',
}

/**
 * 评分规则引擎
 */
export class ScoreRuleEngine {
  private rules: Map<RuleCategory, ScoringRule[]>

  constructor() {
    this.rules = new Map()
    this.initializeRules()
  }

  /**
   * 初始化评分规则
   */
  private initializeRules(): void {
    // 技术内容规则
    this.rules.set(RuleCategory.TECHNICAL, [
      {
        name: 'code_block',
        description: '包含代码块',
        weight: 30,
        matcher: (content) => /```[\s\S]*?```/.test(content),
      },
      {
        name: 'function_definition',
        description: '定义函数',
        weight: 20,
        matcher: (content) =>
          /function\s+\w+|const\s+\w+\s*=\s*\(|export\s+(const|function|class)/.test(
            content
          ),
      },
      {
        name: 'type_definition',
        description: '定义类型',
        weight: 15,
        matcher: (content) => /interface\s+\w+|type\s+\w+\s*=/.test(content),
      },
      {
        name: 'api_usage',
        description: 'API 调用',
        weight: 15,
        matcher: (content) => /fetch\(|axios\.|\.get\(|\.post\(/.test(content),
      },
      {
        name: 'data_structure',
        description: '数据结构',
        weight: 10,
        matcher: (content) => /Map\(|Set\(|Array\.|Object\.keys/.test(content),
      },
    ])

    // 问题解决规则
    this.rules.set(RuleCategory.PROBLEM_SOLVING, [
      {
        name: 'error_mention',
        description: '提及错误',
        weight: 25,
        matcher: (content) => /error|错误|exception|失败|fail|bug/i.test(content),
      },
      {
        name: 'fix_action',
        description: '修复动作',
        weight: 25,
        matcher: (content) => /修复|fix|solve|解决|patch|debug/i.test(content),
      },
      {
        name: 'solution_pattern',
        description: '解决方案模式',
        weight: 20,
        matcher: (content) =>
          /解决方法是|解决方案|the solution|fixed by|can be solved/.test(content),
      },
      {
        name: 'troubleshooting',
        description: '故障排查',
        weight: 15,
        matcher: (content) => /排查|诊断|troubleshoot|diagnose|check/.test(content),
      },
      {
        name: 'workaround',
        description: '变通方法',
        weight: 15,
        matcher: (content) => /变通|workaround|alternative|instead|临时方案/.test(content),
      },
    ])

    // 决策制定规则
    this.rules.set(RuleCategory.DECISION_MAKING, [
      {
        name: 'decision_keywords',
        description: '决策关键词',
        weight: 30,
        matcher: (content) =>
          /决定|选择|采用|decided|chose|adopt|使用/i.test(content),
      },
      {
        name: 'comparison',
        description: '比较分析',
        weight: 25,
        matcher: (content) => /比较|对比|compare|versus|vs|或者|either/.test(content),
      },
      {
        name: 'trade_off',
        description: '权衡取舍',
        weight: 20,
        matcher: (content) => /权衡|取舍|trade.?off|pros and cons|优缺点/i.test(content),
      },
      {
        name: 'reasoning',
        description: '推理过程',
        weight: 15,
        matcher: (content) => /因为|由于|原因是|because|reason|therefore/.test(content),
      },
      {
        name: 'alternative',
        description: '替代方案',
        weight: 10,
        matcher: (content) => /替代|或者|也可以|alternative|option|instead/.test(content),
      },
    ])

    // 用户偏好规则
    this.rules.set(RuleCategory.USER_PREFERENCE, [
      {
        name: 'preference_statement',
        description: '偏好表述',
        weight: 30,
        matcher: (content) => /我喜欢|我习惯|prefer|like to|usually|always/.test(content),
      },
      {
        name: 'habit_pattern',
        description: '习惯模式',
        weight: 20,
        matcher: (content) => /一般|通常|习惯|normally|typically|generally/.test(content),
      },
      {
        name: 'requirement',
        description: '需求陈述',
        weight: 25,
        matcher: (content) => /需要|要求|must|should|require|need/.test(content),
      },
      {
        name: 'goal_statement',
        description: '目标陈述',
        weight: 15,
        matcher: (content) => /目标是|想要|goal|want to|aim to|target/.test(content),
      },
      {
        name: 'constraint',
        description: '约束条件',
        weight: 10,
        matcher: (content) => /限制|约束|不能|constraint|cannot|limit/.test(content),
      },
    ])
  }

  /**
   * 评分消息
   */
  score(message: ChatMessage): number {
    const content = this.extractContent(message)
    let totalScore = 0

    // 对每个类别的规则进行评分
    for (const [category, rules] of this.rules) {
      const categoryScore = this.scoreByRules(content, rules)

      // 根据消息类型调整类别权重
      const categoryWeight = this.getCategoryWeight(category, message.type)
      totalScore += categoryScore * categoryWeight
    }

    return Math.min(100, totalScore)
  }

  /**
   * 使用规则列表评分
   */
  private scoreByRules(content: string, rules: ScoringRule[]): number {
    let score = 0

    for (const rule of rules) {
      if (rule.matcher(content)) {
        score += rule.weight
      }
    }

    return score
  }

  /**
   * 获取类别权重
   */
  private getCategoryWeight(category: RuleCategory, messageType: ChatMessage['type']): number {
    const baseWeights = {
      [RuleCategory.TECHNICAL]: 1.0,
      [RuleCategory.PROBLEM_SOLVING]: 1.2,
      [RuleCategory.DECISION_MAKING]: 1.3,
      [RuleCategory.USER_PREFERENCE]: 1.5,
    }

    const messageTypeMultipliers = {
      user: 1.2,
      assistant: 1.0,
      system: 0.8,
      tool: 0.5,
      tool_group: 0.6,
    }

    return baseWeights[category] * messageTypeMultipliers[messageType]
  }

  /**
   * 提取消息内容
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
   * 添加自定义规则
   */
  addRule(category: RuleCategory, rule: ScoringRule): void {
    const rules = this.rules.get(category) || []
    rules.push(rule)
    this.rules.set(category, rules)
  }

  /**
   * 获取所有规则
   */
  getRules(): Map<RuleCategory, ScoringRule[]> {
    return new Map(this.rules)
  }

  /**
   * 重置为默认规则
   */
  resetRules(): void {
    this.rules.clear()
    this.initializeRules()
  }
}
