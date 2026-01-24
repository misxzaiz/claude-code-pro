/**
 * Comment List
 *
 * 评论列表，展示所有审查评论
 */

import { useState } from 'react'
import type { Review, CreateCommentParams } from '../../core/models'

interface CommentListProps {
  review: Review
  onAddComment: (comment: Omit<CreateCommentParams, 'messageId' | 'toolCallId' | 'filePath'>) => void
}

export function CommentList({ review, onAddComment }: CommentListProps) {
  const [newComment, setNewComment] = useState('')
  const [commentType, setCommentType] = useState<'suggestion' | 'issue' | 'question'>('suggestion')

  const handleSubmit = () => {
    if (!newComment.trim()) return

    onAddComment({
      content: newComment,
      type: commentType,
      priority: 'medium',
    })

    setNewComment('')
  }

  return (
    <div className="p-4 border-t border-border-subtle">
      <h3 className="font-semibold text-text-primary mb-3">评论 ({review.comments.length})</h3>

      {/* 评论列表 */}
      <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
        {review.comments.length === 0 ? (
          <div className="text-center text-text-secondary text-sm py-4">
            暂无评论，添加评论来反馈你的意见
          </div>
        ) : (
          review.comments.map(comment => (
            <div
              key={comment.id}
              className={`p-3 rounded-lg border ${
                comment.resolved
                  ? 'bg-green-50 border-green-200 opacity-60'
                  : 'bg-background border-border'
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    comment.type === 'issue' ? 'bg-red-100 text-red-700' :
                    comment.type === 'suggestion' ? 'bg-blue-100 text-blue-700' :
                    comment.type === 'question' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {comment.type === 'issue' ? '问题' :
                     comment.type === 'suggestion' ? '建议' :
                     comment.type === 'question' ? '疑问' : '通过'}
                  </span>
                  {comment.resolved && (
                    <span className="text-xs text-green-600">已解决</span>
                  )}
                </div>
                <span className="text-xs text-text-tertiary">
                  {new Date(comment.createdAt).toLocaleTimeString('zh-CN')}
                </span>
              </div>
              <p className="text-sm text-text-primary">{comment.content}</p>
            </div>
          ))
        )}
      </div>

      {/* 添加评论 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <select
            value={commentType}
            onChange={(e) => setCommentType(e.target.value as any)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-text-primary"
          >
            <option value="suggestion">建议</option>
            <option value="issue">问题</option>
            <option value="question">疑问</option>
          </select>
        </div>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="添加评论..."
          rows={2}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-text-primary placeholder-text-tertiary resize-none"
        />
        <button
          onClick={handleSubmit}
          disabled={!newComment.trim()}
          className="px-4 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          添加评论
        </button>
      </div>
    </div>
  )
}
