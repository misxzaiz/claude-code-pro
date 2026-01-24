/**
 * Review Manager
 *
 * 管理审查流程：创建审查、添加评论、提交决策、生成反馈
 */

import type {
  Review,
  CreateReviewParams,
  CreateCommentParams,
  UpdateCommentParams,
  SubmitDecisionParams,
  ReviewComment,
  ReviewFeedback,
} from '../models'
import type { GitDiffEntry, ReviewGitContext } from '@/types/git'
import { useReviewStore } from '../../stores/reviewStore'
import { useGitStore } from '../../stores/gitStore'
import { useRunStore } from '../../stores/runStore'

/**
 * Review Manager
 *
 * 负责任务执行后的人类审查流程管理
 */
export class ReviewManager {
  private reviewStore = useReviewStore.getState()

  /**
   * 创建新审查
   *
   * @param params 创建参数
   * @returns 创建的审查
   */
  createReview(params: CreateReviewParams): Review {
    const review = this.reviewStore.createReview(params)
    console.log(`[ReviewManager] Review created: ${review.id} for run: ${params.runId}`)
    return review
  }

  /**
   * 开始审查
   *
   * @param reviewId 审查 ID
   */
  startReview(reviewId: string): void {
    this.reviewStore.updateReviewStatus(reviewId, 'in_progress')
    console.log(`[ReviewManager] Review started: ${reviewId}`)
  }

  /**
   * 添加评论
   *
   * @param reviewId 审查 ID
   * @param params 评论参数
   * @returns 创建的评论
   */
  addComment(reviewId: string, params: CreateCommentParams): ReviewComment {
    const comment = this.reviewStore.addComment(reviewId, params)
    console.log(`[ReviewManager] Comment added: ${comment.id} to review: ${reviewId}`)
    return comment
  }

  /**
   * 更新评论
   *
   * @param reviewId 审查 ID
   * @param commentId 评论 ID
   * @param updates 更新内容
   */
  updateComment(reviewId: string, commentId: string, updates: UpdateCommentParams): void {
    this.reviewStore.updateComment(reviewId, commentId, updates)
    console.log(`[ReviewManager] Comment updated: ${commentId}`)
  }

  /**
   * 删除评论
   *
   * @param reviewId 审查 ID
   * @param commentId 评论 ID
   */
  deleteComment(reviewId: string, commentId: string): void {
    this.reviewStore.deleteComment(reviewId, commentId)
    console.log(`[ReviewManager] Comment deleted: ${commentId}`)
  }

  /**
   * 解决评论
   *
   * @param reviewId 审查 ID
   * @param commentId 评论 ID
   */
  resolveComment(reviewId: string, commentId: string): void {
    this.reviewStore.resolveComment(reviewId, commentId)
    console.log(`[ReviewManager] Comment resolved: ${commentId}`)
  }

  /**
   * 取消解决评论
   *
   * @param reviewId 审查 ID
   * @param commentId 评论 ID
   */
  unresolveComment(reviewId: string, commentId: string): void {
    this.reviewStore.unresolveComment(reviewId, commentId)
    console.log(`[ReviewManager] Comment unresolved: ${commentId}`)
  }

  /**
   * 提交审查决策
   *
   * @param reviewId 审查 ID
   * @param params 决策参数
   */
  submitDecision(reviewId: string, params: SubmitDecisionParams): void {
    this.reviewStore.submitDecision(reviewId, params)
    console.log(`[ReviewManager] Decision submitted for review: ${reviewId}`, {
      approved: params.approved,
      needsRevision: params.needsRevision,
    })
  }

  /**
   * 从评论自动生成反馈
   *
   * @param reviewId 审查 ID
   * @returns 生成的反馈，如果没有则返回 null
   */
  generateFeedbackFromComments(reviewId: string): ReviewFeedback | null {
    const feedback = this.reviewStore.generateFeedbackFromComments(reviewId)
    if (feedback) {
      console.log(`[ReviewManager] Feedback generated for review: ${reviewId}`, feedback)
    }
    return feedback
  }

  /**
   * 获取审查
   *
   * @param reviewId 审查 ID
   * @returns 审查对象
   */
  getReview(reviewId: string): Review | undefined {
    return this.reviewStore.getReview(reviewId)
  }

  /**
   * 获取 Run 的审查
   *
   * @param runId Run ID
   * @returns 审查对象
   */
  getReviewByRun(runId: string): Review | undefined {
    return this.reviewStore.getReviewByRun(runId)
  }

  /**
   * 获取 Task 的所有审查
   *
   * @param taskId 任务 ID
   * @returns 审查列表
   */
  getReviewsByTask(taskId: string): Review[] {
    return this.reviewStore.getReviewsByTask(taskId)
  }

  /**
   * 删除审查
   *
   * @param reviewId 审查 ID
   */
  deleteReview(reviewId: string): void {
    this.reviewStore.deleteReview(reviewId)
    console.log(`[ReviewManager] Review deleted: ${reviewId}`)
  }

  /**
   * 将反馈转换为 Agent Prompt
   *
   * @param feedback 反馈
   * @returns Agent Prompt
   */
  feedbackToPrompt(feedback: ReviewFeedback): string {
    const sections: string[] = []

    switch (feedback.type) {
      case 'fix_issue':
        sections.push('## 需要修复的问题')
        sections.push(feedback.content)
        break

      case 'improve':
        sections.push('## 改进建议')
        sections.push(feedback.content)
        break

      case 'retry':
        sections.push('## 请重试')
        sections.push(feedback.content)
        break

      case 'change_approach':
        sections.push('## 请换一种方法')
        sections.push(feedback.content)
        break
    }

    const affectedFiles = feedback.affectedFiles && feedback.affectedFiles.length > 0
      ? `\n涉及文件：\n${feedback.affectedFiles.map(f => `  - ${f}`).join('\n')}`
      : ''

    return `
<review_feedback>
这是人类对你之前执行的审查反馈，请仔细阅读并相应修改你的方案：

${sections.join('\n')}${affectedFiles}

---

请基于以上反馈重新执行任务，确保：
1. 直接回应反馈中指出的问题
2. 解释你做了哪些调整
3. 如果认为反馈有误，请说明原因
</review_feedback>
`
  }

  /**
   * 准备下次执行的上下文（防止上下文膨胀）
   *
   * @param feedback 反馈列表
   * @returns 过滤后的反馈列表
   */
  prepareNextRunContext(feedback: ReviewFeedback[]): ReviewFeedback[] {
    // 只取高优先级和中优先级的反馈
    const activeFeedback = feedback.filter(f => f.priority === 'high' || f.priority === 'medium')

    // 最多保留 3 条反馈
    if (activeFeedback.length > 3) {
      // 优先保留高优先级的
      const highPriority = activeFeedback.filter(f => f.priority === 'high')
      const mediumPriority = activeFeedback.filter(f => f.priority === 'medium')

      return [
        ...highPriority,
        ...mediumPriority.slice(0, 3 - highPriority.length),
      ]
    }

    return activeFeedback
  }

  // ========================================================================
  // Git 集成方法
  // ========================================================================

  /**
   * 为 Run 创建带 Git 上下文的审查
   *
   * @param runId Run ID
   * @param taskId Task ID
   * @param workspacePath 工作区路径
   * @returns 创建的审查
   */
  async createReviewWithGitContext(
    runId: string,
    taskId: string,
    workspacePath: string
  ): Promise<Review> {
    const gitStore = useGitStore.getState()
    const runStore = useRunStore.getState()

    // 获取 Run 信息
    const run = runStore.getRun(runId)
    if (!run) {
      throw new Error(`Run not found: ${runId}`)
    }

    // 检查是否为 Git 仓库
    const isRepo = await gitStore.isRepository(workspacePath)

    let gitContext: ReviewGitContext | undefined
    let diffSnapshots: GitDiffEntry[] = []

    if (isRepo) {
      // 获取 Git 状态
      await gitStore.refreshStatus(workspacePath)
      const status = gitStore.status

      if (status && !status.isEmpty) {
        // 获取当前 commit 和基准 commit
        const currentCommit = status.commit
        // 获取父 commit 作为基准
        const baseCommit = await this.getParentCommit(workspacePath, currentCommit)

        // 获取 Diff
        await gitStore.getDiffs(workspacePath, baseCommit)

        gitContext = {
          baseCommit,
          currentCommit,
          branch: status.branch,
          changedFiles: gitStore.getChangedFiles(),
          diffsAvailable: true,
        }

        diffSnapshots = gitStore.diffs
      }
    }

    // 创建 Review
    const review = this.createReview({
      runId,
      taskId,
      gitContext,
    })

    // 保存 Diff 快照
    if (diffSnapshots.length > 0) {
      this.reviewStore.setDiffSnapshots(review.id, diffSnapshots)
    }

    return review
  }

  /**
   * 获取父 commit SHA
   */
  private async getParentCommit(workspacePath: string, commitSha: string): Promise<string> {
    // 这里可以调用 Git 命令获取父 commit
    // 简化处理：假设 HEAD~1 是父 commit
    // 实际应该通过 git log 或 git2 库获取
    return commitSha + '~1'
  }

  /**
   * 为文件添加行级评论
   *
   * @param reviewId 审查 ID
   * @param filePath 文件路径
   * @param line 行号
   * @param content 评论内容
   * @param type 评论类型
   * @param priority 优先级
   * @returns 创建的评论
   */
  addFileComment(
    reviewId: string,
    filePath: string,
    line: number | undefined,
    content: string,
    type: CreateCommentParams['type'],
    priority: CreateCommentParams['priority'] = 'medium'
  ): ReviewComment {
    return this.addComment(reviewId, {
      filePath,
      line,
      content,
      type,
      priority,
    })
  }

  /**
   * 从评论生成 Git 友好的反馈
   *
   * @param reviewId 审查 ID
   * @returns Markdown 格式的反馈
   */
  generateGitFeedback(reviewId: string): string {
    const review = this.getReview(reviewId)
    if (!review) return ''

    const comments = review.comments.filter((c) => !c.resolved)

    let feedback = `# 代码审查反馈\n\n`

    // 按文件分组
    const byFile = new Map<string, typeof comments>()
    comments.forEach((c) => {
      const file = c.filePath || '其他'
      if (!byFile.has(file)) byFile.set(file, [])
      byFile.get(file)!.push(c)
    })

    byFile.forEach((fileComments, file) => {
      feedback += `## ${file}\n\n`

      fileComments.forEach((c) => {
        const icon = {
          issue: '❌',
          suggestion: '💡',
          question: '❓',
          approval: '✅',
        }[c.type]

        const line = c.line ? `:${c.line}` : ''
        feedback += `- [${icon}]${line} ${c.content}\n`
      })

      feedback += '\n'
    })

    return feedback
  }

  /**
   * 获取 Review 的 Git 上下文
   *
   * @param reviewId 审查 ID
   * @returns Git 上下文
   */
  getGitContext(reviewId: string): ReviewGitContext | undefined {
    const review = this.getReview(reviewId)
    return review?.gitContext
  }

  /**
   * 获取 Review 的 Diff 快照
   *
   * @param reviewId 审查 ID
   * @returns Diff 快照
   */
  getDiffSnapshots(reviewId: string): GitDiffEntry[] {
    const review = this.getReview(reviewId)
    return review?.diffSnapshots || []
  }

  /**
   * 按文件分组评论
   *
   * @param reviewId 审查 ID
   * @returns 文件 -> 评论列表的映射
   */
  getCommentsByFile(reviewId: string): Map<string, ReviewComment[]> {
    const review = this.getReview(reviewId)
    if (!review) return new Map()

    const byFile = new Map<string, ReviewComment[]>()
    review.comments.forEach((c) => {
      const file = c.filePath || '__root__'
      if (!byFile.has(file)) byFile.set(file, [])
      byFile.get(file)!.push(c)
    })

    return byFile
  }
}

/**
 * 单例 Review Manager
 */
let reviewManagerInstance: ReviewManager | null = null

/**
 * 获取 Review Manager 单例
 */
export function getReviewManager(): ReviewManager {
  if (!reviewManagerInstance) {
    reviewManagerInstance = new ReviewManager()
  }
  return reviewManagerInstance
}
