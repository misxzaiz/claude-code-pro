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
import { useReviewStore } from '../../stores/reviewStore'

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
