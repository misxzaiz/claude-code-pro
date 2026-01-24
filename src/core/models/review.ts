/**
 * Review 模型
 *
 * Review 是人类对某次 Run 的结构化评价，包含评论、建议、决策。
 */

import type { GitDiffEntry, ReviewGitContext } from '@/types/git'

/**
 * 审查状态
 */
export type ReviewStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'needs_revision'

/**
 * 评论类型
 */
export type CommentType = 'suggestion' | 'issue' | 'question' | 'approval'

/**
 * 评论优先级
 */
export type CommentPriority = 'low' | 'medium' | 'high'

/**
 * 评论项（针对特定内容）
 */
export interface ReviewComment {
  /** 唯一标识 */
  id: string

  /** 关联的消息 ID */
  messageId?: string

  /** 关联的工具调用 ID */
  toolCallId?: string

  /** 关联的文件路径 */
  filePath?: string

  /** 选中的文本（如果有） */
  selectedText?: string

  /** 关联的行号（用于代码审查） */
  line?: number

  /** 关联的 Diff ID（用于代码审查） */
  diffId?: string

  /** 评论内容 */
  content: string

  /** 评论类型 */
  type: CommentType

  /** 优先级 */
  priority: CommentPriority

  /** 创建时间 */
  createdAt: number

  /** 更新时间 */
  updatedAt: number

  /** 是否已解决 */
  resolved: boolean

  /** 解决时间 */
  resolvedAt?: number

  /** 作者 */
  author?: string
}

/**
 * 审查决策
 */
export interface ReviewDecision {
  /** 是否通过 */
  approved: boolean

  /** 是否需要修订 */
  needsRevision: boolean

  /** 整体评价（1-5 星） */
  overallRating?: 1 | 2 | 3 | 4 | 5

  /** 决策备注 */
  notes?: string

  /** 决策时间 */
  decidedAt: number
}

/**
 * 结构化反馈（给 Agent 的修订指令）
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
 * 人类审查
 */
export interface Review {
  /** 唯一标识 */
  id: string

  /** 关联的执行 ID */
  runId: string

  /** 关联的任务 ID */
  taskId: string

  /** 审查状态 */
  status: ReviewStatus

  /** 评论列表 */
  comments: ReviewComment[]

  /** 审查决策 */
  decision?: ReviewDecision

  /** 结构化反馈（用于 Agent 修订） */
  feedback?: ReviewFeedback

  /** Git 上下文（用于代码审查） */
  gitContext?: ReviewGitContext

  /** Diff 快照（审查时的变更记录） */
  diffSnapshots?: GitDiffEntry[]

  /** 审查人 */
  reviewer?: string

  /** 开始时间 */
  startedAt: number

  /** 完成时间 */
  completedAt?: number
}

/**
 * 创建评论的参数
 */
export interface CreateCommentParams {
  /** 关联的消息 ID */
  messageId?: string

  /** 关联的工具调用 ID */
  toolCallId?: string

  /** 关联的文件路径 */
  filePath?: string

  /** 选中的文本（如果有） */
  selectedText?: string

  /** 关联的行号（用于代码审查） */
  line?: number

  /** 关联的 Diff ID */
  diffId?: string

  /** 评论内容 */
  content: string

  /** 评论类型 */
  type: CommentType

  /** 优先级 */
  priority?: CommentPriority
}

/**
 * 更新评论的参数
 */
export interface UpdateCommentParams {
  /** 评论内容 */
  content?: string

  /** 是否已解决 */
  resolved?: boolean
}

/**
 * 提交审查决策的参数
 */
export interface SubmitDecisionParams {
  /** 是否通过 */
  approved: boolean

  /** 是否需要修订 */
  needsRevision: boolean

  /** 整体评价（1-5 星） */
  overallRating?: 1 | 2 | 3 | 4 | 5

  /** 决策备注 */
  notes?: string

  /** 是否生成结构化反馈（需要修订时） */
  generateFeedback?: boolean
}

/**
 * 创建审查的参数
 */
export interface CreateReviewParams {
  /** 关联的执行 ID */
  runId: string

  /** 关联的任务 ID */
  taskId: string

  /** Git 上下文（可选，用于代码审查） */
  gitContext?: ReviewGitContext
}
