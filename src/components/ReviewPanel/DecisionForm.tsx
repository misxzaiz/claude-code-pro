/**
 * Decision Form
 *
 * 决策表单，用于提交审查决策
 */

import { useState } from 'react'
import type { Review, SubmitDecisionParams } from '../../core/models'

interface DecisionFormProps {
  review: Review
  onSubmit: (decision: SubmitDecisionParams) => void
}

export function DecisionForm({ review, onSubmit }: DecisionFormProps) {
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved')
  const [notes, setNotes] = useState('')

  const handleSubmit = () => {
    onSubmit({
      approved: decision === 'approved',
      needsRevision: decision !== 'approved',
      overallRating: decision === 'approved' ? 5 : 2,
      notes: notes || undefined,
      generateFeedback: true,
    })
  }

  // 从评论自动生成预览
  const issueCount = review.comments.filter(c => c.type === 'issue' && !c.resolved).length
  const suggestionCount = review.comments.filter(c => c.type === 'suggestion' && !c.resolved).length

  return (
    <div className="p-4 bg-background-elevated border-t border-border-subtle">
      <h3 className="font-semibold text-text-primary mb-3">审查决策</h3>

      {/* 问题/建议统计 */}
      {(issueCount > 0 || suggestionCount > 0) && (
        <div className="mb-3 p-3 bg-background rounded-lg border border-border">
          <div className="text-sm text-text-secondary">
            {issueCount > 0 && (
              <div className="flex items-center gap-2 text-red-600">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{issueCount} 个问题</span>
              </div>
            )}
            {suggestionCount > 0 && (
              <div className="flex items-center gap-2 text-blue-600 mt-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
                <span>{suggestionCount} 条建议</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 决策按钮 */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => setDecision('approved')}
          className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
            decision === 'approved'
              ? 'border-green-500 bg-green-50 text-green-700'
              : 'border-border bg-background text-text-primary hover:border-green-300'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">通过</span>
          </div>
        </button>
        <button
          onClick={() => setDecision('rejected')}
          className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
            decision === 'rejected'
              ? 'border-orange-500 bg-orange-50 text-orange-700'
              : 'border-border bg-background text-text-primary hover:border-orange-300'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">需要修订</span>
          </div>
        </button>
      </div>

      {/* 备注 */}
      <div className="mb-3">
        <label className="block text-sm font-medium text-text-secondary mb-1">
          决策备注（可选）
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="添加决策备注..."
          rows={2}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-text-primary placeholder-text-tertiary resize-none"
        />
      </div>

      {/* 提交按钮 */}
      <button
        onClick={handleSubmit}
        className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors font-medium"
      >
        {decision === 'approved' ? '通过并完成任务' : '提交并要求修订'}
      </button>
    </div>
  )
}
