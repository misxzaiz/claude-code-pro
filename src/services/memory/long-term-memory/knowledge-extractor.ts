/**
 * 知识提取器
 * 从会话消息中提取结构化知识
 *
 * @author Polaris Team
 * @since 2026-02-03
 */

import type { Session, Message } from '../types'
import { KnowledgeType, type ExtractedKnowledge } from '../types'

/**
 * 知识提取器
 */
export class KnowledgeExtractor {
  /**
   * 从会话中提取项目知识
   */
  async extractProjectKnowledge(
    session: Session,
    messages: Message[]
  ): Promise<ExtractedKnowledge[]> {
    const knowledges: ExtractedKnowledge[] = []

    // 1. 提取项目结构（文件路径）
    const projectStructure = this.extractProjectStructure(messages, session)
    knowledges.push(...projectStructure)

    // 2. 提取关键决策
    const decisions = this.extractKeyDecisions(messages, session)
    knowledges.push(...decisions)

    // 3. 提取代码模式
    const codePatterns = this.extractCodePatterns(messages, session)
    knowledges.push(...codePatterns)

    console.log('[KnowledgeExtractor] 提取项目知识完成', {
      structureCount: projectStructure.length,
      decisionCount: decisions.length,
      patternCount: codePatterns.length,
    })

    return knowledges
  }

  /**
   * 提取用户偏好
   */
  async extractUserPreferences(
    sessions: Session[],
    _messages: Message[]
  ): Promise<ExtractedKnowledge[]> {
    const preferences: ExtractedKnowledge[] = []

    // 1. 分析引擎使用偏好
    const engineUsage = this.analyzeEngineUsage(sessions)
    preferences.push(...engineUsage)

    // 2. 分析时间模式
    const timePatterns = this.analyzeTimePatterns(sessions)
    preferences.push(...timePatterns)

    // 3. 分析工作区偏好
    const workspacePatterns = this.analyzeWorkspacePatterns(sessions)
    preferences.push(...workspacePatterns)

    console.log('[KnowledgeExtractor] 提取用户偏好完成', {
      engineCount: engineUsage.length,
      timeCount: timePatterns.length,
      workspaceCount: workspacePatterns.length,
    })

    return preferences
  }

  /**
   * 提取常见问题（FAQ）
   */
  async extractFAQ(
    sessions: Session[],
    messages: Message[]
  ): Promise<ExtractedKnowledge[]> {
    const faqs: ExtractedKnowledge[] = []

    // 分析问答对
    for (const session of sessions) {
      const sessionMessages = messages.filter((m) => m.sessionId === session.id)

      for (let i = 0; i < sessionMessages.length - 1; i++) {
        const question = sessionMessages[i]
        const answer = sessionMessages[i + 1]

        if (question.role === 'user' && answer.role === 'assistant') {
          if (this.containsQuestion(question.content)) {
            faqs.push({
              id: crypto.randomUUID(),
              type: KnowledgeType.FAQ,
              key: `faq:${this.generateKey(question.content, 50)}`,
              value: {
                question: question.content,
                answer: answer.content,
                sessionId: session.id,
                timestamp: question.timestamp,
              },
              sessionId: session.id,
              workspacePath: session.workspacePath,
              confidence: 0.8,
              extractedAt: new Date().toISOString(),
              hitCount: 0,
              lastHitAt: null,
            })
          }
        }
      }
    }

    console.log('[KnowledgeExtractor] 提取 FAQ 完成', { faqCount: faqs.length })

    return faqs
  }

  /**
   * 提取项目结构（文件路径）
   */
  private extractProjectStructure(
    messages: Message[],
    session: Session
  ): ExtractedKnowledge[] {
    const structure: ExtractedKnowledge[] = []
    const filePaths = new Set<string>()

    for (const msg of messages) {
      const paths = this.extractFilePaths(msg.content)
      for (const path of paths) {
        filePaths.add(path)
      }
    }

    // 为每个文件路径创建知识条目
    for (const path of filePaths) {
      structure.push({
        id: crypto.randomUUID(),
        type: KnowledgeType.PROJECT_CONTEXT,
        key: `file:${path}`,
        value: {
          path,
          type: this.getFileType(path),
        },
        sessionId: session.id,
        workspacePath: session.workspacePath,
        confidence: 0.9,
        extractedAt: new Date().toISOString(),
        hitCount: 0,
        lastHitAt: null,
      })
    }

    return structure
  }

  /**
   * 提取关键决策
   */
  private extractKeyDecisions(
    messages: Message[],
    session: Session
  ): ExtractedKnowledge[] {
    const decisions: ExtractedKnowledge[] = []

    for (const msg of messages) {
      const content = msg.content.toLowerCase()

      // 检测决策关键词
      if (this.containsDecision(content)) {
        const decisionInfo = this.parseDecision(msg.content)

        decisions.push({
          id: crypto.randomUUID(),
          type: KnowledgeType.KEY_DECISION,
          key: `decision:${this.generateKey(decisionInfo.topic || msg.content, 50)}`,
          value: {
            content: msg.content,
            timestamp: msg.timestamp,
            ...decisionInfo,
          },
          sessionId: session.id,
          workspacePath: session.workspacePath,
          confidence: 0.7,
          extractedAt: new Date().toISOString(),
          hitCount: 0,
          lastHitAt: null,
        })
      }
    }

    return decisions
  }

  /**
   * 提取代码模式
   */
  private extractCodePatterns(
    messages: Message[],
    session: Session
  ): ExtractedKnowledge[] {
    const patterns: ExtractedKnowledge[] = []
    const patternSet = new Set<string>()

    for (const msg of messages) {
      const codePatterns = this.extractCodePatternsFromContent(msg.content)

      for (const pattern of codePatterns) {
        const key = `pattern:${pattern.substring(0, 50)}`

        if (!patternSet.has(key)) {
          patternSet.add(key)

          patterns.push({
            id: crypto.randomUUID(),
            type: KnowledgeType.CODE_PATTERN,
            key,
            value: {
              pattern,
              context: this.extractPatternContext(msg.content, pattern),
            },
            sessionId: session.id,
            workspacePath: session.workspacePath,
            confidence: 0.6,
            extractedAt: new Date().toISOString(),
            hitCount: 0,
            lastHitAt: null,
          })
        }
      }
    }

    return patterns
  }

  /**
   * 分析引擎使用偏好
   */
  private analyzeEngineUsage(sessions: Session[]): ExtractedKnowledge[] {
    const usage = new Map<string, number>()

    for (const session of sessions) {
      usage.set(session.engineId, (usage.get(session.engineId) || 0) + 1)
    }

    const results: ExtractedKnowledge[] = []
    const totalSessions = sessions.length

    for (const [engine, count] of usage.entries()) {
      results.push({
        id: crypto.randomUUID(),
        type: KnowledgeType.USER_PREFERENCE,
        key: 'preferred_engine',
        value: {
          engine,
          count,
          ratio: count / totalSessions,
        },
        sessionId: undefined,
        workspacePath: '',
        confidence: 0.9,
        extractedAt: new Date().toISOString(),
        hitCount: 0,
        lastHitAt: null,
      })
    }

    return results
  }

  /**
   * 分析时间模式
   */
  private analyzeTimePatterns(sessions: Session[]): ExtractedKnowledge[] {
    const hourCounts = new Map<number, number>()
    const dayOfWeekCounts = new Map<number, number>()

    for (const session of sessions) {
      const date = new Date(session.createdAt)
      const hour = date.getHours()
      const dayOfWeek = date.getDay()

      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1)
      dayOfWeekCounts.set(dayOfWeek, (dayOfWeekCounts.get(dayOfWeek) || 0) + 1)
    }

    const results: ExtractedKnowledge[] = []

    // 找出最活跃的小时
    const peakHour = Array.from(hourCounts.entries()).sort((a, b) => b[1] - a[1])[0]
    if (peakHour) {
      results.push({
        id: crypto.randomUUID(),
        type: KnowledgeType.USER_PREFERENCE,
        key: 'peak_usage_hour',
        value: {
          hour: peakHour[0],
          count: peakHour[1],
        },
        sessionId: undefined,
        workspacePath: '',
        confidence: 0.7,
        extractedAt: new Date().toISOString(),
        hitCount: 0,
        lastHitAt: null,
      })
    }

    // 找出最活跃的星期几
    const peakDay = Array.from(dayOfWeekCounts.entries()).sort((a, b) => b[1] - a[1])[0]
    if (peakDay) {
      results.push({
        id: crypto.randomUUID(),
        type: KnowledgeType.USER_PREFERENCE,
        key: 'peak_usage_day',
        value: {
          dayOfWeek: peakDay[0],
          count: peakDay[1],
        },
        sessionId: undefined,
        workspacePath: '',
        confidence: 0.7,
        extractedAt: new Date().toISOString(),
        hitCount: 0,
        lastHitAt: null,
      })
    }

    return results
  }

  /**
   * 分析工作区模式
   */
  private analyzeWorkspacePatterns(sessions: Session[]): ExtractedKnowledge[] {
    const workspaceCounts = new Map<string, number>()

    for (const session of sessions) {
      workspaceCounts.set(
        session.workspacePath,
        (workspaceCounts.get(session.workspacePath) || 0) + 1
      )
    }

    const results: ExtractedKnowledge[] = []

    for (const [workspace, count] of workspaceCounts.entries()) {
      results.push({
        id: crypto.randomUUID(),
        type: KnowledgeType.USER_PREFERENCE,
        key: `workspace_usage:${workspace}`,
        value: {
          workspace,
          count,
        },
        sessionId: undefined,
        workspacePath: workspace,
        confidence: 0.8,
        extractedAt: new Date().toISOString(),
        hitCount: 0,
        lastHitAt: null,
      })
    }

    return results
  }

  // ===========================================================================
  // 辅助方法
  // ===========================================================================

  /**
   * 提取文件路径
   */
  private extractFilePaths(content: string): string[] {
    const paths: string[] = []

    // 匹配文件路径（支持多种格式）
    const pathPatterns = [
      /[\w\-./]+\.[a-z]+/gi, // 相对路径
      /[A-Za-z]:\\[\\/][\w\-./]+/gi, // Windows 路径
      /["']([^"']+\.[a-z]+)["']/gi, // 引号路径
      /`([^`]+\.[a-z]+)`/gi, // 反引号路径
      /\/[\w\-./]+\.[a-z]+/gi, // Unix 路径
    ]

    for (const pattern of pathPatterns) {
      const matches = content.match(pattern)
      if (matches) {
        paths.push(...matches)
      }
    }

    // 去重并过滤常见词
    return [...new Set(paths)].filter(
      (p) =>
        !p.includes('http') &&
        !p.includes('https') &&
        p.length > 3 &&
        p.includes('.')
    )
  }

  /**
   * 获取文件类型
   */
  private getFileType(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase()
    const typeMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript-react',
      js: 'javascript',
      jsx: 'javascript-react',
      json: 'json',
      md: 'markdown',
      css: 'stylesheet',
      scss: 'stylesheet',
      html: 'html',
      vue: 'vue',
      py: 'python',
      rs: 'rust',
      go: 'go',
    }

    return typeMap[ext || ''] || 'unknown'
  }

  /**
   * 检测是否包含决策内容
   */
  private containsDecision(content: string): boolean {
    const decisionKeywords = [
      '决定',
      '决策',
      '选择',
      '使用',
      '采用',
      'decided',
      'chose',
      'choosing',
      'selected',
      'adopted',
    ]

    return decisionKeywords.some((keyword) =>
      content.toLowerCase().includes(keyword.toLowerCase())
    )
  }

  /**
   * 解析决策内容
   */
  private parseDecision(content: string): {
    topic?: string
    decision?: string
    reason?: string
  } {
    const result: { topic?: string; decision?: string; reason?: string } = {}

    // 提取决策主题
    const topicMatch = content.match(/(?:使用|采用|选择|decided to|chose to)\s+([^.。]+)/i)
    if (topicMatch) {
      result.decision = topicMatch[1].trim()
    }

    // 提取原因
    const reasonMatch = content.match(
      /(?:因为|由于|原因是|because|reason|由于)\s+([^.。]+)/i
    )
    if (reasonMatch) {
      result.reason = reasonMatch[1].trim()
    }

    return result
  }

  /**
   * 从内容中提取代码模式
   */
  private extractCodePatternsFromContent(content: string): string[] {
    const patterns: string[] = []

    // 匹配代码模式
    const patternPatterns = [
      /import\s+.*?\s+from\s+['"][^'"]+['"]/g, // import 语句
      /function\s+\w+\s*\([^)]*\)\s*{/g, // 函数定义
      /const\s+\w+\s*=\s*\([^)]*\)\s*=>/g, // 箭头函数
      /class\s+\w+/g, // 类定义
      /interface\s+\w+/g, // 接口定义
      /type\s+\w+\s*=/g, // 类型定义
      /export\s+(const|function|class|interface)/g, // 导出语句
    ]

    for (const pattern of patternPatterns) {
      const matches = content.match(pattern)
      if (matches) {
        patterns.push(...matches)
      }
    }

    return [...new Set(patterns)]
  }

  /**
   * 提取模式上下文
   */
  private extractPatternContext(content: string, pattern: string): string {
    const index = content.indexOf(pattern)
    if (index === -1) return ''

    const start = Math.max(0, index - 50)
    const end = Math.min(content.length, index + pattern.length + 50)

    return content.substring(start, end)
  }

  /**
   * 检测是否包含问题
   */
  private containsQuestion(content: string): boolean {
    return (
      /[？?]/.test(content) ||
      /(怎么|如何|什么|为什么|何时|哪里|what|how|why|when|where)/i.test(content)
    )
  }

  /**
   * 生成 key
   */
  private generateKey(content: string, maxLength: number): string {
    // 移除特殊字符，只保留字母数字和中文
    const cleaned = content.replace(/[^\w\u4e00-\u9fa5]/g, '_')
    return cleaned.substring(0, maxLength)
  }
}
