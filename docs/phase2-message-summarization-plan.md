# 🚀 Phase 2: 消息摘要与压缩 - 技术实施方案

## 📋 文档说明

本文档详细规划 Phase 2（消息摘要与压缩）的实施细节，包括：
- 完整的代码实现方案
- AI 摘要算法设计
- 智能压缩策略
- 性能优化与成本控制
- 测试与验证方案

---

## 🎯 一、Phase 2 目标与指标

### 核心目标

将**长对话历史**压缩为**精炼摘要**，在保持信息完整性的前提下：

1. **减少上下文大小** - 从 10000 tokens → 3000 tokens（减少 70%）
2. **提升响应速度** - 延迟降低 50%（从 10s → 5s）
3. **降低 API 成本** - 减少 60% 的 token 消耗
4. **保持信息完整性** - 关键信息不丢失（准确率 > 80%）

### 成功指标（KPI）

| 指标 | 当前值 | 目标值 | 改进幅度 |
|------|--------|--------|----------|
| 上下文大小 | 10000 tokens | 3000 tokens | -70% |
| API 响应时间 | 10s | 5s | -50% |
| Token 成本 | $0.10/次 | $0.04/次 | -60% |
| 摘要准确率 | N/A | > 80% | 新增 |
| 用户满意度 | N/A | > 4.0/5.0 | 新增 |

---

## 🏗️ 二、系统架构设计

### 分层架构

```
┌─────────────────────────────────────────────────────┐
│              UI 层（React Components）                │
│  - ChatMessage.tsx                                   │
│  - HistoryPanel.tsx                                  │
│  - SummaryViewer.tsx（新增）                         │
└──────────────────┬──────────────────────────────────┘
                   │ 调用
┌──────────────────▼──────────────────────────────────┐
│          状态层（Zustand Stores）                     │
│  - eventChatStore.ts                                 │
│    - compressConversation()  // 新增                 │
│    - shouldCompress()        // 新增                 │
│    - getCompressionStrategy() // 新增                │
└──────────────────┬──────────────────────────────────┘
                   │ 调用
┌──────────────────▼──────────────────────────────────┐
│       服务层（Services） - Phase 2 核心               │
│                                                      │
│  ┌────────────────────────────────────┐            │
│  │  MessageSummarizer                 │            │
│  │  - summarize()                     │            │
│  │  - extractKeyPoints()              │            │
│  │  - generateSummary()               │            │
│  └────────────────────────────────────┘            │
│                      ↓                              │
│  ┌────────────────────────────────────┐            │
│  │  CompressionStrategy               │            │
│  │  - compressByTime()                │            │
│  │  - compressBySize()                │            │
│  │  - compressByImportance()          │            │
│  └────────────────────────────────────┘            │
│                      ↓                              │
│  ┌────────────────────────────────────┐            │
│  │  CompressionScheduler              │            │
│  │  - checkAndCompress()              │            │
│  │  - scheduleCompression()           │            │
│  └────────────────────────────────────┘            │
└──────────────────┬──────────────────────────────────┘
                   │ 调用
┌──────────────────▼──────────────────────────────────┐
│      数据访问层（Repositories）                       │
│  - SummaryRepository（已有）                         │
│  - MessageRepository（已有）                         │
└──────────────────┬──────────────────────────────────┘
                   │ 调用
┌──────────────────▼──────────────────────────────────┐
│          AI 引擎层（Engines）                         │
│  - ClaudeCodeEngine（已有）                          │
│  - DeepSeekEngine（已有）                            │
│  - IFlowEngine（已有）                               │
└─────────────────────────────────────────────────────┘
```

---

## 💾 三、数据结构设计

### 3.1 摘要实体（已有，复用）

```typescript
// src/services/memory/types.ts

/**
 * 对话摘要
 * 用于存储压缩后的对话历史
 */
export interface ConversationSummary {
  id: string                      // 摘要 ID
  sessionId: string               // 所属会话

  // 时间范围
  startTime: string               // 开始时间（ISO 8601）
  endTime: string                 // 结束时间（ISO 8601）

  // 统计信息
  messageCount: number            // 原始消息数量
  totalTokens: number             // 原始 token 数量

  // 摘要内容
  summary: string                 // AI 生成的摘要（100-300 字）
  keyPoints: string[]             // 关键点列表（JSON 数组）

  // 元数据
  createdAt: string               // 创建时间
  modelUsed?: string              // 使用的模型（如 "deepseek-chat"）
  costTokens?: number             // 生成摘要消耗的 tokens
}
```

### 3.2 压缩配置（新增）

```typescript
/**
 * 压缩配置
 */
export interface CompressionConfig {
  // 触发条件
  maxTokens: number               // 最大 token 数量（默认 10000）
  maxMessageCount: number         // 最大消息数量（默认 100）
  maxAgeHours: number             // 最大消息年龄（小时，默认 168 = 7天）

  // 压缩目标
  targetTokenRatio: number        // 目标压缩比例（默认 0.3 = 30%）
  minSummaryLength: number        // 最小摘要长度（字数，默认 100）
  maxSummaryLength: number        // 最大摘要长度（字数，默认 500）

  // 摘要策略
  extractKeyPoints: boolean       // 是否提取关键点（默认 true）
  maxKeyPoints: number            // 最大关键点数量（默认 5）
  preserveTools: boolean          // 是否保留工具调用（默认 true）
  preserveErrors: boolean         // 是否保留错误信息（默认 true）

  // AI 配置
  summaryModel: 'claude' | 'deepseek' | 'iflow'  // 使用的模型（默认 'deepseek'）
  summaryPrompt?: string          // 自定义摘要提示词
  summaryTemperature: number      // 生成温度（默认 0.3，低温度更稳定）

  // 执行时机
  compressOnSave: boolean         // 保存时自动压缩（默认 true）
  compressOnLoad: boolean         // 加载时自动压缩（默认 false）
  compressInBackground: boolean   // 后台异步压缩（默认 true）
}

/**
 * 默认配置
 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  maxTokens: 10000,
  maxMessageCount: 100,
  maxAgeHours: 168, // 7 天

  targetTokenRatio: 0.3,
  minSummaryLength: 100,
  maxSummaryLength: 500,

  extractKeyPoints: true,
  maxKeyPoints: 5,
  preserveTools: true,
  preserveErrors: true,

  summaryModel: 'deepseek',
  summaryTemperature: 0.3,

  compressOnSave: true,
  compressOnLoad: false,
  compressInBackground: true,
}
```

### 3.3 压缩结果（新增）

```typescript
/**
 * 压缩结果
 */
export interface CompressionResult {
  success: boolean                // 是否成功
  summaryId?: string              // 生成的摘要 ID
  archivedCount: number           // 归档的消息数量
  archivedTokens: number          // 归档的 token 数量
  beforeTokens: number            // 压缩前的 token 数
  afterTokens: number             // 压缩后的 token 数
  compressionRatio: number        // 压缩比例（0.3 = 30%）
  duration: number                // 压缩耗时（毫秒）
  costTokens: number              // 消耗的 tokens（用于生成摘要）
  error?: string                  // 错误信息
}
```

---

## 🤖 四、AI 摘要算法设计

### 4.1 摘要提示词工程

```typescript
// src/services/memory/summarizer/prompts.ts

/**
 * 生成摘要提示词
 */
export function generateSummaryPrompt(
  messages: ChatMessage[],
  config: CompressionConfig
): string {
  const systemPrompt = `你是一个专业的对话摘要专家。你的任务是将一段长对话压缩为精炼的摘要。

# 要求
1. 准确性：必须保留所有关键信息，不能遗漏重要内容
2. 简洁性：用最少的话表达完整的意思
3. 结构化：使用清晰的层次结构（问题 → 解决方案 → 结果）
4. 可读性：使用自然语言，避免技术术语（除非必要）

# 输出格式
你的输出必须是有效的 JSON 格式：
{
  "summary": "摘要内容（100-300字）",
  "keyPoints": ["关键点1", "关键点2", "关键点3", "关键点4", "关键点5"]
}

# 摘要结构建议
- 开头：一句话总结对话主题
- 中间：按时间顺序描述主要交互
- 结尾：最终结果或待办事项

# 关键点提取建议
- 用户的问题或需求
- 提供的解决方案或建议
- 重要的决策点
- 生成的代码或配置
- 遇到的错误和解决方法
- 待办事项或下一步计划`

  const userPrompt = `请将以下对话压缩为摘要：

# 对话内容
${formatMessagesForSummary(messages, config)}

# 限制条件
- 摘要长度：${config.minSummaryLength}-${config.maxSummaryLength} 字
- 关键点数量：最多 ${config.maxKeyPoints} 个
- ${config.preserveTools ? '保留所有工具调用的关键信息' : '可以省略工具调用细节'}
- ${config.preserveErrors ? '保留所有错误信息和解决方案' : '可以省略错误信息'}

请输出 JSON 格式的摘要。`

  return `${systemPrompt}\n\n${userPrompt}`
}

/**
 * 格式化消息为可读文本
 */
function formatMessagesForSummary(
  messages: ChatMessage[],
  config: CompressionConfig
): string {
  return messages
    .filter(msg => {
      // 过滤系统消息（可选）
      if (msg.type === 'system' && !config.preserveErrors) {
        return false
      }
      return true
    })
    .map((msg, index) => {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString()
      const role = msg.type === 'user' ? '用户' : '助手'

      let content = ''
      if (msg.type === 'user') {
        content = msg.content
      } else if (msg.type === 'assistant') {
        // 提取 blocks 内容
        content = msg.blocks
          ?.map(block => {
            if (block.type === 'text') {
              return block.content
            } else if (block.type === 'tool') {
              return `[工具调用: ${block.name}]\n${block.content}`
            }
            return ''
          })
          .join('\n\n') || ''
      }

      return `[${index + 1}] ${timestamp} ${role}:\n${content}`
    })
    .join('\n\n---\n\n')
}
```

### 4.2 MessageSummarizer 实现

```typescript
// src/services/memory/summarizer/message-summarizer.ts

import { ChatMessage } from '@/stores/eventChatStore'
import { ConversationSummary, CompressionConfig } from '../types'
import { SummaryRepository } from '../repositories/summary-repository'
import { generateSummaryPrompt } from './prompts'

/**
 * 消息摘要器
 * 使用 AI 生成对话摘要
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

    // 1. 生成提示词
    const prompt = generateSummaryPrompt(messages, this.config)

    // 2. 调用 AI 生成摘要
    const startTime = Date.now()
    const aiResponse = await this.callAIForSummary(prompt)
    const duration = Date.now() - startTime

    console.log('[MessageSummarizer] AI 摘要生成完成', {
      duration: `${duration}ms`,
      model: this.config.summaryModel,
    })

    // 3. 解析 AI 响应
    const { summary, keyPoints } = this.parseAIResponse(aiResponse)

    // 4. 创建摘要对象
    const summaryEntity: ConversationSummary = {
      id: crypto.randomUUID(),
      sessionId,
      startTime: messages[0].timestamp,
      endTime: messages[messages.length - 1].timestamp,
      messageCount: messages.length,
      totalTokens: this.estimateTokens(messages),
      summary,
      keyPoints,
      createdAt: new Date().toISOString(),
      modelUsed: this.config.summaryModel,
      costTokens: this.estimateTokens(prompt) + this.estimateTokens(aiResponse),
    }

    // 5. 保存到数据库
    await this.summaryRepo.create(summaryEntity)

    console.log('[MessageSummarizer] 摘要已保存到数据库', {
      summaryId: summaryEntity.id,
      summaryLength: summary.length,
      keyPointsCount: keyPoints.length,
    })

    return summaryEntity
  }

  /**
   * 调用 AI 生成摘要
   */
  private async callAIForSummary(prompt: string): Promise<string> {
    // 根据 config 选择 AI 引擎
    const engine = this.getEngine()

    try {
      // 调用 AI 的 chat API
      const response = await engine.chat([
        {
          role: 'user',
          content: prompt,
        },
      ], {
        temperature: this.config.summaryTemperature,
        maxTokens: 1000, // 摘要不需要太长
      })

      return response.content
    } catch (error) {
      console.error('[MessageSummarizer] AI 调用失败:', error)
      throw new Error(`摘要生成失败: ${error.message}`)
    }
  }

  /**
   * 获取 AI 引擎
   */
  private getEngine() {
    // 从 useEventChatStore 获取当前引擎
    // 这里需要动态导入避免循环依赖
    const engineId = this.config.summaryModel === 'deepseek'
      ? 'deepseek'
      : this.config.summaryModel

    // 返回对应的引擎实例
    // （具体实现需要参考现有的引擎获取逻辑）
    throw new Error('需要实现引擎获取逻辑')
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
      console.warn('[MessageSummarizer] AI 响应:', response)

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
    // 将整个响应作为摘要
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

  /**
   * 估算 token 数量
   */
  private estimateTokens(messages: ChatMessage[] | string): number {
    // 简单估算：中文 1 字 ≈ 1.5 tokens，英文 1 词 ≈ 1 token
    if (typeof messages === 'string') {
      return Math.ceil(messages.length * 1.5)
    }

    return messages.reduce((total, msg) => {
      const content =
        msg.type === 'user'
          ? msg.content
          : msg.blocks?.map(b => b.content).join('') || ''

      return total + this.estimateTokens(content)
    }, 0)
  }
}
```

---

## 📊 五、压缩策略设计

### 5.1 压缩策略接口

```typescript
// src/services/memory/compression/strategy.ts

import { ChatMessage } from '@/stores/eventChatStore'
import { CompressionConfig, CompressionResult } from '../types'
import { MessageSummarizer } from '../summarizer/message-summarizer'
import { MessageRepository } from '../repositories/message-repository'
import { SessionRepository } from '../repositories/session-repository'

/**
 * 压缩策略基类
 */
export abstract class CompressionStrategy {
  protected summarizer: MessageSummarizer
  protected messageRepo: MessageRepository
  protected sessionRepo: SessionRepository
  protected config: CompressionConfig

  constructor(config: CompressionConfig) {
    this.summarizer = new MessageSummarizer(config)
    this.messageRepo = new MessageRepository()
    this.sessionRepo = new SessionRepository()
    this.config = config
  }

  /**
   * 执行压缩（子类实现）
   */
  abstract compress(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<CompressionResult>

  /**
   * 通用的压缩执行逻辑
   */
  protected async executeCompression(
    sessionId: string,
    messagesToCompress: ChatMessage[],
    allMessages: ChatMessage[]
  ): Promise<CompressionResult> {
    const startTime = Date.now()

    try {
      console.log('[CompressionStrategy] 开始压缩...', {
        sessionId,
        compressCount: messagesToCompress.length,
      })

      // 1. 生成摘要
      const summary = await this.summarizer.summarize(
        sessionId,
        messagesToCompress
      )

      // 2. 归档消息
      const messageIds = messagesToCompress.map(m => m.id)
      await this.messageRepo.archiveBatch(messageIds)

      // 3. 更新会话统计
      const session = await this.sessionRepo.findById(sessionId)
      if (session) {
        await this.sessionRepo.update(sessionId, {
          archivedCount: session.archivedCount + messagesToCompress.length,
          archivedTokens:
            session.archivedTokens + summary.totalTokens,
        })
      }

      // 4. 计算压缩结果
      const beforeTokens = this.estimateTokens(allMessages)
      const afterTokens =
        this.estimateTokens(
          allMessages.filter(m => !messageIds.includes(m.id))
        ) + this.estimateTokens(summary.summary)

      const duration = Date.now() - startTime

      const result: CompressionResult = {
        success: true,
        summaryId: summary.id,
        archivedCount: messagesToCompress.length,
        archivedTokens: summary.totalTokens,
        beforeTokens,
        afterTokens,
        compressionRatio: afterTokens / beforeTokens,
        duration,
        costTokens: summary.costTokens || 0,
      }

      console.log('[CompressionStrategy] 压缩完成', {
        archivedCount: result.archivedCount,
        compressionRatio: `${(result.compressionRatio * 100).toFixed(1)}%`,
        duration: `${duration}ms`,
      })

      return result
    } catch (error) {
      console.error('[CompressionStrategy] 压缩失败:', error)

      return {
        success: false,
        archivedCount: 0,
        archivedTokens: 0,
        beforeTokens: this.estimateTokens(allMessages),
        afterTokens: this.estimateTokens(allMessages),
        compressionRatio: 1.0,
        duration: Date.now() - startTime,
        costTokens: 0,
        error: error.message,
      }
    }
  }

  /**
   * 估算 token 数量
   */
  protected estimateTokens(messages: ChatMessage[]): number {
    return messages.reduce((total, msg) => {
      const content =
        msg.type === 'user'
          ? msg.content
          : msg.blocks?.map(b => b.content).join('') || ''

      // 简单估算：中文 1 字 ≈ 1.5 tokens
      return total + Math.ceil(content.length * 1.5)
    }, 0)
  }
}
```

### 5.2 时间策略（按时间压缩）

```typescript
// src/services/memory/compression/time-strategy.ts

import { CompressionStrategy } from './strategy'
import { ChatMessage } from '@/stores/eventChatStore'
import { CompressionResult } from '../types'

/**
 * 时间压缩策略
 * 压缩超过指定时间的旧消息
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
        beforeTokens: this.estimateTokens(messages),
        afterTokens: this.estimateTokens(messages),
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
```

### 5.3 大小策略（按大小压缩）

```typescript
// src/services/memory/compression/size-strategy.ts

import { CompressionStrategy } from './strategy'
import { ChatMessage } from '@/stores/eventChatStore'
import { CompressionResult } from '../types'

/**
 * 大小压缩策略
 * 当总 token 数超过阈值时，压缩最早的消息
 */
export class SizeCompressionStrategy extends CompressionStrategy {
  async compress(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<CompressionResult> {
    const totalTokens = this.estimateTokens(messages)

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
    })

    // 从最早的消息开始，累积到需要压缩的 token 数
    let accumulatedTokens = 0
    const messagesToCompress: ChatMessage[] = []

    for (const msg of messages) {
      const msgTokens = this.estimateTokens([msg])

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
```

### 5.4 重要性策略（按重要性压缩）

```typescript
// src/services/memory/compression/importance-strategy.ts

import { CompressionStrategy } from './strategy'
import { ChatMessage } from '@/stores/eventChatStore'
import { CompressionResult } from '../types'
import { MessageRepository } from '../repositories/message-repository'

/**
 * 重要性压缩策略
 * 保留高重要性消息，压缩低重要性消息
 * （需要 Phase 3 的评分系统支持）
 */
export class ImportanceCompressionStrategy extends CompressionStrategy {
  private messageRepo: MessageRepository

  constructor(config: CompressionConfig) {
    super(config)
    this.messageRepo = new MessageRepository()
  }

  async compress(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<CompressionResult> {
    // 1. 获取消息的重要性评分
    const messageScores = await this.getMessageScores(sessionId, messages)

    // 2. 按重要性排序
    const sortedMessages = messages
      .map(msg => ({
        msg,
        score: messageScores.get(msg.id) || 0,
      }))
      .sort((a, b) => a.score - b.score) // 低分在前

    // 3. 计算需要压缩的数量
    const totalTokens = this.estimateTokens(messages)
    const targetTokens = totalTokens * this.config.targetTokenRatio
    let accumulatedTokens = 0
    const messagesToCompress: ChatMessage[] = []

    for (const { msg, score } of sortedMessages) {
      if (accumulatedTokens >= totalTokens - targetTokens) {
        break
      }

      // 跳过高重要性消息（评分 > 70）
      if (score > 70) {
        continue
      }

      messagesToCompress.push(msg)
      accumulatedTokens += this.estimateTokens([msg])
    }

    console.log('[ImportanceCompressionStrategy] 选择压缩的消息', {
      count: messagesToCompress.length,
      avgScore: Array.from(messageScores.values()).reduce((a, b) => a + b, 0) / messageScores.size,
    })

    return this.executeCompression(sessionId, messagesToCompress, messages)
  }

  /**
   * 获取消息重要性评分
   * （从数据库读取，由 Phase 3 的评分系统生成）
   */
  private async getMessageScores(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<Map<string, number>> {
    // 从数据库读取消息的 importance_score
    const scores = new Map<string, number>()

    for (const msg of messages) {
      try {
        const dbMsg = await this.messageRepo.findById(msg.id)
        if (dbMsg) {
          scores.set(msg.id, dbMsg.importanceScore)
        } else {
          // 如果数据库中没有，给一个默认评分
          scores.set(msg.id, 50) // 中等重要性
        }
      } catch (error) {
        console.warn(`[ImportanceStrategy] 无法获取消息 ${msg.id} 的评分`)
        scores.set(msg.id, 50)
      }
    }

    return scores
  }
}
```

---

## ⏰ 六、压缩调度器

### 6.1 调度器实现

```typescript
// src/services/memory/compression/scheduler.ts

import { ChatMessage } from '@/stores/eventChatStore'
import { CompressionConfig, CompressionResult } from '../types'
import { TimeCompressionStrategy } from './time-strategy'
import { SizeCompressionStrategy } from './size-strategy'
import { ImportanceCompressionStrategy } from './importance-strategy'

/**
 * 压缩调度器
 * 决定何时以及如何压缩
 */
export class CompressionScheduler {
  private config: CompressionConfig
  private timeStrategy: TimeCompressionStrategy
  private sizeStrategy: SizeCompressionStrategy
  private importanceStrategy: ImportanceCompressionStrategy

  constructor(config: CompressionConfig) {
    this.config = config
    this.timeStrategy = new TimeCompressionStrategy(config)
    this.sizeStrategy = new SizeCompressionStrategy(config)
    this.importanceStrategy = new ImportanceCompressionStrategy(config)
  }

  /**
   * 检查是否需要压缩
   */
  shouldCompress(sessionId: string, messages: ChatMessage[]): boolean {
    const totalTokens = this.estimateTotalTokens(messages)
    const messageCount = messages.length
    const oldestMessage = messages[0]
    const ageHours =
      (Date.now() - new Date(oldestMessage.timestamp).getTime()) /
      (1000 * 60 * 60)

    // 检查触发条件
    if (totalTokens >= this.config.maxTokens) {
      console.log('[CompressionScheduler] Token 数量超过阈值', {
        totalTokens,
        maxTokens: this.config.maxTokens,
      })
      return true
    }

    if (messageCount >= this.config.maxMessageCount) {
      console.log('[CompressionScheduler] 消息数量超过阈值', {
        messageCount,
        maxMessageCount: this.config.maxMessageCount,
      })
      return true
    }

    if (ageHours >= this.config.maxAgeHours) {
      console.log('[CompressionScheduler] 消息年龄超过阈值', {
        ageHours: ageHours.toFixed(1),
        maxAgeHours: this.config.maxAgeHours,
      })
      return true
    }

    return false
  }

  /**
   * 执行压缩（自动选择最佳策略）
   */
  async compress(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<CompressionResult> {
    console.log('[CompressionScheduler] 开始执行压缩...', {
      sessionId,
      messageCount: messages.length,
    })

    // 策略选择逻辑
    let result: CompressionResult

    const totalTokens = this.estimateTotalTokens(messages)
    const ageHours =
      (Date.now() - new Date(messages[0].timestamp).getTime()) /
      (1000 * 60 * 60)

    // 决策树
    if (ageHours >= this.config.maxAgeHours) {
      // 优先使用时间策略（旧消息）
      console.log('[CompressionScheduler] 使用时间压缩策略')
      result = await this.timeStrategy.compress(sessionId, messages)
    } else if (totalTokens >= this.config.maxTokens) {
      // 其次使用大小策略（超大对话）
      console.log('[CompressionScheduler] 使用大小压缩策略')
      result = await this.sizeStrategy.compress(sessionId, messages)
    } else {
      // 最后使用重要性策略（需要评分系统）
      console.log('[CompressionScheduler] 使用重要性压缩策略')
      result = await this.importanceStrategy.compress(
        sessionId,
        messages
      )
    }

    // 记录压缩统计
    if (result.success) {
      console.log('[CompressionScheduler] 压缩成功', {
        summaryId: result.summaryId,
        archivedCount: result.archivedCount,
        compressionRatio: `${(result.compressionRatio * 100).toFixed(1)}%`,
        duration: `${result.duration}ms`,
        costTokens: result.costTokens,
      })
    } else {
      console.error('[CompressionScheduler] 压缩失败', {
        error: result.error,
      })
    }

    return result
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

    // 延迟执行，避免阻塞主线程
    setTimeout(async () => {
      if (this.shouldCompress(sessionId, messages)) {
        await this.compress(sessionId, messages)
      }
    }, 1000) // 延迟 1 秒
  }

  /**
   * 估算总 token 数量
   */
  private estimateTotalTokens(messages: ChatMessage[]): number {
    return messages.reduce((total, msg) => {
      const content =
        msg.type === 'user'
          ? msg.content
          : msg.blocks?.map(b => b.content).join('') || ''

      return total + Math.ceil(content.length * 1.5)
    }, 0)
  }
}
```

---

## 🎨 七、UI 集成

### 7.1 摘要查看器组件

```typescript
// src/components/summary/SummaryViewer.tsx

import React from 'react'
import { ConversationSummary } from '@/services/memory/types'
import { SummaryRepository } from '@/services/memory/repositories/summary-repository'

interface SummaryViewerProps {
  sessionId: string
  summaries: ConversationSummary[]
}

/**
 * 摘要查看器
 * 显示归档消息的摘要
 */
export const SummaryViewer: React.FC<SummaryViewerProps> = ({
  sessionId,
  summaries,
}) => {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expanded)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpanded(newExpanded)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="summary-viewer">
      <div className="summary-header">
        <h3>对话摘要</h3>
        <span className="summary-count">{summaries.length} 个摘要</span>
      </div>

      <div className="summary-list">
        {summaries.map(summary => (
          <div
            key={summary.id}
            className={`summary-item ${expanded.has(summary.id) ? 'expanded' : ''}`}
          >
            {/* 摘要头部 */}
            <div
              className="summary-item-header"
              onClick={() => toggleExpand(summary.id)}
            >
              <div className="summary-time">
                {formatDate(summary.startTime)} - {formatDate(summary.endTime)}
              </div>
              <div className="summary-stats">
                <span>{summary.messageCount} 条消息</span>
                <span>•</span>
                <span>{summary.totalTokens} tokens</span>
              </div>
              <button className="expand-button">
                {expanded.has(summary.id) ? '收起' : '展开'}
              </button>
            </div>

            {/* 摘要内容 */}
            {expanded.has(summary.id) && (
              <div className="summary-item-content">
                <div className="summary-text">{summary.summary}</div>

                {summary.keyPoints.length > 0 && (
                  <div className="key-points">
                    <h4>关键点</h4>
                    <ul>
                      {summary.keyPoints.map((point, index) => (
                        <li key={index}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {summary.modelUsed && (
                  <div className="summary-meta">
                    <span>模型: {summary.modelUsed}</span>
                    {summary.costTokens && (
                      <span>• 消耗: {summary.costTokens} tokens</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 7.2 压缩状态指示器

```typescript
// src/components/summary/CompressionIndicator.tsx

import React from 'react'
import { CompressionResult } from '@/services/memory/types'

interface CompressionIndicatorProps {
  result: CompressionResult | null
  compressing: boolean
}

/**
 * 压缩状态指示器
 * 显示压缩进度和结果
 */
export const CompressionIndicator: React.FC<CompressionIndicatorProps> = ({
  result,
  compressing,
}) => {
  if (compressing) {
    return (
      <div className="compression-indicator compressing">
        <div className="spinner" />
        <span>正在压缩对话历史...</span>
      </div>
    )
  }

  if (result && result.success) {
    return (
      <div className="compression-indicator success">
        <span className="icon">✓</span>
        <span>
          已归档 {result.archivedCount} 条消息
          （压缩 {(result.compressionRatio * 100).toFixed(0)}%）
        </span>
        <button
          className="view-button"
          onClick={() => {
            // 打开摘要查看器
          }}
        >
          查看摘要
        </button>
      </div>
    )
  }

  if (result && !result.success) {
    return (
      <div className="compression-indicator error">
        <span className="icon">✕</span>
        <span>压缩失败: {result.error}</span>
      </div>
    )
  }

  return null
}
```

### 7.3 集成到 eventChatStore

```typescript
// src/stores/eventChatStore.ts

import { CompressionScheduler, DEFAULT_COMPRESSION_CONFIG } from '@/services/memory/compression/scheduler'
import { CompressionConfig, CompressionResult } from '@/services/memory/types'

// 在 EventChatState 中添加
interface EventChatState {
  // ... 现有字段

  // 压缩相关
  compressionConfig: CompressionConfig
  compressionResult: CompressionResult | null
  isCompressing: boolean

  // 压缩方法
  compressConversation: () => Promise<void>
  shouldCompress: () => boolean
  updateCompressionConfig: (config: Partial<CompressionConfig>) => void
}

// 在 store 中添加压缩逻辑
export const useEventChatStore = create<EventChatState>((set, get) => ({
  // ... 现有初始化

  // 压缩配置
  compressionConfig: DEFAULT_COMPRESSION_CONFIG,
  compressionResult: null,
  isCompressing: false,

  /**
   * 压缩对话
   */
  compressConversation: async () => {
    const state = get()
    const { messages, conversationId, compressionConfig } = state

    if (messages.length === 0) {
      console.warn('[EventChatStore] 没有消息需要压缩')
      return
    }

    console.log('[EventChatStore] 开始压缩对话...', {
      conversationId,
      messageCount: messages.length,
    })

    set({ isCompressing: true })

    try {
      const scheduler = new CompressionScheduler(compressionConfig)
      const result = await scheduler.compress(conversationId, messages)

      set({ compressionResult: result, isCompressing: false })

      // 如果压缩成功，重新加载消息（只保留未归档的）
      if (result.success) {
        const { loadSessionFromDatabase } = await import('@/services/memory')
        const { messages: dbMessages } = await loadSessionFromDatabase(
          conversationId
        )

        // 只加载未归档的消息
        const activeMessages = dbMessages.filter(
          msg => !msg.isArchived
        )

        set({
          messages: activeMessages.map(dbMsgToChatMessage),
        })

        console.log('[EventChatStore] 压缩完成，已更新消息列表', {
          beforeCount: messages.length,
          afterCount: activeMessages.length,
        })
      }
    } catch (error) {
      console.error('[EventChatStore] 压缩失败:', error)

      set({
        compressionResult: {
          success: false,
          archivedCount: 0,
          archivedTokens: 0,
          beforeTokens: 0,
          afterTokens: 0,
          compressionRatio: 1.0,
          duration: 0,
          costTokens: 0,
          error: error.message,
        },
        isCompressing: false,
      })
    }
  },

  /**
   * 检查是否需要压缩
   */
  shouldCompress: () => {
    const state = get()
    const { messages, compressionConfig } = state

    const scheduler = new CompressionScheduler(compressionConfig)
    return scheduler.shouldCompress(state.conversationId, messages)
  },

  /**
   * 更新压缩配置
   */
  updateCompressionConfig: (config: Partial<CompressionConfig>) => {
    set(state => ({
      compressionConfig: {
        ...state.compressionConfig,
        ...config,
      },
    }))
  },
}))
```

---

## 📏 八、性能优化与成本控制

### 8.1 性能优化策略

#### 1. 批量处理
```typescript
// 避免频繁的小压缩，累积到一定量再压缩
const MIN_MESSAGES_TO_COMPRESS = 20

if (messagesToCompress.length < MIN_MESSAGES_TO_COMPRESS) {
  console.log('消息数量不足，跳过压缩')
  return
}
```

#### 2. 异步后台执行
```typescript
// 不阻塞主线程
if (config.compressInBackground) {
  setTimeout(() => compress(), 1000)
}
```

#### 3. 缓存摘要
```typescript
// 避免重复生成摘要
const cacheKey = `${sessionId}_${messages.slice(-10).map(m => m.id).join('_')}`
const cached = await summaryCache.get(cacheKey)
if (cached) return cached
```

#### 4. 增量压缩
```typescript
// 只压缩新增的消息，而不是全部
const lastCompressedAt = getLastCompressedTime(sessionId)
const newMessages = messages.filter(m => m.timestamp > lastCompressedAt)
```

### 8.2 成本控制策略

#### 1. 使用低成本模型
```typescript
// DeepSeek 比 Claude 便宜 10 倍
const summaryModel: AIModel = {
  name: 'deepseek-chat',
  costPer1kTokens: 0.0014, // $0.0014 per 1K tokens
  // Claude: $0.003 per 1K tokens
}
```

#### 2. 限制输入长度
```typescript
// 只压缩最近 100 条消息
const recentMessages = messages.slice(-100)
```

#### 3. 低温度参数
```typescript
// 使用低温度（0.3）减少 token 消耗
temperature: 0.3
```

#### 4. 简化提示词
```typescript
// 使用简洁的提示词
const shortPrompt = `将以下对话压缩为 200 字摘要和 5 个关键点：\n${content}`
```

### 8.3 成本估算

假设：
- 每次压缩 100 条消息
- 平均每条消息 100 tokens
- 摘要生成消耗 500 tokens
- DeepSeek 价格：$0.0014 / 1K tokens

**单次压缩成本**：
```
输入：100 条 × 100 tokens = 10,000 tokens
输出：500 tokens
总计：10,500 tokens
成本：10.5 × $0.0014 = $0.0147
```

**每月成本**（假设每天 10 次压缩）：
```
10 次/天 × 30 天 = 300 次/月
300 × $0.0147 = $4.41/月
```

**收益**：
```
API 调用节省：70%
每次对话节省：10000 - 3000 = 7000 tokens
每天节省：7000 × 10 = 70,000 tokens
每月节省：70,000 × 30 = 2,100,000 tokens = 2.1M tokens
成本节省：2.1M × $0.003 = $6.3/月（Claude 价格）
净收益：$6.3 - $4.41 = $1.89/月
```

---

## 🧪 九、测试方案

### 9.1 单元测试

```typescript
// src/services/memory/__tests__/message-summarizer.test.ts

import { describe, it, expect, vi } from 'vitest'
import { MessageSummarizer } from '../summarizer/message-summarizer'
import { DEFAULT_COMPRESSION_CONFIG } from '../types'

describe('MessageSummarizer', () => {
  it('应该生成有效的摘要', async () => {
    const summarizer = new MessageSummarizer(DEFAULT_COMPRESSION_CONFIG)

    const messages = [
      {
        id: '1',
        type: 'user' as const,
        content: '如何创建 React 组件？',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
      {
        id: '2',
        type: 'assistant' as const,
        content: '可以使用函数组件：\n```tsx\nfunction MyComponent() {\n  return <div>Hello</div>\n}\n```',
        timestamp: '2024-01-01T00:00:01.000Z',
        blocks: [
          {
            type: 'text' as const,
            content: '可以使用函数组件...',
          },
        ],
      },
    ]

    const summary = await summarizer.summarize('session-1', messages)

    expect(summary).toBeDefined()
    expect(summary.summary).toBeTruthy()
    expect(summary.summary.length).toBeGreaterThanOrEqual(100)
    expect(summary.summary.length).toBeLessThanOrEqual(500)
    expect(summary.keyPoints).toBeInstanceOf(Array)
    expect(summary.keyPoints.length).toBeGreaterThan(0)
    expect(summary.keyPoints.length).toBeLessThanOrEqual(5)
  })

  it('应该处理空消息列表', async () => {
    const summarizer = new MessageSummarizer(DEFAULT_COMPRESSION_CONFIG)

    await expect(
      summarizer.summarize('session-1', [])
    ).rejects.toThrow()
  })
})
```

### 9.2 集成测试

```typescript
// src/services/memory/__tests__/compression-integration.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CompressionScheduler } from '../compression/scheduler'
import { DEFAULT_COMPRESSION_CONFIG } from '../types'
import { DatabaseManager } from '../database'

describe('Compression Integration', () => {
  beforeEach(async () => {
    const dbManager = DatabaseManager.getInstance()
    await dbManager.init()
  })

  afterEach(async () => {
    const dbManager = DatabaseManager.getInstance()
    await dbManager.reset()
  })

  it('应该完整执行压缩流程', async () => {
    const scheduler = new CompressionScheduler(DEFAULT_COMPRESSION_CONFIG)

    // 1. 创建测试会话和消息
    const { createTestSession, createTestMessages } = await import('./test-utils')
    const sessionId = await createTestSession()
    const messages = await createTestMessages(sessionId, 150) // 创建 150 条消息

    // 2. 检查是否需要压缩
    const shouldCompress = scheduler.shouldCompress(sessionId, messages)
    expect(shouldCompress).toBe(true)

    // 3. 执行压缩
    const result = await scheduler.compress(sessionId, messages)
    expect(result.success).toBe(true)
    expect(result.archivedCount).toBeGreaterThan(0)
    expect(result.compressionRatio).toBeLessThan(0.5) // 压缩到 50% 以下

    // 4. 验证数据库
    const { SummaryRepository, MessageRepository } = await import('../repositories')
    const summaryRepo = new SummaryRepository()
    const messageRepo = new MessageRepository()

    const summaries = await summaryRepo.findBySessionId(sessionId)
    expect(summaries.length).toBe(1)

    const archivedMessages = await messageRepo.findArchivedBySessionId(sessionId)
    expect(archivedMessages.length).toBe(result.archivedCount)

    const activeMessages = await messageRepo.findActiveBySessionId(sessionId)
    expect(activeMessages.length).toBeLessThan(messages.length)
  })
})
```

### 9.3 E2E 测试

```typescript
// e2e/compression.spec.ts

import { test, expect } from '@playwright/test'

test.describe('对话压缩', () => {
  test('应该自动压缩长对话', async ({ page }) => {
    await page.goto('http://localhost:1420')

    // 1. 发送大量消息
    for (let i = 0; i < 100; i++) {
      await page.fill('[data-testid="chat-input"]', `测试消息 ${i}`)
      await page.click('[data-testid="send-button"]')
      await page.waitForTimeout(500)
    }

    // 2. 触发压缩
    await page.click('[data-testid="compress-button"]')

    // 3. 等待压缩完成
    await page.waitForSelector('.compression-indicator.success', {
      timeout: 30000,
    })

    // 4. 验证消息数量减少
    const messageCount = await page.locator('.chat-message').count()
    expect(messageCount).toBeLessThan(100)

    // 5. 验证摘要显示
    await page.click('[data-testid="view-summary-button"]')
    await expect(page.locator('.summary-viewer')).toBeVisible()
    await expect(page.locator('.summary-item')).toHaveCount(1)
  })
})
```

---

## 📅 十、实施计划

### Phase 2.1: 核心功能（1 周）

**Day 1-2: AI 摘要算法**
- [ ] 实现 MessageSummarizer
- [ ] 设计提示词工程
- [ ] 测试摘要质量

**Day 3-4: 压缩策略**
- [ ] 实现 TimeCompressionStrategy
- [ ] 实现 SizeCompressionStrategy
- [ ] 实现 CompressionScheduler

**Day 5: 集成与测试**
- [ ] 集成到 eventChatStore
- [ ] 单元测试
- [ ] 集成测试

### Phase 2.2: UI 与优化（3 天）

**Day 6: UI 组件**
- [ ] SummaryViewer 组件
- [ ] CompressionIndicator 组件
- [ ] 设置页面（压缩配置）

**Day 7: 性能优化**
- [ ] 批量处理优化
- [ ] 后台异步执行
- [ ] 缓存策略

**Day 8: 测试与修复**
- [ ] E2E 测试
- [ ] 性能基准测试
- [ ] Bug 修复

### Phase 2.3: 文档与发布（2 天）

**Day 9: 文档**
- [ ] API 文档
- [ ] 用户指南
- [ ] 开发者文档

**Day 10: 发布**
- [ ] Code Review
- [ ] 发布到测试环境
- [ ] 收集反馈
- [ ] 正式发布

---

## 🎯 十一、成功标准

### 功能完整性

- [ ] 支持时间、大小、重要性三种压缩策略
- [ ] 自动检测并触发压缩
- [ ] 摘要准确率 > 80%
- [ ] 压缩比例达到 70%（即保留 30%）

### 性能指标

- [ ] 压缩耗时 < 10 秒（100 条消息）
- [ ] 摘要生成 < 3 秒
- [ ] 后台压缩不阻塞 UI
- [ ] 内存占用 < 100MB

### 用户体验

- [ ] 压缩过程有进度提示
- [ ] 摘要可读性强
- [ ] 关键点提取准确
- [ ] 历史消息可追溯

### 成本控制

- [ ] 每次压缩成本 < $0.02
- [ ] 每月成本 < $5
- [ ] API 调用节省 > 60%

---

## 🎓 十二、经验总结

### 技术亮点

1. **智能压缩策略** - 根据不同场景选择最佳策略
2. **AI 摘要算法** - 使用大语言模型生成高质量摘要
3. **分层存储** - 活跃消息 + 摘要的混合存储
4. **成本优化** - 使用低成本模型 + 增量压缩

### 潜在风险

1. **摘要质量** - 可能丢失重要信息
   - 缓解：人工抽检 + 用户反馈

2. **AI 成本** - 频繁压缩增加成本
   - 缓解：批量处理 + 缓存

3. **性能影响** - 压缩过程可能阻塞 UI
   - 缓解：后台异步执行

### 未来改进

1. **Phase 3 重要性评分** - 提高压缩准确性
2. **语义搜索** - 快速找到历史摘要
3. **自动摘要优化** - 根据用户反馈调整提示词
4. **多模态摘要** - 支持图片、代码块的特殊处理

---

## 📞 结语

Phase 2 的实施将显著提升 Polaris 的上下文管理能力，为用户提供更流畅、更经济的 AI 对话体验。

**预计收益**：
- ✅ 上下文大小减少 70%
- ✅ 响应速度提升 50%
- ✅ API 成本降低 60%
- ✅ 用户满意度显著提升

**下一步**：完成 Phase 1 验证后，即可开始 Phase 2 实施！
