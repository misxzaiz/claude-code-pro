/**
 * Run 模型
 *
 * Run 是 Task 的一次执行尝试，包含完整的执行过程和结果快照。
 */

import type { AIEvent } from '../../ai-runtime/event'

/**
 * 执行状态
 */
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * 消息类型
 */
export type MessageRole = 'user' | 'assistant' | 'system'

/**
 * 消息
 */
export interface Message {
  /** 唯一标识 */
  id: string

  /** 角色 */
  role: MessageRole

  /** 内容 */
  content: string

  /** 时间戳 */
  timestamp: number

  /** 关联的文件 */
  files?: string[]
}

/**
 * 工具调用状态
 */
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed'

/**
 * 工具调用
 */
export interface ToolCall {
  /** 唯一标识 */
  id: string

  /** 工具名称 */
  tool: string

  /** 工具参数 */
  args: Record<string, unknown>

  /** 执行状态 */
  status: ToolCallStatus

  /** 开始时间 */
  startedAt: number

  /** 结束时间 */
  endedAt?: number

  /** 执行结果 */
  result?: unknown

  /** 错误信息 */
  error?: string
}

/**
 * 文件变更类型
 */
export type FileChangeType = 'created' | 'modified' | 'deleted'

/**
 * 文件变更
 */
export interface FileChange {
  /** 文件路径 */
  path: string

  /** 变更类型 */
  type: FileChangeType

  /** 变更内容（diff） */
  diff?: string

  /** 新文件内容（如果是创建） */
  newContent?: string

  /** 旧行数（如果是修改） */
  oldLines?: number

  /** 新行数（如果是修改） */
  newLines?: number
}

/**
 * Token 使用情况
 */
export interface TokenUsage {
  /** 输入 token 数 */
  input: number

  /** 输出 token 数 */
  output: number

  /** 总 token 数 */
  total: number
}

/**
 * 执行结果快照
 */
export interface RunSnapshot {
  /** 消息列表（用户 + Assistant） */
  messages: Message[]

  /** 工具调用列表 */
  toolCalls: ToolCall[]

  /** 生成的文件变更 */
  fileChanges?: FileChange[]

  /** 执行时长（毫秒） */
  duration: number

  /** Token 使用情况 */
  tokenUsage?: TokenUsage

  /** 最终输出（如果有） */
  output?: unknown

  /** 快照生成时间 */
  generatedAt: number
}

/**
 * 执行上下文
 */
export interface RunContext {
  /** 用户原始输入 */
  userInput: string

  /** 关联的文件列表 */
  files?: string[]

  /** 之前的审查反馈（用于迭代） */
  previousFeedback?: ReviewFeedback[]

  /** 自定义参数 */
  options?: Record<string, unknown>
}

/**
 * 审查反馈（简化版，避免循环依赖）
 * 完整定义见 review.ts
 */
export interface ReviewFeedback {
  /** 反馈类型 */
  type: 'fix_issue' | 'improve' | 'retry' | 'change_approach'

  /** 反馈内容 */
  content: string

  /** 需要修改的文件列表 */
  affectedFiles?: string[]

  /** 优先级 */
  priority: 'low' | 'medium' | 'high'

  /** 相关评论 ID */
  relatedCommentIds?: string[]
}

/**
 * 一次 Agent 执行
 */
export interface AgentRun {
  /** 唯一标识 */
  id: string

  /** 所属任务 ID */
  taskId: string

  /** 执行序号（同一 Task 下的第几次尝试） */
  sequence: number

  /** 使用的 Agent 类型 */
  agentType: string

  /** 当前状态 */
  status: RunStatus

  /** 执行上下文（包含之前的审查反馈） */
  context: RunContext

  /** 执行结果快照（完成后生成） */
  snapshot?: RunSnapshot

  /** 完整事件历史（用于回放，存储在 IndexedDB） */
  events?: AIEvent[]

  /** 审查 ID（等待审查时关联） */
  reviewId?: string

  /** 开始时间 */
  startedAt: number

  /** 结束时间 */
  endedAt?: number

  /** 错误信息（失败时） */
  error?: string
}

/**
 * Run 简略信息（用于看板展示，不包含完整事件）
 */
export interface RunSummary {
  /** 唯一标识 */
  id: string

  /** 所属任务 ID */
  taskId: string

  /** 执行序号 */
  sequence: number

  /** 使用的 Agent 类型 */
  agentType: string

  /** 当前状态 */
  status: RunStatus

  /** 开始时间 */
  startedAt: number

  /** 结束时间 */
  endedAt?: number

  /** 简略统计 */
  summary: {
    /** 消息数量 */
    messageCount: number

    /** 工具调用数量 */
    toolCallCount: number

    /** 文件变更数量 */
    fileChangeCount: number

    /** 执行时长（毫秒） */
    duration: number
  }

  /** 是否有错误 */
  hasError: boolean
}

/**
 * 创建新 Run 的参数
 */
export interface CreateRunParams {
  /** 所属任务 ID */
  taskId: string

  /** 执行序号 */
  sequence: number

  /** 使用的 Agent 类型 */
  agentType: string

  /** 执行上下文 */
  context: RunContext
}
