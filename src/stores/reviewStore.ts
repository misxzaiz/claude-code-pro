/**
 * Review Store
 *
 * 管理审查状态
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Review,
  ReviewStatus,
  ReviewComment,
  CreateCommentParams,
  UpdateCommentParams,
  SubmitDecisionParams,
  CreateReviewParams,
  ReviewDecision,
  ReviewFeedback,
} from '../core/models'

/**
 * Review Store 状态
 */
interface ReviewState {
  /** 所有审查 */
  reviews: Record<string, Review>

  /** 当前选中的审查 ID */
  selectedReviewId: string | null

  /** 加载状态 */
  isLoading: boolean

  /** 错误信息 */
  error: string | null
}

/**
 * Review Store 操作
 */
interface ReviewActions {
  /** 获取所有审查 */
  getAllReviews: () => Review[]

  /** 获取单个审查 */
  getReview: (id: string) => Review | undefined

  /** 获取 Run 的审查 */
  getReviewByRun: (runId: string) => Review | undefined

  /** 获取 Task 的所有审查 */
  getReviewsByTask: (taskId: string) => Review[]

  /** 创建审查 */
  createReview: (params: CreateReviewParams) => Review

  /** 更新审查状态 */
  updateReviewStatus: (id: string, status: ReviewStatus) => void

  /** 添加评论 */
  addComment: (reviewId: string, params: CreateCommentParams) => ReviewComment

  /** 更新评论 */
  updateComment: (reviewId: string, commentId: string, updates: UpdateCommentParams) => void

  /** 删除评论 */
  deleteComment: (reviewId: string, commentId: string) => void

  /** 解决评论 */
  resolveComment: (reviewId: string, commentId: string) => void

  /** 取消解决评论 */
  unresolveComment: (reviewId: string, commentId: string) => void

  /** 提交审查决策 */
  submitDecision: (reviewId: string, params: SubmitDecisionParams) => void

  /** 生成反馈（从评论） */
  generateFeedbackFromComments: (reviewId: string) => ReviewFeedback | null

  /** 删除审查 */
  deleteReview: (id: string) => void

  /** 按状态获取审查 */
  getReviewsByStatus: (status: ReviewStatus) => Review[]

  /** 设置选中审查 */
  setSelectedReview: (id: string | null) => void

  /** 清空所有审查 */
  clearReviews: () => void

  /** 设置加载状态 */
  setLoading: (loading: boolean) => void

  /** 设置错误信息 */
  setError: (error: string | null) => void
}

/**
 * Review Store 类型
 */
export type ReviewStore = ReviewState & ReviewActions

/**
 * 创建 Review Store
 */
export const useReviewStore = create<ReviewStore>()(
  persist(
    (set, get) => ({
      // ========== 状态 ==========

      reviews: {},
      selectedReviewId: null,
      isLoading: false,
      error: null,

      // ========== 操作 ==========

      getAllReviews: () => {
        return Object.values(get().reviews).sort(
          (a, b) => b.startedAt - a.startedAt
        )
      },

      getReview: (id: string) => {
        return get().reviews[id]
      },

      getReviewByRun: (runId: string) => {
        return Object.values(get().reviews).find(review => review.runId === runId)
      },

      getReviewsByTask: (taskId: string) => {
        return Object.values(get().reviews)
          .filter(review => review.taskId === taskId)
          .sort((a, b) => b.startedAt - a.startedAt)
      },

      createReview: (params: CreateReviewParams) => {
        const now = Date.now()
        const review: Review = {
          id: crypto.randomUUID(),
          runId: params.runId,
          taskId: params.taskId,
          status: 'pending',
          comments: [],
          startedAt: now,
        }

        set(state => ({
          reviews: { ...state.reviews, [review.id]: review },
        }))

        return review
      },

      updateReviewStatus: (id: string, status: ReviewStatus) => {
        const review = get().reviews[id]
        if (!review) {
          return
        }

        const updatedReview: Review = {
          ...review,
          status,
          completedAt: status === 'approved' || status === 'rejected' || status === 'needs_revision'
            ? Date.now()
            : review.completedAt,
        }

        set(state => ({
          reviews: { ...state.reviews, [id]: updatedReview },
        }))
      },

      addComment: (reviewId: string, params: CreateCommentParams) => {
        const review = get().reviews[reviewId]
        if (!review) {
          throw new Error(`Review not found: ${reviewId}`)
        }

        const now = Date.now()
        const comment: ReviewComment = {
          id: crypto.randomUUID(),
          messageId: params.messageId,
          toolCallId: params.toolCallId,
          filePath: params.filePath,
          selectedText: params.selectedText,
          content: params.content,
          type: params.type,
          priority: params.priority || 'medium',
          createdAt: now,
          updatedAt: now,
          resolved: false,
        }

        const updatedReview: Review = {
          ...review,
          comments: [...review.comments, comment],
        }

        set(state => ({
          reviews: { ...state.reviews, [reviewId]: updatedReview },
        }))

        return comment
      },

      updateComment: (reviewId: string, commentId: string, updates: UpdateCommentParams) => {
        const review = get().reviews[reviewId]
        if (!review) {
          return
        }

        const updatedComments = review.comments.map(comment => {
          if (comment.id === commentId) {
            return {
              ...comment,
              ...updates,
              updatedAt: Date.now(),
              resolvedAt: updates.resolved && !comment.resolved ? Date.now() : comment.resolvedAt,
            }
          }
          return comment
        })

        set(state => ({
          reviews: {
            ...state.reviews,
            [reviewId]: { ...review, comments: updatedComments },
          },
        }))
      },

      deleteComment: (reviewId: string, commentId: string) => {
        const review = get().reviews[reviewId]
        if (!review) {
          return
        }

        set(state => ({
          reviews: {
            ...state.reviews,
            [reviewId]: {
              ...review,
              comments: review.comments.filter(c => c.id !== commentId),
            },
          },
        }))
      },

      resolveComment: (reviewId: string, commentId: string) => {
        get().updateComment(reviewId, commentId, { resolved: true })
      },

      unresolveComment: (reviewId: string, commentId: string) => {
        get().updateComment(reviewId, commentId, { resolved: false })
      },

      submitDecision: (reviewId: string, params: SubmitDecisionParams) => {
        const review = get().reviews[reviewId]
        if (!review) {
          return
        }

        const now = Date.now()
        const decision: ReviewDecision = {
          approved: params.approved,
          needsRevision: params.needsRevision,
          overallRating: params.overallRating,
          notes: params.notes,
          decidedAt: now,
        }

        let updatedReview: Review = {
          ...review,
          decision,
          completedAt: now,
        }

        // 根据决策更新状态
        if (params.approved) {
          updatedReview.status = 'approved'
        } else if (params.needsRevision) {
          updatedReview.status = 'needs_revision'
          // 自动生成反馈
          if (params.generateFeedback) {
            const feedback = get().generateFeedbackFromComments(reviewId)
            if (feedback) {
              updatedReview.feedback = feedback
            }
          }
        } else {
          updatedReview.status = 'rejected'
        }

        set(state => ({
          reviews: { ...state.reviews, [reviewId]: updatedReview },
        }))
      },

      generateFeedbackFromComments: (reviewId: string) => {
        const review = get().reviews[reviewId]
        if (!review) {
          return null
        }

        // 只考虑未解决的评论
        const unresolvedComments = review.comments.filter(c => !c.resolved)

        // 按 type 分组
        const issues = unresolvedComments.filter(c => c.type === 'issue')
        const suggestions = unresolvedComments.filter(c => c.type === 'suggestion')

        // 优先处理 issue
        if (issues.length > 0) {
          const feedback: ReviewFeedback = {
            type: 'fix_issue',
            content: issues
              .map(c => `• ${c.filePath ? `[${c.filePath}] ` : ''}${c.content}`)
              .join('\n'),
            affectedFiles: [...new Set(issues.map(c => c.filePath).filter(Boolean) as string[])],
            priority: issues.some(c => c.priority === 'high') ? 'high' : 'medium',
            relatedCommentIds: issues.map(c => c.id),
          }
          return feedback
        }

        // 其次处理 suggestion
        if (suggestions.length > 0) {
          const feedback: ReviewFeedback = {
            type: 'improve',
            content: suggestions
              .map(c => `• ${c.filePath ? `[${c.filePath}] ` : ''}${c.content}`)
              .join('\n'),
            affectedFiles: [...new Set(suggestions.map(c => c.filePath).filter(Boolean) as string[])],
            priority: 'low',
            relatedCommentIds: suggestions.map(c => c.id),
          }
          return feedback
        }

        return null
      },

      deleteReview: (id: string) => {
        set(state => {
          const newReviews = { ...state.reviews }
          delete newReviews[id]
          return { reviews: newReviews }
        })

        if (get().selectedReviewId === id) {
          set({ selectedReviewId: null })
        }
      },

      getReviewsByStatus: (status: ReviewStatus) => {
        return Object.values(get().reviews)
          .filter(review => review.status === status)
          .sort((a, b) => b.startedAt - a.startedAt)
      },

      setSelectedReview: (id: string | null) => {
        set({ selectedReviewId: id })
      },

      clearReviews: () => {
        set({ reviews: {}, selectedReviewId: null })
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      setError: (error: string | null) => {
        set({ error })
      },
    }),
    {
      name: 'polaris-reviews',
      partialize: (state) => ({
        reviews: state.reviews,
        selectedReviewId: state.selectedReviewId,
      }),
    }
  )
)
