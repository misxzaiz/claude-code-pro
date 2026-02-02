# 🚀 Phase 3: 重要性评分与长期记忆 - 实施方案

## 📋 方案说明

本文档基于 Phase 1 和 Phase 2 的已完成工作，提供 Phase 3（重要性评分与长期记忆）的完整实施方案。

**前置条件**：
- ✅ Phase 1: SQLite 持久化存储（已完成）
- ✅ Phase 2: 消息摘要与压缩（已完成）

---

## 🎯 Phase 3 目标与指标

### 核心目标

实现智能的**消息重要性评分**和**长期记忆管理**，在保持信息完整性的前提下：

1. **重要性评分** - 自动识别关键消息（准确率 > 75%）
2. **长期记忆** - 提取和存储项目知识
3. **智能检索** - 语义搜索历史记忆
4. **主动推荐** - 基于上下文主动提示

### 成功指标（KPI）

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 评分准确率 | > 75% | 关键消息不被遗漏 |
| 评分速度 | < 100ms/条 | 实时评分不打扰 |
| 记忆召回率 | > 80% | 相关记忆能被找到 |
| 搜索准确率 | > 70% | 语义搜索结果相关 |
| 存储效率 | < 50MB/10K 消息 | 长期占用可控 |

---

## 🏗️ 系统架构设计

### 分层架构

```
┌─────────────────────────────────────────────┐
│          UI 层（React Components）                  │
│  - MemoryBrowser（记忆浏览器）                      │
│  - MemorySearch（记忆搜索）                        │
│  - MemoryPanel（记忆面板）                         │
└──────────────┬──────────────────────────────────┘
                   │ 调用
┌──────────────▼──────────────────────────────────┐
│          状态层（Stores）                           │
│  - eventChatStore                                 │
│  - memoryStore（新增）                             │
└──────────────┬──────────────────────────────────┘
                   │ 调用
┌──────────────▼──────────────────────────────────┐
│       服务层（Services） - Phase 3 核心              │
│                                                      │
│  ┌────────────────────────────────────┐            │
│  │  MessageScorer                      │            │
│  │  - score()                           │            │
│  │  - scoreBatch()                      │            │
│  │  - scoreAndUpdate()                  │            │
│  └────────────────────────────────────┘            │
│                      ↓                              │
│  ┌────────────────────────────────────┐            │
│  │  LongTermMemoryService             │            │
│  │  - extractProjectKnowledge()        │            │
│  │  - extractUserPreferences()          │            │
│  │  - extractFAQ()                      │            │
│  └────────────────────────────────────┘            │
│                      ↓                              │
│  ┌────────────────────────────────────┐            │
│  │  MemoryRetrieval                    │            │
│  │  - semanticSearch()                 │            │
│  │  - relatedMemories()                │            │
│  │  - shouldRemind()                   │            │
│  └────────────────────────────────────┘            │
└──────────────┬──────────────────────────────────┘
                   │ 调用
┌──────────────▼──────────────────────────────────┐
│     数据访问层（Repository）               │
│  - SessionRepository                             │
│  - MessageRepository（已有）                    │
│  - SummaryRepository（已有）                     │
│  - LongTermMemoryRepository（新增）              │
└─────────────────────────────────────────────┘
```

---

## 📁 文件结构设计

```
src/services/memory/
├── scorer/                              # 新增：评分服务
│   ├── message-scorer.ts                 # 评分核心
│   ├── scoring-rules.ts                # 评分规则
│   ├── keyword-analyzer.ts              # 关键词分析
│   └── index.ts
│
├── long-term-memory/                     # 新增：长期记忆
│   ├── long-term-memory-service.ts       # 核心服务
│   ├── knowledge-extractor.ts           # 知识提取
│   ├── memory-retrieval.ts              # 记忆检索
│   ├── repository.ts                    # 数据访问
│   └── index.ts
│
├── types.ts                             # 已有，需扩展
├── database.ts                          # 已有，需扩展
│
└── index.ts                             # 已有，需扩展
```

---

## 🔧 实施步骤

### Step 1: 评分服务（2 天）

#### 1.1 MessageScorer 核心

**文件**: `src/services/memory/scorer/message-scorer.ts`

```typescript
import type { Message } from '../types'
import { MessageRepository } from '../repositories/message-repository'

/**
 * 评分结果
 */
export interface ScoreResult {
  total: number              // 总分 0-100
  breakdown: {
    content: number          // 内容重要性
    role: number             // 角色权重
    time: number             // 时间衰减
    length: number           // 长度权重
    tools: number            // 工具调用
    user: number             // 用户交互
  }
  level: 'high' | 'medium' | 'low'
}

/**
 * 消息重要性评分服务
 */
export class MessageScorer {
  private config = {
    // 权重配置（总和 100）
    weights: {
      content: 40,        // 内容质量
      role: 15,          // 角色重要性
      time: 15,          // 时间衰减
      length: 10,         // 消息长度
      tools: 10,         // 工具调用
      user: 10,          // 用户交互
    },
    // 阈值配置
    thresholds: {
      high: 70,         // 高重要性阈值
      medium: 40,       // 中等重要性阈值
      low: 20,          // 低重要性阈值
    },
  }

  /**
   * 评分单条消息
   */
  score(message: Message): ScoreResult {
    const scores = {
      content: this.scoreContent(message),
      role: this.scoreRole(message),
      time: this.scoreTime(message),
      length: this.scoreLength(message),
      tools: this.scoreTools(message),
      user: this.scoreUserInteraction(message),
    }

    // 加权计算总分
    const total = Object.entries(scores).reduce((sum, [key, value]) => {
      const weight = this.config.weights[key as keyof typeof scores]
      return sum + (value * weight / 100)
    }, 0)

    return {
      total: Math.round(total),
      breakdown: scores,
      level: this.getLevel(total),
    }
  }

  /**
   * 批量评分并更新到数据库
   */
  async scoreAndUpdate(messageIds: string[]): Promise<void> {
    const messageRepo = new MessageRepository()

    for (const id of messageIds) {
      const message = await messageRepo.findById(id)
      if (!message) continue

      const result = this.score(message)

      await messageRepo.update(id, {
        importanceScore: result.total,
      })
    }
  }

  /**
   * 评分内容质量
   */
  private scoreContent(message: Message): number {
    let score = 0
    const content = message.content.toLowerCase()

    // 代码相关（高权重）
    if (this.containsCodeBlock(content)) score += 15
    if (this.containsFunctionDefinition(content)) score += 10
    if (this.containsCodeChanges(content)) score += 5
    if (this.containsError(content)) score += 15
    if (this.containsFix(content)) score += 10

    // 关键词（高/中/低）
    const keywords = {
      high: ['bug', 'error', 'fix', 'implement', 'refactor', '优化', '重构', '修复'],
      medium: ['test', 'deploy', 'config', '配置', '部署'],
      low: ['help', 'question', '如何', '怎么'],
    }

    for (const word of keywords.high) {
      if (content.includes(word)) score += 5
    }
    for (const word of keywords.medium) {
      if (content.includes(word)) score += 3
    }
    for (const word of keywords.low) {
      if (content.includes(word)) score += 1
    }

    // 决策和计划
    if (this.containsDecision(content)) score += 10
    if (this.containsPlan(content)) score += 5
    if (this.containsQuestion(content)) score -= 5
    if (this.containsAnswer(content)) score += 5

    return Math.min(100, score)
  }

  /**
   * 评分角色重要性
   */
  private scoreRole(message: Message): number {
    const roleScores = {
      'user': 100,      // 用户消息最重要
      'assistant': 80,   // 助手回复重要
      'system': 20,     // 系统消息次要
      'tool': 60,       // 工具调用重要
    }
    return roleScores[message.role] || 50
  }

  /**
   * 评分时间衰减
   */
  private scoreTime(message: Message): number {
    const age = Date.now() - new Date(message.timestamp).getTime()
    const hours = age / (1000 * 60 * 60)

    // 时间衰减曲线
    if (hours < 1) return 100      // 1 小时内 100%
    if (hours < 6) return 80      // 6 小时内 80%
    if (hours < 24) return 60     // 1 天内 60%
    if (hours < 168) return 40    // 7 天内 40%
    if (hours < 720) return 20    // 30 天内 20%
    return 10                     // 30 天以上 10%
  }

  /**
   * 评分消息长度
   */
  private scoreLength(message: Message): number {
    const tokens = message.tokens || this.estimateTokens(message.content)

    if (tokens > 1000) return 100  // 长消息重要
    if (tokens > 500) return 80
    if (tokens > 200) return 60
    if (tokens > 100) return 40
    if (tokens > 50) return 20
    return 10
  }

  /**
   * 评分工具调用
   */
  private scoreTools(message: Message): number {
    if (message.role !== 'assistant') return 0

    const toolCalls = message.toolCalls
    if (!toolCalls) return 0

    try {
      const tools = JSON.parse(toolCalls)
      // 工具调用越多越重要
      return Math.min(100, tools.length * 20)
    } catch {
      return 0
    }
  }

  /**
   * 评分用户交互
   */
  private scoreUserInteraction(message: Message): number {
    if (message.role !== 'user') return 0

    const content = message.content.toLowerCase()

    // 用户提问更重要
    if (content.includes('?')) return 80
    if (content.includes('怎么') || content.includes('如何')) return 70
    if (content.includes('帮助') || content.includes('help')) return 50

    // 用户指令最重要
    if (this.containsCommand(content)) return 100

    return 50
  }

  // 辅助方法
  private containsCodeBlock(content: string): boolean {
    return /```[\\s\\S]*?```/.test(content)
  }

  private containsFunctionDefinition(content: string): boolean {
    return /(function|const|let|var)\\s+\\w+\\s*[=(=>]|class)/.test(content)
  }

  private containsCodeChanges(content: string): boolean {
    return /(diff|patch|修改|删除|添加|新增)/.test(content)
  }

  private containsError(content: string): boolean {
    return /(error|错误|失败|异常)/.test(content)
  }

  private containsFix(content: string): boolean {
    return /(fix|修复|解决)/.test(content)
  }

  private containsDecision(content: string): boolean {
    return /(决定|决策|选择)/.test(content)
  }

  private containsPlan(content: string): boolean {
    return /(计划|规划|方案)/.test(content)
  }

  private containsQuestion(content: string): boolean {
    return /[？?]/.test(content)
  }

  private containsAnswer(content: string): boolean {
    return /(答案是|可以这样|可以尝试)/.test(content)
  }

  private containsCommand(content: string): boolean {
    return /^(帮我|请|生成|创建|实现|写)/.test(content)
  }

  private estimateTokens(content: string): number {
    // 简单估算
    return Math.ceil(content.length * 1.5)
  }

  private getLevel(score: number): 'high' | 'medium' | 'low' {
    if (score >= this.config.thresholds.high) return 'high'
    if (score >= this.config.thresholds.medium) return 'medium'
    return 'low'
  }
}
```

---

### Step 2: 长期记忆服务（3 天）

#### 2.1 知识提取器

**文件**: `src/services/memory/long-term-memory/knowledge-extractor.ts`

```typescript
import type { Session, Message } from '../types'

/**
 * 知识类型
 */
export enum KnowledgeType {
  PROJECT_CONTEXT = 'project_context',
  KEY_DECISION = 'key_decision',
  USER_PREFERENCE = 'user_preference',
  FAQ = 'faq',
  CODE_PATTERN = 'code_pattern',
}

/**
 * 提取的知识
 */
export interface ExtractedKnowledge {
  id: string
  type: KnowledgeType
  key: string
  value: any
  sessionId: string
  workspacePath: string
  confidence: number  // 置信度 0-1
  extractedAt: string
  hitCount: number
  lastHitAt: string | null
}

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

    // 1. 提取项目结构
    const projectStructure = this.extractProjectStructure(messages)
    knowledges.push(...projectStructure)

    // 2. 提取关键决策
    const decisions = this.extractKeyDecisions(messages)
    knowledges.push(...decisions)

    // 3. 提取代码模式
    const codePatterns = this.extractCodePatterns(messages)
    knowledges.push(...codePatterns)

    return knowledges
  }

  /**
   * 提取项目结构
   */
  private extractProjectStructure(messages: Message[]): ExtractedKnowledge[] {
    const structure: ExtractedKnowledge[] = []

    // 分析文件路径和目录结构
    for (const msg of messages) {
      const paths = this.extractFilePaths(msg.content)
      for (const path of paths) {
        structure.push({
          id: crypto.randomUUID(),
          type: KnowledgeType.PROJECT_CONTEXT,
          key: `file:${path}`,
          value: { path, type: 'file' },
          sessionId: msg.sessionId,
          workspacePath: '', // 从外部获取
          confidence: 0.9,
          extractedAt: new Date().toISOString(),
          hitCount: 0,
          lastHitAt: null,
        })
      }
    }

    return structure
  }

  /**
   * 提取关键决策
   */
  private extractKeyDecisions(messages: Message[]): ExtractedKnowledge[] {
    const decisions: ExtractedKnowledge[] = []

    for (const msg of messages) {
      const content = msg.content.toLowerCase()

      // 检测决策关键词
      if (this.containsDecision(content)) {
        decisions.push({
          id: crypto.randomUUID(),
          type: KnowledgeType.KEY_DECISION,
          key: `decision:${Date.parse(msg.timestamp).toISOString()}`,
          value: { content: msg.content, timestamp: msg.timestamp },
          sessionId: msg.sessionId,
          workspacePath: '',
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
  private extractCodePatterns(messages: Message[]): ExtractedKnowledge[] {
    const patterns: ExtractedKnowledge[] = []

    for (const msg of messages) {
      const patterns = this.extractCodePatterns(msg.content)
      patterns.forEach(pattern => {
        patterns.push({
          id: crypto.randomUUID(),
          type: KnowledgeType.CODE_PATTERN,
          key: `pattern:${pattern.substring(0, 50)}`,
          value: pattern,
          sessionId: msg.sessionId,
          workspacePath: '',
          confidence: 0.6,
          extractedAt: new Date().toISOString(),
          hitCount: 0,
          lastHitAt: null,
        })
      })
    }

    return patterns
  }

  /**
   * 提取用户偏好
   */
  async extractUserPreferences(
    sessions: Session[],
    messages: Message[]
  ): Promise<ExtractedKnowledge[]> {
    const preferences: ExtractedKnowledge[] = []

    // 分析用户习惯
    const engineUsage = this.analyzeEngineUsage(sessions)
    preferences.push(...engineUsage)

    const timePatterns = this.analyzeTimePatterns(sessions)
    preferences.push(...timePatterns)

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
      const sessionMessages = messages.filter(m => m.sessionId === session.id)

      for (let i = 0; i < sessionMessages.length; i += 2) {
        const question = sessionMessages[i]
        const answer = sessionMessages[i + 1]

        if (question.role === 'user' && answer.role === 'assistant') {
          if (this.containsQuestion(question.content)) {
            faqs.push({
              id: crypto.randomUUID(),
              type: KnowledgeType.FAQ,
              key: `faq:${question.content.substring(0, 50)}`,
              value: {
                question: question.content,
                answer: answer.content,
                sessionId: session.id,
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

    return faqs
  }

  // 辅助方法
  private extractFilePaths(content: string): string[] {
    const paths: string[] = []

    // 匹配文件路径（支持多种格式）
    const pathPatterns = [
      /[\w\\-./]+\.[a-z]+/gi,  // 相对路径
      /[A-Za-z]:\\[\\/][\w\\-./]+/gi,  // Windows 路径
      /["'][^"']+"'/gi,             // 引号路径
      /`[^`]+`/gi,                 // 反引号路径
    ]

    for (const pattern of pathPatterns) {
      const matches = content.match(pattern)
      if (matches) {
        paths.push(...matches)
      }
    }

    return [...new Set(paths)]  // 去重
  }

  private containsDecision(content: string): boolean {
    return /(决定|决策|选择|使用|采用)/.test(content)
  }

  private extractCodePatterns(content: string): string[] {
    const patterns: string[] = []

    // 匹配代码模式
    const patternPatterns = [
      /import.*from/g,  // 导入模式
      /function\s+\w+\s*\(/g,  // 函数定义
      /const\s+\w+\s*=/g,  // 常量定义
      /\w+\s*:\s*\([^)]+\)\s*=>/g,  // 箭头函数
      /class\s+\w+/g,  // 类定义
    ]

    for (const pattern of patternPatterns) {
      const matches = content.match(new RegExp(pattern, 'g'))
      if (matches) {
        patterns.push(...matches)
      }
    }

    return [...new Set(patterns)]
  }

  private analyzeEngineUsage(sessions: Session[]): ExtractedKnowledge[] {
    const usage = new Map<string, number>()

    for (const session of sessions) {
      usage.set(session.engineId, (usage.get(session.engineId) || 0) + 1)
    }

    return Array.from(usage.entries()).map(([engine, count]) => ({
      id: crypto.randomUUID(),
      type: KnowledgeType.USER_PREFERENCE,
      key: 'preferred_engine',
      value: { engine, count, ratio: count / sessions.length },
      sessionId: '',
      workspacePath: '',
      confidence: 0.9,
      extractedAt: new Date().toISOString(),
      hitCount: 0,
      lastHitAt: null,
    }))
  }

  private analyzeTimePatterns(sessions: Session[]): ExtractedKnowledge[] {
    // 分析用户活跃时间
    const hourCounts = new Map<number, number>()

    for (const session of sessions) {
      const hour = new Date(session.createdAt).getHours()
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1)
    }

    const peakHour = Array.from(hourCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]

    return [{
      id: crypto.randomUUID(),
      type: KnowledgeType.USER_PREFERENCE,
      key: 'peak_usage_hour',
      value: { hour: peakHour, count: hourCounts.get(peakHour) },
      sessionId: '',
      workspacePath: '',
      confidence: 0.7,
      extractedAt: new Date().toISOString(),
      hitCount: 0,
      lastHitAt: null,
    }]
  }

  private containsQuestion(content: string): boolean {
    return /[？?]/.test(content) ||
           /(怎么|如何|什么是)/.test(content)
  }
}
```

#### 2.2 长期记忆存储库

**文件**: `src/services/memory/long-term-memory/repository.ts`

```typescript
import type { LongTermMemory, KnowledgeType } from '../types'

/**
 * 长期记忆存储库
 */
export class LongTermMemoryRepository {
  private db: Database

  constructor(db: Database) {
    this.db = db
  }

  /**
   * 创建长期记忆
   */
  async create(memory: Omit<LongTermMemory, 'id'>): Promise<LongTermMemory> {
    const id = crypto.randomUUID()

    await this.db.execute(
      `INSERT INTO long_term_memories (id, type, key, value, workspace_path, session_id, hit_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        memory.type,
        memory.key,
        JSON.stringify(memory.value),
        memory.workspacePath || '',
        memory.sessionId || '',
        0,
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    )

    return { ...memory, id }
  }

  /**
   * 查找记忆
   */
  async findByKey(key: string): Promise<LongTermMemory | null> {
    const results = await this.db.select<{ id: string; value: string }>(
      `SELECT * FROM long_term_memories WHERE key = $1 AND is_deleted = 0`,
      [key]
    )

    if (!results || results.length === 0) return null

    const result = results[0]
    return {
      ...result,
      value: JSON.parse(result.value),
    }
  }

  /**
   * 按类型查找
   */
  async findByType(type: KnowledgeType, workspacePath?: string): Promise<LongTermMemory[]> {
    let sql = `SELECT * FROM long_term_memories WHERE type = $1 AND is_deleted = 0`
    const params: any[] = [type]

    if (workspacePath) {
      sql += ` AND workspace_path = $2`
      params.push(workspacePath)
    }

    sql += ` ORDER BY hit_count DESC`

    const results = await this.db.select(sql, params)

    return results.map(r => ({
      ...r,
      value: JSON.parse(r.value),
    }))
  }

  /**
   * 更新命中次数
   */
  async updateHitCount(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE long_term_memories
       SET hit_count = hit_count + 1,
           last_hit_at = $1
       WHERE id = $2`,
      [new Date().toISOString(), id]
    )
  }

  /**
   * 获取热门记忆
   */
  async getTopMemories(limit: number = 10): Promise<LongTermMemory[]> {
    const results = await this.db.select(
      `SELECT * FROM long_term_memories
       WHERE is_deleted = 0
       ORDER BY hit_count DESC
       LIMIT $1`,
      [limit]
    )

    return results.map(r => ({
      ...r,
      value: JSON.parse(r.value),
    }))
  }
}
```

#### 2.3 长期记忆服务

**文件**: `src/services/memory/long-term-memory/long-term-memory-service.ts`

```typescript
import type { Session, Message } from '../types'
import { KnowledgeExtractor, KnowledgeType, ExtractedKnowledge } from './knowledge-extractor'
import { LongTermMemoryRepository } from './repository'

/**
 * 长期记忆服务
 */
export class LongTermMemoryService {
  private extractor: KnowledgeExtractor
  private repository: LongTermMemoryRepository

  constructor() {
    this.extractor = new KnowledgeExtractor()
    // TODO: 从数据库获取 repository
  }

  /**
   * 从会话列表提取长期记忆
   */
  async extractFromSessions(
    sessions: Session[],
    allMessages: Message[]
  ): Promise<{
    projectKnowledge: ExtractedKnowledge[]
    userPreferences: ExtractedKnowledge[]
    faq: ExtractedKnowledge[]
  }> {
    console.log('[LongTermMemoryService] 开始提取长期记忆...', {
      sessionCount: sessions.length,
      messageCount: allMessages.length,
    })

    // 1. 提取项目知识
    const projectKnowledge = await this.extractor.extractProjectKnowledge(
      sessions[0],  // 使用第一个会话
      allMessages.filter(m => m.sessionId === sessions[0].id)
    )

    // 2. 提取用户偏好
    const userPreferences = await this.extractor.extractUserPreferences(
      sessions,
      allMessages
    )

    // 3. 提取 FAQ
    const faq = await this.extractor.extractFAQ(
      sessions,
      allMessages
    )

    console.log('[LongTermMemoryService] 提取完成', {
      projectKnowledgeCount: projectKnowledge.length,
      userPreferencesCount: userPreferences.length,
      faqCount: faq.length,
    })

    return {
      projectKnowledge,
      userPreferences,
      faq,
    }
  }

  /**
   * 保存提取的知识到数据库
   */
  async saveExtractedKnowledge(knowledges: ExtractedKnowledge[]): Promise<void> {
    console.log('[LongTermMemoryService] 保存知识到数据库...', {
      knowledgeCount: knowledges.length,
    })

    for (const knowledge of knowledges) {
      try {
        await this.repository.create(knowledge)
        console.log(`✅ 保存知识: ${knowledge.type} - ${knowledge.key}`)
      } catch (error) {
        console.error(`❌ 保存失败: ${knowledge.type} - ${knowledge.key}`, error)
      }
    }

    console.log('[LongTermMemoryService] 知识保存完成')
  }

  /**
   * 查找相关记忆
   */
  async findRelevantMemories(
    query: string,
    workspacePath?: string
  ): Promise<LongTermMemory[]> {
    console.log('[LongTermMemoryService] 查找相关记忆:', query)

    // 简单的关键词匹配
    const keywords = query.split(/\s+/).filter(w => w.length > 1)

    if (keywords.length === 0) return []

    // 构建查询条件
    const conditions = keywords.map(() => `key LIKE $1`)
    const params = keywords.flatMap(k => [`%${k}%`])

    // 按类型优先级查询
    const types: KnowledgeType[] = [
      KnowledgeType.PROJECT_CONTEXT,
      KnowledgeType.KEY_DECISION,
      KnowledgeType.CODE_PATTERN,
      KnowledgeType.FAQ,
    ]

    for (const type of types) {
      const sql = `
        SELECT * FROM long_term_memories
        WHERE type = $1
          AND is_deleted = 0
          AND (${conditions.join(' OR ')})
          ${workspacePath ? `AND workspace_path = $${params.length + 1}` : ''}
        ORDER BY hit_count DESC
        LIMIT 20
      `

      try {
        const results = await this.repository.db.select<{
          id: string
          value: string
          hit_count: number
        }>(sql, [type, ...params])

        const memories = results.map(r => ({
          ...r,
          value: JSON.parse(r.value),
        }))

        if (memories.length > 0) {
          console.log(`✅ 找到 ${memories.length} 个 ${type} 记忆`)
          return memories
        }
      } catch (error) {
        console.warn(`查询 ${type} 失败:`, error)
      }
    }

    console.log('未找到相关记忆')
    return []
  }

  /**
   * 更新记忆命中次数
   */
  async recordMemoryHit(memoryId: string): Promise<void> {
    await this.repository.updateHitCount(memoryId)
    console.log(`[LongTermMemoryService] 记忆命中: ${memoryId}`)
  }
}
```

#### 2.4 记忆检索服务

**文件**: `src/services/memory/long-term-memory/memory-retrieval.ts`

```typescript
import type { ChatMessage } from '@/types'
import { LongTermMemoryService } from './long-term-memory-service'

/**
 * 记忆检索服务
 */
export class MemoryRetrieval {
  private memoryService: LongTermMemoryService

  constructor(memoryService: LongTermMemoryService) {
    this.memoryService = memoryService
  }

  /**
   * 语义搜索（简化版）
   */
  async semanticSearch(
    query: string,
    workspacePath?: string
  ): Promise<{
    memories: LongTermMemory[]
    query: string
  }> {
    console.log('[MemoryRetrieval] 语义搜索:', query)

    const memories = await this.memoryService.findRelevantMemories(query, workspacePath)

    console.log(`[MemoryRetrieval] 找到 ${memories.length} 个相关记忆`)

    return { memories, query }
  }

  /**
   * 获取相关记忆（用于上下文增强）
   */
  async getRelatedMemories(
    currentMessage: ChatMessage,
    workspacePath?: string
  ): Promise<LongTermMemory[]> {
    // 提取当前消息的关键词
    const keywords = this.extractKeywords(currentMessage)

    // 搜索相关记忆
    const { memories } = await this.semanticSearch(
      keywords.join(' '),
      workspacePath
    )

    // 更新命中次数
    for (const memory of memories) {
      await this.memoryService.recordMemoryHit(memory.id)
    }

    return memories
  }

  /**
   * 检查是否应该提醒
   */
  async shouldRemind(
    userInput: ChatMessage,
    workspacePath?: string
  ): Promise<{
    shouldRemind: boolean
    reminder?: string
  }> {
    console.log('[MemoryRetrieval] 检查是否应该提醒...')

    // 获取相关记忆
    const memories = await this.getRelatedMemories(userInput, workspacePath)

    // 如果找到高度相关的记忆，建议提醒
    if (memories.length > 0) {
      const topMemory = memories[0]

      // 相关性判断：命中次数 > 5 且最近命中 < 30 天
      const isRecent = topMemory.lastHitAt
      const daysSinceHit = isRecent
        ? (Date.now() - new Date(isRecent).getTime()) / (1000 * 60 * 60 * 24)
        : 999

      if (topMemory.hitCount >= 5 && daysSinceHit < 30) {
        return {
          shouldRemind: true,
          reminder: `💭 记得：${topMemory.value.summary || topMemory.key}`,
        }
      }
    }

    return { shouldRemind: false }
  }

  /**
   * 提取关键词
   */
  private extractKeywords(message: ChatMessage): string[] {
    const content = this.extractContent(message)

    // 简单的关键词提取
    const words = content
      .toLowerCase()
      .split(/[\\s,。！？!；：、（）【】「」《》]/g)
      .filter(w => w.length > 1 && !this.isStopWord(w))

    return [...new Set(words)]
  }

  private extractContent(message: ChatMessage): string {
    switch (message.type) {
      case 'user':
        return message.content
      case 'assistant':
        return message.blocks?.map(b => (b as any).content).join('') || ''
      case 'system':
        return message.content
      case 'tool':
        return message.summary || ''
      case 'tool_group':
        return message.summary || ''
      default:
        return ''
    }
  }

  private isStopWord(word: string): boolean {
    const stopWords = ['的', '是', '了', '在', '有', '个', '和', '与', '对']
    return stopWords.includes(word)
  }
}
```

---

### Step 3: UI 组件（2 天）

#### 3.1 记忆浏览器组件

**文件**: `src/components/memory/MemoryBrowser.tsx`

```typescript
import React, { useState, useEffect } from 'react'
import { LongTermMemoryService } from '@/services/memory'
import type { LongTermMemory } from '@/services/memory/types'

/**
 * 记忆浏览器组件
 */
export const MemoryBrowser: React.FC = () => {
  const [memories, setMemories] = useState<LongTermMemory[]>([])
  const [filter, setFilter] = useState<'all' | 'project' | 'preference' | 'faq'>('all')

  const memoryService = new LongTermMemoryService()

  useEffect(() => {
    loadMemories()
  }, [filter])

  const loadMemories = async () => {
    // 加载记忆
    const loaded = await memoryService.repository.getTopMemories(20)
    setMemories(loaded)
  }

  return (
    <div className="memory-browser">
      <div className="memory-browser-header">
        <h3>记忆浏览器</h3>
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
          <option value="all">全部记忆</option>
          <option value="project">项目知识</option>
          <option value="preference">用户偏好</option>
          <option value="faq">常见问题</option>
        </select>
        <button onClick={loadMemories}>刷新</button>
      </div>

      <div className="memory-list">
        {memories.map(memory => (
          <div key={memory.id} className="memory-item">
            <div className="memory-type">{memory.type}</div>
            <div className="memory-key">{memory.key}</div>
            <div className="memory-value">{formatValue(memory.value)}</div>
            <div className="memory-stats">
              <span>命中 {memory.hitCount} 次</span>
              {memory.lastHitAt && (
                <span>最近: {formatDate(memory.lastHitAt)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div  )
}

function formatValue(value: any): string {
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays} 天前`
  return date.toLocaleDateString('zh-CN')
}
```

#### 3.2 记忆搜索组件

**文件**: `src/components/memory/MemorySearch.tsx`

```typescript
import React, { useState } from 'react'
import { MemoryRetrieval } from '@/services/memory'
import { useWorkspaceStore } from '@/stores/workspaceStore'

/**
 * 记忆搜索组件
 */
export const MemorySearch: React.FC = () => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LongTermMemory[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const workspacePath = useWorkspaceStore(state => state.getCurrentWorkspace()?.path || '')

  const memoryService = new LongTermMemoryService()
  const retrieval = new MemoryRetrieval(memoryService)

  const handleSearch = async () => {
    if (!query.trim()) return

    setIsSearching(true)

    try {
      const { memories } = await retrieval.semanticSearch(query, workspacePath)

      setResults(memories)
      console.log(`找到 ${memories.length} 个相关记忆`)
    } catch (error) {
      console.error('搜索失败:', error)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="memory-search">
      <div className="search-box">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索记忆..."
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch()
          }}
        />
        <button onClick={handleSearch} disabled={isSearching}>
          搜索
        </button>
      </div>

      {results.length > 0 && (
        <div className="search-results">
          <h4>搜索结果（{results.length}）</h4>
          {results.map(memory => (
            <div key={memory.id} className="result-item">
              <div className="result-type">{memory.type}</div>
              <div className="result-key">{memory.key}</div>
              <div className="result-content">
                {formatValue(memory.value)}
              </div>
              <div className="result-stats">
                <span>命中 {memory.hitCount} 次</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## 📊 实施时间表

| 周 | 任务 | 预计时间 |
|----|------|----------|
| **Day 1-2** | Step 1: 评分服务 | 2 天 |
| **Day 3-5** | Step 2: 长期记忆服务 | 3 天 |
| **Day 6-7** | Step 3: UI 组件 | 2 天 |
| **Day 8-10** | 测试与优化 | 3 天 |

**总计**: 10 个工作日（2 周）

---

## 📋 实施检查清单

### Week 1: 评分服务（2 天）

- [ ] 创建 `scorer/message-scorer.ts`
- [ ] 创建 `scorer/scoring-rules.ts`
- [ ] 创建 `scorer/keyword-analyzer.ts`
- [ ] 编写单元测试
- [ ] 集成到 eventChatStore

### Week 2-3: 长期记忆服务（3 天）

- [ ] 创建 `knowledge-extractor.ts`
- [ ] 创建 `repository.ts`
- [ ] 创建 `long-term-memory-service.ts`
- [ ] 创建 `memory-retrieval.ts`
- [ ] 编写单元测试

### Week 3: UI 组件（2 天）

- [ ] 创建 `MemoryBrowser.tsx`
- [ ] 创建 `MemorySearch.tsx`
- [ ] 创建 `MemoryPanel.tsx`
- [ ] 集成到主界面

### Week 4: 测试与优化（3 天）

- [ ] 端到端测试
- [ ] 性能测试
- [ ] 用户体验测试
- [ ] 文档完善

---

## 🎯 成功标准

### 功能完整性

- [ ] 评分准确率 > 75%
- [ ] 提取知识类型 ≥ 5 种
- [ ] 语义搜索准确率 > 70%
- [ ] 记忆召回率 > 80%

### 性能指标

- [ ] 评分速度 < 100ms/条
- [ ] 提取速度 < 5s/会话
- [ ] 搜索响应 < 500ms
- [ ] 存储占用 < 50MB/10K 消息

### 用户体验

- [ ] 记忆浏览器可用
- [ ] 搜索功能正常
- [ ] 主动提醒准确
- [ ] 用户满意度 > 4.0/5.0

---

## 💡 关键设计决策

### 1. 为什么使用关键词匹配而非向量搜索？

**理由**:
- ✅ 实现简单，无需额外依赖
- ✅ 性能可控，适合本地存储
- ✅ 准确度足够高（初期）
- ⚠️ 未来可升级到向量搜索

**升级路径**:
```
Phase 3.1: 关键词匹配（当前）
  ↓
Phase 3.5: 向量搜索（未来）
```

### 2. 为什么不使用 AI 进行知识提取？

**理由**:
- ✅ 规则引擎快速可靠
- ✅ 无额外成本
- ✅ 适合结构化数据（代码、路径等）

**何时使用 AI**:
- 需要理解语义时（如情感分析）
- 复杂推理任务
- 摘要生成摘要时

### 3. 为什么使用单独的 memoryStore？

**理由**:
- ✅ 解耦业务逻辑
- ✅ 易于测试和维护
- ✅ 可以独立优化

**未来优化**:
- 考虑合并到 eventChatStore
- 或创建统一的 `useMemory()` hook

---

## ✅ 总结

**Phase 3 提供完整的长期记忆解决方案**：
- ✅ 智能评分系统
- ✅ 多种知识提取
- ✅ 语义搜索
- ✅ 主动提醒

**预期收益**：
- ✅ 记忆永不丢失
- ✅ 知识自动积累
- ✅ 智能搜索和推荐
- ✅ 用户体验显著提升

---

**文档版本**: v1.0
**创建日期**: 2026-02-02
**预计工期**: 10 个工作日（2 周）

**下一步**: 开始实施 Phase 3？还是先完善 Phase 2 的剩余工作？
