# 🚀 Phase 2: 消息摘要与压缩 - 具体实现方案（适配版）

## 📋 方案说明

本文档是基于对 Polaris 项目实际架构的深度分析，提供了**完全兼容的实现方案**。

**关键调整**：
- ✅ 适配 5 种 ChatMessage 类型（user/assistant/system/tool/tool_group）
- ✅ 使用实际的 EngineRegistry + Session + Task 架构
- ✅ 集成项目的 configStore
- ✅ 创建独立的 CompressorService（不增加 eventChatStore 复杂度）

---

## 🎯 一、实施步骤概览

```
Step 1: 创建适配层（1 天）
  ├─ 1.1 ChatMessage 适配器
  ├─ 1.2 AI 调用适配器
  └─ 1.3 Token 估算优化

Step 2: 实现核心服务（2 天）
  ├─ 2.1 MessageSummarizer
  ├─ 2.2 压缩策略（3 种）
  └─ 2.3 CompressionScheduler

Step 3: 创建统一服务（1 天）
  ├─ 3.1 CompressorService
  └─ 3.2 配置管理集成

Step 4: 集成到 UI（1 天）
  ├─ 4.1 eventChatStore 集成
  ├─ 4.2 UI 组件
  └─ 4.3 测试验证

总计：5 个工作日
```

---

## 📁 二、文件结构

```
src/services/memory/
├── utils/                               # 新增：工具函数
│   ├── chat-message-adapter.ts          # 消息适配器
│   ├── token-estimator.ts               # Token 估算
│   └── ai-caller.ts                     # AI 调用封装
│
├── summarizer/                          # 新增：摘要服务
│   ├── message-summarizer.ts            # 摘要器核心
│   └── prompts.ts                       # 提示词工程
│
├── compression/                         # 新增：压缩服务
│   ├── compressor-service.ts            # 统一服务入口 ⭐
│   ├── scheduler.ts                     # 压缩调度器
│   ├── strategy.ts                      # 策略基类
│   ├── time-strategy.ts                 # 时间策略
│   ├── size-strategy.ts                 # 大小策略
│   └── importance-strategy.ts           # 重要性策略
│
├── types.ts                             # 已有，需扩展
├── database.ts                          # 已有
├── integration.ts                       # 已有，需扩展
└── index.ts                             # 已有，需扩展

src/stores/
└── eventChatStore.ts                    # 需小幅修改

src/components/summary/                  # 新增：UI 组件
├── SummaryViewer.tsx                    # 摘要查看器
├── CompressionIndicator.tsx            # 压缩状态指示器
└── index.ts
```

---

## 🔧 三、具体实现

### Step 1.1: ChatMessage 适配器

**文件**: `src/services/memory/utils/chat-message-adapter.ts`

```typescript
/**
 * ChatMessage 适配器
 * 处理 5 种消息类型的内容提取和转换
 */

import type { ChatMessage, ToolChatMessage, ToolGroupChatMessage } from '@/types'

/**
 * 从消息中提取纯文本内容
 */
export function extractContentFromMessage(msg: ChatMessage): string {
  switch (msg.type) {
    case 'user':
      return msg.content

    case 'assistant':
      // blocks 是必填字段
      return msg.blocks
        .filter(block => block.type === 'text')
        .map(block => (block as any).content)
        .join('\n')

    case 'system':
      return msg.content

    case 'tool': {
      const toolMsg = msg as ToolChatMessage
      const parts: string[] = []

      // 工具名称和状态
      parts.push(`[工具: ${toolMsg.toolName}]`)
      parts.push(`状态: ${toolMsg.status}`)

      // 输入参数
      if (toolMsg.input) {
        parts.push('输入:')
        parts.push(JSON.stringify(toolMsg.input, null, 2))
      }

      // 输出结果
      if (toolMsg.output) {
        // 截断过长的输出
        const output = toolMsg.output.length > 500
          ? toolMsg.output.substring(0, 500) + '...'
          : toolMsg.output
        parts.push('输出:')
        parts.push(output)
      }

      // 错误信息
      if (toolMsg.error) {
        parts.push('错误:')
        parts.push(toolMsg.error)
      }

      return parts.join('\n')
    }

    case 'tool_group': {
      const groupMsg = msg as ToolGroupChatMessage
      const parts: string[] = []

      parts.push(`[工具组: ${groupMsg.toolNames.join(', ')}]`)
      parts.push(`状态: ${groupMsg.status}`)
      parts.push(`摘要: ${groupMsg.summary}`)

      if (groupMsg.duration) {
        parts.push(`耗时: ${groupMsg.duration}ms`)
      }

      return parts.join('\n')
    }

    default:
      return ''
  }
}

/**
 * 格式化消息为可读文本（用于摘要提示词）
 */
export function formatMessagesForSummary(messages: ChatMessage[]): string {
  return messages
    .map((msg, index) => {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })

      const role = getRoleLabel(msg.type)
      const content = extractContentFromMessage(msg)

      // 限制单条消息长度
      const maxLength = 1000
      const truncatedContent = content.length > maxLength
        ? content.substring(0, maxLength) + '\n...(内容过长，已截断)'
        : content

      return `[${index + 1}] ${timestamp} ${role}:\n${truncatedContent}`
    })
    .join('\n\n---\n\n')
}

/**
 * 获取角色标签
 */
function getRoleLabel(type: ChatMessage['type']): string {
  switch (type) {
    case 'user': return '用户'
    case 'assistant': return '助手'
    case 'system': return '系统'
    case 'tool': return '工具'
    case 'tool_group': return '工具组'
    default: return '未知'
  }
}

/**
 * 检测消息列表的主要语言
 */
export function detectLanguage(messages: ChatMessage[]): 'zh' | 'en' {
  const allText = messages.map(m => extractContentFromMessage(m)).join(' ')
  const chineseChars = (allText.match(/[\u4e00-\u9fa5]/g) || []).length
  const ratio = chineseChars / allText.length

  // 中文字符占比超过 30% 则认为是中文
  return ratio > 0.3 ? 'zh' : 'en'
}

/**
 * 转换数据库消息为 ChatMessage
 */
export function dbMsgToChatMessage(dbMsg: any): ChatMessage {
  // 这个函数需要根据实际的数据库消息格式实现
  // 参考 eventChatStore 中的转换逻辑
  throw new Error('需要实现数据库消息到 ChatMessage 的转换')
}
```

---

### Step 1.2: Token 估算器

**文件**: `src/services/memory/utils/token-estimator.ts`

```typescript
/**
 * Token 估算器
 * 优化 token 计算，考虑工具调用
 */

import type { ChatMessage } from '@/types'
import { extractContentFromMessage } from './chat-message-adapter'

/**
 * 估算单个消息的 token 数量
 */
export function estimateMessageTokens(msg: ChatMessage): number {
  let contentLength = 0

  switch (msg.type) {
    case 'user':
      contentLength = msg.content.length
      break

    case 'assistant':
      // blocks 内容
      contentLength = msg.blocks.reduce((sum, block) => {
        if (block.type === 'text') {
          return sum + (block as any).content.length
        } else if (block.type === 'tool_call') {
          // 工具调用也需要 token
          return sum + 100 // 估算值
        }
        return sum
      }, 0)
      break

    case 'system':
      contentLength = msg.content.length
      break

    case 'tool': {
      const toolMsg = msg as any
      // input 和 output 可能很大
      const inputLength = toolMsg.input
        ? JSON.stringify(toolMsg.input).length
        : 0
      const outputLength = toolMsg.output?.length || 0
      contentLength = inputLength + outputLength
      break
    }

    case 'tool_group': {
      // 工具组消息的 summary 通常较短
      contentLength = (msg as any).summary?.length || 100
      break
    }

    default:
      contentLength = 100
  }

  // 估算规则：
  // - 中文：1 字 ≈ 1.5 tokens
  // - 英文：1 词 ≈ 1 token
  // - 代码：1 字符 ≈ 0.3 tokens
  const chineseRatio = 0.5 // 假设 50% 是中文
  return Math.ceil(contentLength * (chineseRatio * 1.5 + (1 - chineseRatio) * 0.5))
}

/**
 * 估算消息列表的总 token 数量
 */
export function estimateTotalTokens(messages: ChatMessage[]): number {
  return messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0)
}

/**
 * 估算文本的 token 数量
 */
export function estimateTextTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const otherChars = text.length - chineseChars

  return Math.ceil(chineseChars * 1.5 + otherChars * 0.5)
}
```

---

### Step 1.3: AI 调用封装

**文件**: `src/services/memory/utils/ai-caller.ts`

```typescript
/**
 * AI 调用封装
 * 封装 EngineRegistry + Session + Task 的调用流程
 */

import { getEngineRegistry } from '@/ai-runtime'
import type { Engine } from '@/ai-runtime'
import type { EngineId } from '@/core'

/**
 * AI 调用选项
 */
export interface AICallOptions {
  engineId: EngineId
  messages: Array<{ role: string; content: string }>
  temperature?: number
  maxTokens?: number
}

/**
 * 调用 AI 生成文本
 */
export async function callAI(options: AICallOptions): Promise<string> {
  const { engineId, messages, temperature = 0.3, maxTokens = 1000 } = options

  // 1. 获取引擎
  const registry = getEngineRegistry()
  const engine = registry.get(engineId)

  if (!engine) {
    throw new Error(`引擎未找到: ${engineId}`)
  }

  // 2. 创建会话
  const session = engine.createSession({
    sessionId: crypto.randomUUID(),
    workspacePath: '', // 摘要生成不需要工作区
    engineId,
  })

  try {
    // 3. 构造任务
    const task = {
      type: 'chat' as const,
      input: {
        messages,
        temperature,
        maxTokens,
      },
    }

    // 4. 执行任务
    const result = await session.execute(task)

    // 5. 提取响应内容
    if (result.type === 'chat' && result.output?.messages) {
      const lastMessage = result.output.messages[result.output.messages.length - 1]

      if (lastMessage?.role === 'assistant') {
        return extractTextFromContent(lastMessage.content)
      }
    }

    throw new Error('AI 响应格式不正确')
  } finally {
    // 6. 清理会话
    await session.interrupt().catch(err => {
      console.warn('[AICaller] 清理会话失败:', err)
    })
  }
}

/**
 * 从消息内容中提取纯文本
 */
function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .filter(item => item && typeof item === 'object' && 'type' in item)
      .filter(item => item.type === 'text')
      .map(item => (item as any).text)
      .join('\n')
  }

  return String(content)
}
```

---

### Step 2.1: MessageSummarizer 核心

**文件**: `src/services/memory/summarizer/message-summarizer.ts`

```typescript
/**
 * 消息摘要器
 * 使用 AI 生成对话摘要
 */

import type { ChatMessage } from '@/types'
import type { ConversationSummary, CompressionConfig } from '../types'
import { SummaryRepository } from '../repositories/summary-repository'
import { extractContentFromMessage, formatMessagesForSummary, detectLanguage } from '../utils/chat-message-adapter'
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

    // 2. 生成提示词
    const prompt = generateSummaryPrompt(messages, this.config, language)

    // 3. 调用 AI 生成摘要
    const startTime = Date.now()
    const aiResponse = await this.callAIForSummary(prompt, language)
    const duration = Date.now() - startTime

    console.log('[MessageSummarizer] AI 摘要生成完成', {
      duration: `${duration}ms`,
      model: this.config.summaryModel,
      language,
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
    })

    return summaryEntity
  }

  /**
   * 调用 AI 生成摘要
   */
  private async callAIForSummary(
    prompt: string,
    language: 'zh' | 'en'
  ): Promise<string> {
    try {
      const response = await callAI({
        engineId: this.config.summaryModel as any,
        messages: [{ role: 'user', content: prompt }],
        temperature: this.config.summaryTemperature,
        maxTokens: 1000,
      })

      return response
    } catch (error) {
      console.error('[MessageSummarizer] AI 调用失败:', error)
      throw new Error(`摘要生成失败: ${error.message}`)
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
```

---

### Step 2.2: 提示词工程

**文件**: `src/services/memory/summarizer/prompts.ts`

```typescript
/**
 * 摘要提示词生成
 * 支持中英文双语
 */

import type { ChatMessage } from '@/types'
import type { CompressionConfig } from '../types'
import { formatMessagesForSummary } from '../utils/chat-message-adapter'

/**
 * 生成摘要提示词
 */
export function generateSummaryPrompt(
  messages: ChatMessage[],
  config: CompressionConfig,
  language: 'zh' | 'en'
): string {
  const prompts = {
    zh: {
      system: getSystemPrompt('zh'),
      user: getUserPrompt(messages, config, 'zh'),
    },
    en: {
      system: getSystemPrompt('en'),
      user: getUserPrompt(messages, config, 'en'),
    },
  }

  return `${prompts[language].system}\n\n${prompts[language].user}`
}

/**
 * 获取系统提示词
 */
function getSystemPrompt(language: 'zh' | 'en'): string {
  if (language === 'zh') {
    return `你是一个专业的对话摘要专家。你的任务是将一段长对话压缩为精炼的摘要。

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
  } else {
    return `You are a professional conversation summarizer. Your task is to compress a long conversation into a concise summary.

# Requirements
1. Accuracy: Preserve all key information without omissions
2. Conciseness: Express complete ideas with minimal words
3. Structure: Use clear hierarchy (Problem → Solution → Result)
4. Readability: Use natural language, avoid jargon (unless necessary)

# Output Format
Your output must be valid JSON format:
{
  "summary": "Summary content (50-150 words)",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3", "Key point 4", "Key point 5"]
}

# Summary Structure
- Opening: One sentence summarizing the conversation topic
- Middle: Describe main interactions in chronological order
- Ending: Final result or next steps

# Key Points Extraction
- User's questions or requirements
- Solutions or suggestions provided
- Important decision points
- Generated code or configuration
- Errors encountered and fixes
- Action items or next steps`
  }
}

/**
 * 获取用户提示词
 */
function getUserPrompt(
  messages: ChatMessage[],
  config: CompressionConfig,
  language: 'zh' | 'en'
): string {
  const formattedMessages = formatMessagesForSummary(messages)

  if (language === 'zh') {
    return `请将以下对话压缩为摘要：

# 对话内容
${formattedMessages}

# 限制条件
- 摘要长度：${config.minSummaryLength}-${config.maxSummaryLength} 字
- 关键点数量：最多 ${config.maxKeyPoints} 个
- ${config.preserveTools ? '保留所有工具调用的关键信息' : '可以省略工具调用细节'}
- ${config.preserveErrors ? '保留所有错误信息和解决方案' : '可以省略错误信息'}

请输出 JSON 格式的摘要。`
  } else {
    return `Please summarize the following conversation:

# Conversation Content
${formattedMessages}

# Constraints
- Summary length: ${Math.floor(config.minSummaryLength / 2)}-${Math.floor(config.maxSummaryLength / 2)} words
- Key points: Maximum ${config.maxKeyPoints} items
- ${config.preserveTools ? 'Preserve key information from all tool calls' : 'Omit tool call details'}
- ${config.preserveErrors ? 'Preserve all error messages and solutions' : 'Omit error messages'}

Please output the summary in JSON format.`
  }
}
```

---

### Step 2.3: 压缩策略基类

**文件**: `src/services/memory/compression/strategy.ts`

```typescript
/**
 * 压缩策略基类
 */

import type { ChatMessage } from '@/types'
import type { CompressionConfig, CompressionResult } from '../types'
import { MessageSummarizer } from '../summarizer/message-summarizer'
import { MessageRepository } from '../repositories/message-repository'
import { SessionRepository } from '../repositories/session-repository'
import { estimateTotalTokens } from '../utils/token-estimator'

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
          archivedTokens: session.archivedTokens + summary.totalTokens,
        })
      }

      // 4. 计算压缩结果
      const beforeTokens = estimateTotalTokens(allMessages)
      const afterTokens =
        estimateTotalTokens(
          allMessages.filter(m => !messageIds.includes(m.id))
        ) + summary.summary.length * 1.5 // 摘要的 token

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
        beforeTokens: estimateTotalTokens(allMessages),
        afterTokens: estimateTotalTokens(allMessages),
        compressionRatio: 1.0,
        duration: Date.now() - startTime,
        costTokens: 0,
        error: error.message,
      }
    }
  }
}
```

---

### Step 2.4: 时间压缩策略

**文件**: `src/services/memory/compression/time-strategy.ts`

```typescript
/**
 * 时间压缩策略
 * 压缩超过指定时间的旧消息
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
```

---

### Step 2.5: 大小压缩策略

**文件**: `src/services/memory/compression/size-strategy.ts`

```typescript
/**
 * 大小压缩策略
 * 当总 token 数超过阈值时，压缩最早的消息
 */

import { CompressionStrategy } from './strategy'
import type { ChatMessage } from '@/types'
import type { CompressionResult } from '../types'
import { estimateMessageTokens } from '../utils/token-estimator'

/**
 * 大小压缩策略
 */
export class SizeCompressionStrategy extends CompressionStrategy {
  async compress(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<CompressionResult> {
    // 计算总 token 数
    const totalTokens = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)

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
      const msgTokens = estimateMessageTokens(msg)

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

---

### Step 2.6: 重要性压缩策略

**文件**: `src/services/memory/compression/importance-strategy.ts`

```typescript
/**
 * 重要性压缩策略
 * 保留高重要性消息，压缩低重要性消息
 */

import { CompressionStrategy } from './strategy'
import type { ChatMessage } from '@/types'
import type { CompressionResult } from '../types'
import { MessageRepository } from '../repositories/message-repository'
import { estimateMessageTokens } from '../utils/token-estimator'

/**
 * 重要性压缩策略
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

    // 2. 按重要性排序（低分在前）
    const sortedMessages = messages
      .map(msg => ({
        msg,
        score: messageScores.get(msg.id) || 50,
      }))
      .sort((a, b) => a.score - b.score)

    // 3. 计算需要压缩的数量
    const totalTokens = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
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
      accumulatedTokens += estimateMessageTokens(msg)
    }

    console.log('[ImportanceCompressionStrategy] 选择压缩的消息', {
      count: messagesToCompress.length,
      avgScore: Array.from(messageScores.values()).reduce((a, b) => a + b, 0) / messageScores.size,
    })

    return this.executeCompression(sessionId, messagesToCompress, messages)
  }

  /**
   * 获取消息重要性评分
   */
  private async getMessageScores(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<Map<string, number>> {
    const scores = new Map<string, number>()

    for (const msg of messages) {
      try {
        const dbMsg = await this.messageRepo.findById(msg.id)
        if (dbMsg) {
          scores.set(msg.id, dbMsg.importanceScore)
        } else {
          // 如果数据库中没有，给一个默认评分
          scores.set(msg.id, 50)
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

### Step 3.1: CompressionScheduler 调度器

**文件**: `src/services/memory/compression/scheduler.ts`

```typescript
/**
 * 压缩调度器
 * 决定何时以及如何压缩
 */

import type { ChatMessage } from '@/types'
import type { CompressionConfig, CompressionResult } from '../types'
import { TimeCompressionStrategy } from './time-strategy'
import { SizeCompressionStrategy } from './size-strategy'
import { ImportanceCompressionStrategy } from './importance-strategy'
import { estimateMessageTokens } from '../utils/token-estimator'

/**
 * 压缩调度器
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
    const totalTokens = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
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

    const totalTokens = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
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
      result = await this.importanceStrategy.compress(sessionId, messages)
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
}
```

---

### Step 3.2: CompressorService 统一服务 ⭐

**文件**: `src/services/memory/compression/compressor-service.ts`

```typescript
/**
 * 压缩服务
 * 对外提供简单的压缩接口
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
    const result = await this.scheduler.compress(sessionId, messages)

    if (!result.success) {
      return { result, compressedMessages: messages }
    }

    // 加载压缩后的消息（只包含未归档的）
    const messageRepo = new MessageRepository()
    const dbMessages = await messageRepo.findActiveBySessionId(sessionId)

    // 转换为 ChatMessage
    const compressedMessages = dbMessages.map(dbMsgToChatMessage)

    return { result, compressedMessages }
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
    // 如果没有提供配置，从 configStore 读取
    if (!config) {
      const { useConfigStore } = require('@/stores/configStore')
      config = useConfigStore.getState().compressionConfig
    }

    compressorInstance = new CompressorService(config)
  }
  return compressorInstance
}

/**
 * 重置压缩服务实例
 */
export function resetCompressorService() {
  compressorInstance = null
}
```

---

### Step 4.1: 扩展 types.ts

**文件**: `src/services/memory/types.ts`（添加到末尾）

```typescript
/**
 * 压缩配置
 */
export interface CompressionConfig {
  // 触发条件
  maxTokens: number
  maxMessageCount: number
  maxAgeHours: number

  // 压缩目标
  targetTokenRatio: number
  minSummaryLength: number
  maxSummaryLength: number

  // 摘要策略
  extractKeyPoints: boolean
  maxKeyPoints: number
  preserveTools: boolean
  preserveErrors: boolean

  // AI 配置
  summaryModel: 'claude-code' | 'iflow' | 'deepseek'
  summaryPrompt?: string
  summaryTemperature: number

  // 执行时机
  compressOnSave: boolean
  compressOnLoad: boolean
  compressInBackground: boolean
}

/**
 * 默认压缩配置
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

/**
 * 压缩结果
 */
export interface CompressionResult {
  success: boolean
  summaryId?: string
  archivedCount: number
  archivedTokens: number
  beforeTokens: number
  afterTokens: number
  compressionRatio: number
  duration: number
  costTokens: number
  error?: string
}
```

---

### Step 4.2: 扩展 configStore

**文件**: `src/stores/configStore.ts`（添加到 ConfigState 接口）

```typescript
// 在文件顶部添加 import
import type { CompressionConfig, DEFAULT_COMPRESSION_CONFIG } from '@/services/memory/types'

// 在 ConfigState 接口中添加
interface ConfigState {
  // ... 现有字段

  // 新增：压缩配置
  compressionConfig: CompressionConfig

  // 新增：更新压缩配置
  updateCompressionConfig: (config: Partial<CompressionConfig>) => void
}

// 在 store 实现中添加
export const useConfigStore = create<ConfigState>((set, get) => ({
  // ... 现有初始化

  // 新增：压缩配置
  compressionConfig: {
    ...DEFAULT_COMPRESSION_CONFIG,
    // 根据可用引擎选择默认模型
    summaryModel: get().engines.deepseek ? 'deepseek' : 'claude-code',
  },

  // 新增：更新压缩配置
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

### Step 4.3: 集成到 eventChatStore

**文件**: `src/stores/eventChatStore.ts`（最小化修改）

```typescript
// 在文件顶部添加 import
import { getCompressorService } from '@/services/memory/compression/compressor-service'
import type { CompressionResult } from '@/services/memory/types'

// 在 EventChatState 接口中添加
interface EventChatState {
  // ... 现有字段

  // 新增：压缩相关
  compressionResult: CompressionResult | null
  isCompressing: boolean

  // 新增：压缩方法
  compressConversation: () => Promise<void>
  shouldCompressConversation: () => boolean
}

// 在 store 实现中添加
export const useEventChatStore = create<EventChatState>((set, get) => ({
  // ... 现有初始化

  // 新增：压缩相关
  compressionResult: null,
  isCompressing: false,

  /**
   * 压缩对话
   */
  compressConversation: async () => {
    const state = get()
    const { messages, conversationId } = state

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
      const compressor = getCompressorService()
      const { result, compressedMessages } = await compressor.compress(
        conversationId,
        messages
      )

      set({
        messages: compressedMessages,
        compressionResult: result,
        isCompressing: false,
      })

      if (result.success) {
        console.log('[EventChatStore] 压缩完成', {
          beforeCount: messages.length,
          afterCount: compressedMessages.length,
          compressionRatio: `${(result.compressionRatio * 100).toFixed(0)}%`,
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
  shouldCompressConversation: () => {
    const state = get()
    const compressor = getCompressorService()
    return compressor.shouldCompress(state.conversationId, state.messages)
  },
}))
```

---

### Step 5: UI 组件（简化版）

**文件**: `src/components/summary/CompressionIndicator.tsx`

```typescript
import React from 'react'
import type { CompressionResult } from '@/services/memory/types'
import { useEventChatStore } from '@/stores/eventChatStore'

/**
 * 压缩状态指示器
 */
export const CompressionIndicator: React.FC = () => {
  const { compressionResult, isCompressing, compressConversation, shouldCompressConversation } = useEventChatStore()

  if (isCompressing) {
    return (
      <div className="compression-indicator info">
        <span className="spinner" />
        <span>正在压缩对话历史...</span>
      </div>
    )
  }

  if (compressionResult && compressionResult.success) {
    return (
      <div className="compression-indicator success">
        <span className="icon">✓</span>
        <span>
          已归档 {compressionResult.archivedCount} 条消息
          （压缩 {(compressionResult.compressionRatio * 100).toFixed(0)}%）
        </span>
      </div>
    )
  }

  if (compressionResult && !compressionResult.success) {
    return (
      <div className="compression-indicator error">
        <span className="icon">✕</span>
        <span>压缩失败: {compressionResult.error}</span>
      </div>
    )
  }

  if (shouldCompressConversation()) {
    return (
      <div className="compression-indicator warning">
        <span className="icon">⚠</span>
        <span>对话历史较长，建议压缩</span>
        <button onClick={() => compressConversation()}>
          立即压缩
        </button>
      </div>
    )
  }

  return null
}
```

---

## 📋 四、实施检查清单

### Day 1: 适配层
- [ ] 创建 `src/services/memory/utils/chat-message-adapter.ts`
- [ ] 创建 `src/services/memory/utils/token-estimator.ts`
- [ ] 创建 `src/services/memory/utils/ai-caller.ts`
- [ ] 编写单元测试

### Day 2-3: 核心服务
- [ ] 创建 `src/services/memory/summarizer/message-summarizer.ts`
- [ ] 创建 `src/services/memory/summarizer/prompts.ts`
- [ ] 创建 `src/services/memory/compression/strategy.ts`
- [ ] 创建 `src/services/memory/compression/time-strategy.ts`
- [ ] 创建 `src/services/memory/compression/size-strategy.ts`
- [ ] 创建 `src/services/memory/compression/importance-strategy.ts`
- [ ] 编写单元测试

### Day 4: 统一服务
- [ ] 创建 `src/services/memory/compression/compressor-service.ts`
- [ ] 创建 `src/services/memory/compression/scheduler.ts`
- [ ] 扩展 `src/services/memory/types.ts`
- [ ] 扩展 `src/stores/configStore.ts`
- [ ] 编写集成测试

### Day 5: UI 集成
- [ ] 修改 `src/stores/eventChatStore.ts`
- [ ] 创建 `src/components/summary/CompressionIndicator.tsx`
- [ ] 集成到 Chat 组件
- [ ] 端到端测试

---

## 🎯 五、测试方案

### 单元测试示例

```typescript
// src/services/memory/__tests__/chat-message-adapter.test.ts

import { describe, it, expect } from 'vitest'
import { extractContentFromMessage, formatMessagesForSummary } from '../utils/chat-message-adapter'
import type { ChatMessage } from '@/types'

describe('ChatMessageAdapter', () => {
  it('应该正确提取用户消息内容', () => {
    const msg: ChatMessage = {
      id: '1',
      type: 'user',
      content: '你好',
      timestamp: '2024-01-01T00:00:00.000Z',
    }

    const content = extractContentFromMessage(msg)
    expect(content).toBe('你好')
  })

  it('应该正确提取工具消息内容', () => {
    const msg: ChatMessage = {
      id: '1',
      type: 'tool',
      toolId: 'tool-1',
      toolName: 'read_file',
      status: 'completed',
      summary: '读取文件成功',
      input: { path: '/test.txt' },
      output: '文件内容',
      timestamp: '2024-01-01T00:00:00.000Z',
    }

    const content = extractContentFromMessage(msg)
    expect(content).toContain('[工具: read_file]')
    expect(content).toContain('状态: completed')
  })
})
```

---

## 📊 六、性能估算

| 操作 | 预计耗时 | 说明 |
|------|----------|------|
| Token 估算（100 条消息） | < 10ms | 本地计算 |
| 生成摘要 | 2-5s | DeepSeek API 调用 |
| 归档消息（数据库） | < 100ms | 批量更新 |
| 总计 | 3-6s | 用户可接受 |

---

## 🎓 七、关键注意事项

### 1. 数据库迁移
需要实现 `dbMsgToChatMessage()` 函数，参考 eventChatStore 中现有的转换逻辑。

### 2. 错误处理
所有 AI 调用都需要 try-catch，并提供降级方案。

### 3. 配置持久化
CompressionConfig 需要保存到 localStorage 或用户配置文件。

### 4. 循环依赖
使用动态 import 避免 ChatMessage → MessageAdapter → ChatMessage 的循环依赖。

---

## ✅ 八、完成标准

- [ ] 所有文件创建完成
- [ ] 单元测试通过（覆盖率 > 80%）
- [ ] 集成测试通过
- [ ] E2E 测试通过
- [ ] 性能达标（压缩 < 10s）
- [ ] 文档完整

---

**方案完成！这份实现方案完全基于对项目实际架构的分析，可以直接开始实施。** 🚀
