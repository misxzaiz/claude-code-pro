/**
 * Review Panel
 *
 * 审查面板，用于人类审查 Agent 执行结果并提供反馈
 */

import { useEffect, useState } from 'react'
import { useRunStore } from '../../stores/runStore'
import { useReviewStore } from '../../stores/reviewStore'
import { getReviewManager, getTaskManager } from '../../core'
import { SnapshotViewer } from './SnapshotViewer'
import { CommentList } from './CommentList'
import { DecisionForm } from './DecisionForm'

interface ReviewPanelProps {
  runId: string
  taskId: string
}

export function ReviewPanel({ runId, taskId }: ReviewPanelProps) {
  const { loadFullRun } = useRunStore()
  const { getReviewByRun, createReview } = useReviewStore()
  const [run, setRun] = useState<any>(null)
  const [review, setReview] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadRunAndReview = async () => {
      setLoading(true)

      // 加载完整 Run
      const runData = await loadFullRun(runId)
      setRun(runData)

      // 获取或创建审查
      let reviewData = getReviewByRun(runId)
      if (!reviewData && runData?.snapshot) {
        reviewData = createReview({ runId, taskId })
      }
      setReview(reviewData)

      setLoading(false)
    }

    loadRunAndReview()
  }, [runId, taskId, loadFullRun, getReviewByRun, createReview])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-secondary">加载中...</div>
      </div>
    )
  }

  if (!run) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-secondary">执行记录不存在</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 快照查看器 */}
      <div className="flex-1 overflow-y-auto">
        <SnapshotViewer snapshot={run.snapshot} />
      </div>

      {/* 审查区域 */}
      {run.snapshot && (
        <div className="border-t border-border-subtle">
          {/* 评论列表 */}
          {review && (
            <CommentList
              review={review}
              onAddComment={(comment) => {
                getReviewManager().addComment(review.id, comment)
              }}
            />
          )}

          {/* 决策表单 */}
          {review && review.status !== 'approved' && review.status !== 'rejected' && (
            <DecisionForm
              review={review}
              onSubmit={(decision) => {
                getReviewManager().submitDecision(review.id, decision)

                // 如果需要修订，启动新的 Run
                if (decision.needsRevision && review.feedback) {
                  getTaskManager().retryTaskFromReview(taskId, review.id)
                } else if (decision.approved) {
                  getTaskManager().completeTask(taskId)
                }
              }}
            />
          )}

          {/* 已完成/已拒绝的提示 */}
          {(review?.status === 'approved' || review?.status === 'rejected') && (
            <div className="p-4 bg-background-elevated border-t border-border-subtle">
              <div className={`flex items-center gap-2 ${
                review.status === 'approved' ? 'text-green-600' : 'text-red-600'
              }`}>
                {review.status === 'approved' ? (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">审查通过</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">审查拒绝</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
