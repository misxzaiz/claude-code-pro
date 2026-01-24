/**
 * Git 审查面板
 *
 * 结合 Git Diff 和代码评论的审查面板
 */

import React, { useState, useEffect } from 'react'
import { useReviewStore } from '@/stores/reviewStore'
import { useGitStore } from '@/stores/gitStore'
import { getReviewManager } from '@/core/managers/ReviewManager'
import {
  FileText,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Plus,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { DiffViewer } from '@/components/Diff/DiffViewer'
import { Button } from '@/components/ui/Button'
import type { GitDiffEntry, ReviewComment } from '@/types'

interface GitReviewPanelProps {
  reviewId: string
  className?: string
}

export function GitReviewPanel({ reviewId, className = '' }: GitReviewPanelProps) {
  const review = useReviewStore((s) => s.getReview(reviewId))
  const { diffs } = useGitStore()
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [selectedComment, setSelectedComment] = useState<string | null>(null)

  // 获取 Diff 快照或使用当前的 Git diffs
  const displayDiffs = review?.diffSnapshots || diffs

  // 按文件分组评论
  const commentsByFile = React.useMemo(() => {
    const byFile = new Map<string, ReviewComment[]>()
    review?.comments.forEach((c) => {
      const file = c.filePath || '__root__'
      if (!byFile.has(file)) byFile.set(file, [])
      byFile.get(file)!.push(c)
    })
    return byFile
  }, [review?.comments])

  // 切换文件展开状态
  const toggleFile = (filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) {
        next.delete(filePath)
      } else {
        next.add(filePath)
      }
      return next
    })
  }

  if (!review) {
    return (
      <div className={`git-review-panel not-found ${className}`}>
        <AlertCircle size={20} />
        <p>审查不存在</p>
      </div>
    )
  }

  // 统计信息
  const totalComments = review.comments.length
  const unresolvedComments = review.comments.filter((c) => !c.resolved).length

  return (
    <div className={`git-review-panel ${className}`}>
      {/* 头部信息 */}
      <div className="review-header">
        <div className="review-info">
          <h3 className="review-title">代码变更审查</h3>

          {review.gitContext && (
            <div className="git-context">
              <span className="branch">{review.gitContext.branch}</span>
              <span className="commit">{review.gitContext.baseCommit.slice(0, 8)}</span>
              <span>→</span>
              <span className="commit">{review.gitContext.currentCommit.slice(0, 8)}</span>
            </div>
          )}
        </div>

        <div className="review-stats">
          <span className="stat">
            <MessageSquare size={14} />
            {unresolvedComments}/{totalComments}
          </span>

          {review.status === 'approved' && (
            <span className="stat approved">
              <CheckCircle size={14} />
              已通过
            </span>
          )}
          {review.status === 'rejected' && (
            <span className="stat rejected">
              <AlertCircle size={14} />
              已拒绝
            </span>
          )}
        </div>
      </div>

      {/* 文件列表 + Diff + 评论 */}
      <div className="review-content">
        {displayDiffs.length === 0 ? (
          <div className="empty-state">
            <FileText size={32} className="text-gray-500" />
            <p>没有文件变更</p>
          </div>
        ) : (
          <div className="diff-list">
            {displayDiffs.map((diff) => {
              const isExpanded = expandedFiles.has(diff.filePath)
              const fileComments = commentsByFile.get(diff.filePath) || []
              const unresolvedCount = fileComments.filter((c) => !c.resolved).length

              return (
                <div key={diff.filePath} className={`diff-item ${diff.changeType}`}>
                  {/* 文件头 */}
                  <div className="file-header" onClick={() => toggleFile(diff.filePath)}>
                    <button className="expand-btn">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    <FileText size={14} />
                    <span className="file-name">{diff.filePath}</span>

                    <span className={`change-type-badge ${diff.changeType}`}>
                      {getChangeTypeText(diff.changeType)}
                    </span>

                    {fileComments.length > 0 && (
                      <span className="comment-count">
                        <MessageSquare size={12} />
                        {unresolvedCount > 0 ? `${unresolvedCount}/` : ''}
                        {fileComments.length}
                      </span>
                    )}
                  </div>

                  {/* 展开内容：Diff + 评论 */}
                  {isExpanded && (
                    <div className="file-content">
                      {/* Diff 展示 */}
                      {diff.contentOmitted ? (
                        <div className="diff-omitted">
                          <p>文件内容过大，已省略显示</p>
                        </div>
                      ) : diff.isBinary ? (
                        <div className="diff-binary">
                          <p>二进制文件</p>
                        </div>
                      ) : (
                        <DiffViewer
                          oldValue={diff.oldContent || ''}
                          newValue={diff.newContent || ''}
                          filename={diff.filePath}
                          language={getLanguage(diff.filePath)}
                        />
                      )}

                      {/* 文件级评论 */}
                      {fileComments.length > 0 && (
                        <div className="file-comments">
                          {fileComments.map((comment) => (
                            <div
                              key={comment.id}
                              className={`review-comment ${comment.type} ${comment.resolved ? 'resolved' : ''}`}
                            >
                              <div className="comment-header">
                                <span className={`comment-type-badge ${comment.type}`}>
                                  {getCommentTypeText(comment.type)}
                                </span>

                                {comment.line && (
                                  <span className="comment-line">:{comment.line}</span>
                                )}

                                <span className={`comment-priority ${comment.priority}`}>
                                  {getPriorityText(comment.priority)}
                                </span>

                                {comment.resolved && (
                                  <span className="resolved-badge">
                                    <CheckCircle size={12} />
                                    已解决
                                  </span>
                                )}
                              </div>

                              <p className="comment-content">{comment.content}</p>

                              <div className="comment-actions">
                                {!comment.resolved && (
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => {
                                      getReviewManager().resolveComment(reviewId, comment.id)
                                    }}
                                  >
                                    标记为已解决
                                  </Button>
                                )}
                                {comment.resolved && (
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => {
                                      getReviewManager().unresolveComment(reviewId, comment.id)
                                    }}
                                  >
                                    取消解决
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}

                          {/* 添加评论按钮 */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="add-comment-btn"
                            onClick={() => {
                              const content = prompt('请输入评论:')
                              if (content) {
                                const type = prompt('评论类型 (issue/suggestion/question/approval):', 'suggestion')
                                if (type && ['issue', 'suggestion', 'question', 'approval'].includes(type)) {
                                  getReviewManager().addFileComment(
                                    reviewId,
                                    diff.filePath,
                                    undefined,
                                    content,
                                    type as any,
                                    'medium'
                                  )
                                }
                              }
                            }}
                          >
                            <Plus size={14} />
                            添加评论
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 审查决策 */}
      {review.status === 'in_progress' && (
        <div className="review-decision">
          <p>审查后请提交决策：</p>
          <div className="decision-actions">
            <Button
              variant="primary"
              onClick={() => {
                getReviewManager().submitDecision(reviewId, {
                  approved: true,
                  needsRevision: false,
                })
              }}
            >
              <CheckCircle size={16} />
              通过
            </Button>

            <Button
              variant="danger"
              onClick={() => {
                getReviewManager().submitDecision(reviewId, {
                  approved: false,
                  needsRevision: true,
                })
              }}
            >
              <AlertCircle size={16} />
              需要修订
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// 辅助函数
function getChangeTypeText(type: GitDiffEntry['changeType']): string {
  const map: Record<GitDiffEntry['changeType'], string> = {
    added: '新增',
    deleted: '删除',
    modified: '修改',
    renamed: '重命名',
    copied: '复制',
  }
  return map[type]
}

function getCommentTypeText(type: ReviewComment['type']): string {
  const map: Record<ReviewComment['type'], string> = {
    issue: '问题',
    suggestion: '建议',
    question: '疑问',
    approval: '认可',
  }
  return map[type]
}

function getPriorityText(priority: ReviewComment['priority']): string {
  const map: Record<ReviewComment['priority'], string> = {
    high: '高',
    medium: '中',
    low: '低',
  }
  return map[priority]
}

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()

  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    rs: 'rust',
    go: 'go',
    py: 'python',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    kt: 'kotlin',
    swift: 'swift',
    sh: 'bash',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    md: 'markdown',
    sql: 'sql',
  }

  return languageMap[ext || ''] || 'text'
}
