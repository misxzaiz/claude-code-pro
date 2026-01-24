/**
 * Git 快捷操作组件
 *
 * 常用 Git 操作的快速访问按钮
 */

import React, { useState } from 'react'
import { useGitStore } from '@/stores/gitStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import {
  GitBranch,
  GitCommit,
  RefreshCw,
  Upload,
  GitPullRequest,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface GitQuickActionsProps {
  className?: string
}

export function GitQuickActions({ className = '' }: GitQuickActionsProps) {
  const { status, isLoading, refreshStatus, createBranch, commitChanges, hasChanges } =
    useGitStore()
  const workspace = useWorkspaceStore((s) => s.currentWorkspace)

  const [commitMessage, setCommitMessage] = useState('')
  const [showCommitInput, setShowCommitInput] = useState(false)

  // 快速提交
  const handleQuickCommit = async () => {
    if (!workspace || !commitMessage.trim()) return

    try {
      await commitChanges(workspace.path, commitMessage, true)
      setCommitMessage('')
      setShowCommitInput(false)
    } catch (err) {
      console.error('提交失败:', err)
    }
  }

  // 快速创建分支
  const handleQuickBranch = async () => {
    if (!workspace) return

    const name = prompt('请输入新分支名称:')
    if (!name) return

    try {
      await createBranch(workspace.path, name, true)
    } catch (err) {
      console.error('创建分支失败:', err)
    }
  }

  if (!workspace || !status || !status.exists) {
    return null
  }

  return (
    <div className={`git-quick-actions ${className}`}>
      {/* 提交操作 */}
      {hasChanges() && (
        <div className="action-group">
          {!showCommitInput ? (
            <Button size="sm" variant="primary" onClick={() => setShowCommitInput(true)}>
              <GitCommit size={14} />
              快速提交
            </Button>
          ) : (
            <div className="commit-input-wrapper">
              <input
                type="text"
                className="commit-input"
                placeholder="输入提交消息..."
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickCommit()
                  if (e.key === 'Escape') {
                    setShowCommitInput(false)
                    setCommitMessage('')
                  }
                }}
                autoFocus
              />
              <Button size="sm" variant="primary" onClick={handleQuickCommit}>
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
      )}

      {/* 分支操作 */}
      <div className="action-group">
        <Button size="sm" variant="secondary" onClick={handleQuickBranch}>
          <GitBranch size={14} />
          新建分支
        </Button>
      </div>

      {/* 同步操作 */}
      {(status.ahead > 0 || status.behind > 0) && (
        <div className="action-group sync-hint">
          {status.ahead > 0 && (
            <span className="hint-text ahead">+{status.ahead} 个未推送</span>
          )}
          {status.behind > 0 && (
            <span className="hint-text behind">-{status.behind} 个未拉取</span>
          )}
          <Button size="sm" variant="ghost" onClick={() => refreshStatus(workspace.path)}>
            <RefreshCw size={14} />
            刷新
          </Button>
        </div>
      )}
    </div>
  )
}
