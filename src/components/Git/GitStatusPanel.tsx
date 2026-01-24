/**
 * Git 状态面板
 *
 * 显示当前 Git 仓库状态、文件变更、分支信息等
 */

import React, { useEffect, useState } from 'react'
import { useGitStore } from '@/stores/gitStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  RefreshCw,
  Plus,
  AlertCircle,
  CheckCircle,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { generateCommitMessage } from '@/services/aiCommitService'

interface GitStatusPanelProps {
  className?: string
}

export function GitStatusPanel({ className = '' }: GitStatusPanelProps) {
  const {
    status,
    branches,
    isLoading,
    error,
    refreshStatus,
    getBranches,
    hasChanges,
    commitChanges,
    createBranch,
    clearError,
  } = useGitStore()

  const workspace = useWorkspaceStore((s) => s.currentWorkspace)
  const [commitMessage, setCommitMessage] = useState('')
  const [showCommitInput, setShowCommitInput] = useState(false)

  // 初始化时加载状态
  useEffect(() => {
    if (workspace?.path) {
      refreshStatus(workspace.path)
      getBranches(workspace.path)
    }
  }, [workspace?.path])

  // 处理提交
  const handleCommit = async () => {
    if (!workspace || !commitMessage.trim()) return

    try {
      await commitChanges(workspace.path, commitMessage, true)
      setCommitMessage('')
      setShowCommitInput(false)
    } catch (err) {
      console.error('提交失败:', err)
    }
  }

  // 处理创建分支
  const handleCreateBranch = async () => {
    if (!workspace) return

    const name = prompt('请输入新分支名称:')
    if (!name) return

    try {
      await createBranch(workspace.path, name, false)
    } catch (err) {
      console.error('创建分支失败:', err)
    }
  }

  // 非仓库状态
  if (!workspace) {
    return (
      <div className={`git-status-panel empty ${className}`}>
        <p>请先选择一个工作区</p>
      </div>
    )
  }

  if (status && !status.exists) {
    return (
      <div className={`git-status-panel not-repo ${className}`}>
        <AlertCircle size={16} />
        <span>当前工作区不是 Git 仓库</span>
        <Button size="sm" variant="ghost" onClick={handleCreateBranch}>
          初始化仓库
        </Button>
      </div>
    )
  }

  // 加载状态
  if (isLoading && !status) {
    return (
      <div className={`git-status-panel loading ${className}`}>
        <RefreshCw size={16} className="animate-spin" />
        <span>加载中...</span>
      </div>
    )
  }

  // 错误状态
  if (error) {
    return (
      <div className={`git-status-panel error ${className}`}>
        <AlertCircle size={16} />
        <span>{error}</span>
        <Button size="sm" variant="ghost" onClick={() => clearError()}>
          关闭
        </Button>
        <Button size="sm" variant="ghost" onClick={() => workspace?.path && refreshStatus(workspace.path)}>
          重试
        </Button>
      </div>
    )
  }

  // 空仓库
  if (status?.isEmpty) {
    return (
      <div className={`git-status-panel empty-repo ${className}`}>
        <GitCommit size={16} />
        <span>空仓库，还没有任何提交</span>
      </div>
    )
  }

  return (
    <div className={`git-status-panel ${className}`}>
      {/* 分支和提交信息 */}
      {status && (
        <div className="git-header">
          <div className="branch-info">
            <GitBranch size={14} />
            <span className="branch-name">{status.branch}</span>
          </div>

          <div className="commit-info">
            <GitCommit size={14} />
            <code className="commit-sha">{status.shortCommit}</code>
          </div>

          {(status.ahead > 0 || status.behind > 0) && (
            <div className="sync-status">
              {status.ahead > 0 && (
                <span className="badge ahead" title={`领先 ${status.ahead} 个提交`}>
                  +{status.ahead}
                </span>
              )}
              {status.behind > 0 && (
                <span className="badge behind" title={`落后 ${status.behind} 个提交`}>
                  -{status.behind}
                </span>
              )}
            </div>
          )}

          <Button
            size="xs"
            variant="ghost"
            className="refresh-btn"
            onClick={() => refreshStatus(workspace.path)}
          >
            <RefreshCw size={12} />
          </Button>
        </div>
      )}

      {/* 已暂存的变更 */}
      {status?.staged.length > 0 && (
        <div className="change-section staged">
          <h4 className="section-title">
            <CheckCircle size={14} />
            已暂存
            <span className="count">({status.staged.length})</span>
          </h4>

          <div className="file-list">
            {status.staged.map((file) => (
              <div key={file.path} className={`file-item ${file.status}`}>
                <span className="file-path">{file.path}</span>
                <span className={`file-status status-${file.status}`}>
                  {getStatusText(file.status)}
                </span>
                {(file.additions || file.deletions) && (
                  <span className="file-stats">
                    {file.additions && <span className="additions">+{file.additions}</span>}
                    {file.deletions && <span className="deletions">-{file.deletions}</span>}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* 提交操作 */}
          <div className="actions">
            {!showCommitInput ? (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setShowCommitInput(true)}
                >
                  <GitCommit size={14} />
                  提交
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    if (!workspace) return
                    try {
                      const message = await generateCommitMessage(workspace.path)
                      setCommitMessage(message)
                      setShowCommitInput(true)
                    } catch (err) {
                      console.error('AI 生成失败:', err)
                      alert('AI 生成提交消息失败: ' + (err instanceof Error ? err.message : String(err)))
                    }
                  }}
                  disabled={isLoading}
                  title="使用 AI 生成提交消息"
                >
                  <Sparkles size={14} />
                  AI 生成
                </Button>
              </>
            ) : (
              <div className="commit-input-wrapper">
                <input
                  type="text"
                  className="commit-input"
                  placeholder="输入提交消息..."
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCommit()
                    if (e.key === 'Escape') {
                      setShowCommitInput(false)
                      setCommitMessage('')
                    }
                  }}
                  autoFocus
                />
                <Button size="sm" variant="primary" onClick={handleCommit}>
                  确定
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowCommitInput(false)
                    setCommitMessage('')
                  }}
                >
                  取消
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 未暂存的变更 */}
      {status?.unstaged.length > 0 && (
        <div className="change-section unstaged">
          <h4 className="section-title">
            <AlertCircle size={14} />
            未暂存
            <span className="count">({status.unstaged.length})</span>
          </h4>

          <div className="file-list">
            {status.unstaged.map((file) => (
              <div key={file.path} className={`file-item ${file.status}`}>
                <span className="file-path">{file.path}</span>
                <span className={`file-status status-${file.status}`}>
                  {getStatusText(file.status)}
                </span>
                {file.additions && (
                  <span className="file-stats">
                    <span className="additions">+{file.additions}</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 未跟踪的文件 */}
      {status?.untracked.length > 0 && (
        <div className="change-section untracked">
          <h4 className="section-title">
            <Plus size={14} />
            未跟踪
            <span className="count">({status.untracked.length})</span>
          </h4>

          <div className="file-list">
            {status.untracked.map((path) => (
              <div key={path} className="file-item untracked">
                <span className="file-path">{path}</span>
                <span className="file-status status-untracked">新文件</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 冲突文件 */}
      {status?.conflicted.length > 0 && (
        <div className="change-section conflicted">
          <h4 className="section-title error">
            <AlertCircle size={14} />
            冲突文件
            <span className="count">({status.conflicted.length})</span>
          </h4>

          <div className="file-list">
            {status.conflicted.map((path) => (
              <div key={path} className="file-item conflicted">
                <span className="file-path">{path}</span>
                <span className="error-icon">⚠️</span>
              </div>
            ))}
          </div>

          <div className="actions">
            <Button size="sm" variant="danger">
              解决冲突
            </Button>
          </div>
        </div>
      )}

      {/* 快捷操作 */}
      <div className="quick-actions">
        <Button size="sm" variant="ghost" onClick={handleCreateBranch}>
          <GitBranch size={14} />
          新建分支
        </Button>
      </div>
    </div>
  )
}

// 辅助函数：获取状态文本
function getStatusText(status: string): string {
  const map: Record<string, string> = {
    added: '新增',
    modified: '修改',
    deleted: '删除',
    renamed: '重命名',
    copied: '复制',
    untracked: '未跟踪',
    unmerged: '冲突',
  }
  return map[status] || status
}
