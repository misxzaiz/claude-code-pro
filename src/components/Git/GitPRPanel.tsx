/**
 * Git PR 面板
 *
 * 显示 Pull Request 状态和操作
 */

import React, { useState, useEffect } from 'react'
import { useGitStore } from '@/stores/gitStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import {
  GitPullRequest,
  ExternalLink,
  RefreshCw,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  GitMerge,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface GitPRPanelProps {
  className?: string
}

export function GitPRPanel({ className = '' }: GitPRPanelProps) {
  const { currentPR, remotes, isLoading, error, createPR, pushBranch, getPRStatus, refreshStatus } =
    useGitStore()

  const workspace = useWorkspaceStore((s) => s.currentWorkspace)
  const [isCreating, setIsCreating] = useState(false)

  // 当前分支信息
  const currentBranch = useGitStore((s) => s.status?.branch)
  const hasRemote = remotes.length > 0

  // 检查是否有未推送的提交
  const needsPush = useGitStore((s) => s.status?.ahead && s.status.ahead > 0)

  // 初始化时加载远程信息
  useEffect(() => {
    if (workspace?.path) {
      useGitStore.getState().getRemotes(workspace.path)
    }
  }, [workspace?.path])

  // 轮询 PR 状态（如果 PR 存在且未完成）
  useEffect(() => {
    if (currentPR && currentPR.state === 'open' && workspace?.path) {
      const interval = setInterval(() => {
        getPRStatus(workspace.path, currentPR.number)
      }, 30000) // 每 30 秒刷新一次

      return () => clearInterval(interval)
    }
  }, [currentPR?.number, currentPR?.state, workspace?.path])

  // 处理创建 PR
  const handleCreatePR = async () => {
    if (!workspace || !currentBranch) return

    // 如果需要推送，先推送
    if (needsPush) {
      const shouldPush = confirm(`当前分支有 ${useGitStore.getState().status?.ahead} 个未推送的提交，是否先推送到远程？`)
      if (shouldPush) {
        try {
          await pushBranch(workspace.path, currentBranch)
        } catch (err) {
          console.error('推送失败:', err)
          alert('推送失败: ' + (err instanceof Error ? err.message : String(err)))
          return
        }
      }
    }

    const title = prompt('请输入 PR 标题:')
    if (!title) return

    const body = prompt('请输入 PR 描述（可选）:')

    setIsCreating(true)
    try {
      const pr = await createPR(workspace.path, {
        title,
        body: body || undefined,
        headBranch: currentBranch,
        baseBranch: 'main', // TODO: 从配置读取
        draft: false,
      })

      // 成功后打开 PR
      if (pr.url) {
        // 在浏览器中打开 PR
        const confirmed = confirm(`PR 创建成功！\n\n#${pr.number}: ${pr.title}\n\n是否在浏览器中打开？`)
        if (confirmed) {
          window.open(pr.url, '_blank')
        }
      }
    } catch (err) {
      console.error('创建 PR 失败:', err)
      alert('创建 PR 失败: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setIsCreating(false)
    }
  }

  // 获取 PR 状态显示
  const getPRStatusText = (state: typeof currentPR.state) => {
    switch (state) {
      case 'open':
        return { text: 'Open', color: 'text-green-400', icon: GitMerge }
      case 'merged':
        return { text: 'Merged', color: 'text-purple-400', icon: CheckCircle }
      case 'closed':
        return { text: 'Closed', color: 'text-red-400', icon: XCircle }
      default:
        return { text: 'Unknown', color: 'text-gray-400', icon: Clock }
    }
  }

  if (!workspace) {
    return (
      <div className={`git-pr-panel empty ${className}`}>
        <p>请先选择一个工作区</p>
      </div>
    )
  }

  return (
    <div className={`git-pr-panel ${className}`}>
      {/* 当前 PR 状态 */}
      {currentPR ? (
        <div className="pr-card">
          <div className="pr-header">
            <div className="pr-info">
              <span className="pr-number">#{currentPR.number}</span>
              <span className="pr-title">{currentPR.title}</span>
            </div>

            <div className={`pr-status ${currentPR.state}`}>
              {(() => {
                const { text, color, icon: Icon } = getPRStatusText(currentPR.state)
                return (
                  <>
                    <Icon size={14} className={color} />
                    <span className={color}>{text}</span>
                  </>
                )
              })()}
            </div>

            <Button
              size="xs"
              variant="ghost"
              onClick={() => workspace?.path && getPRStatus(workspace.path, currentPR.number)}
            >
              <RefreshCw size={12} />
            </Button>
          </div>

          <div className="pr-details">
            <div className="pr-row">
              <span className="pr-label">分支:</span>
              <span className="pr-value">
                <code>{currentPR.headBranch}</code>
                <span>→</span>
                <code>{currentPR.baseBranch}</code>
              </span>
            </div>

            <div className="pr-row">
              <span className="pr-label">作者:</span>
              <span className="pr-value">{currentPR.author}</span>
            </div>

            {currentPR.additions !== undefined && currentPR.deletions !== undefined && (
              <div className="pr-row">
                <span className="pr-label">变更:</span>
                <span className="pr-value">
                  <span className="additions">+{currentPR.additions}</span>
                  <span className="deletions">-{currentPR.deletions}</span>
                  {currentPR.changedFiles && <span className="files">· {currentPR.changedFiles} 文件</span>}
                </span>
              </div>
            )}

            {currentPR.reviewStatus && (
              <div className="pr-row">
                <span className="pr-label">审查:</span>
                <span className={`pr-review-status ${currentPR.reviewStatus}`}>
                  {getReviewStatusText(currentPR.reviewStatus)}
                </span>
              </div>
            )}
          </div>

          <div className="pr-actions">
            <a
              href={currentPR.url}
              target="_blank"
              rel="noopener noreferrer"
              className="pr-link"
            >
              <ExternalLink size={14} />
              在 GitHub 上查看
            </a>
          </div>
        </div>
      ) : (
        <>
          {/* 无 PR 时的提示 */}
          {!hasRemote ? (
            <div className="pr-empty">
              <GitPullRequest size={32} className="text-gray-500" />
              <p>没有配置远程仓库</p>
              <p className="text-sm text-gray-400">请先配置 Git 远程仓库（如 GitHub）</p>
            </div>
          ) : needsPush ? (
            <div className="pr-push-reminder">
              <Clock size={20} />
              <div className="reminder-content">
                <p>当前分支有未推送的提交</p>
                <p className="text-sm text-gray-400">
                  {useGitStore.getState().status?.ahead} 个提交需要先推送到远程
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                onClick={() => workspace && currentBranch && pushBranch(workspace.path, currentBranch)}
              >
                推送到远程
              </Button>
            </div>
          ) : (
            <div className="pr-empty">
              <GitPullRequest size={32} className="text-gray-500" />
              <p>当前没有活动的 Pull Request</p>
              <Button
                size="sm"
                variant="primary"
                onClick={handleCreatePR}
                disabled={isCreating}
              >
                <Plus size={14} />
                {isCreating ? '创建中...' : '创建 PR'}
              </Button>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="pr-error">
          <XCircle size={16} />
          <span>{error}</span>
          <Button size="xs" variant="ghost" onClick={() => useGitStore.getState().clearError()}>
            关闭
          </Button>
        </div>
      )}
    </div>
  )
}

// 辅助函数
function getReviewStatusText(status: typeof currentPR.reviewStatus): string {
  switch (status) {
    case 'approved':
      return '已批准'
    case 'changes_requested':
      return '需修改'
    case 'pending':
      return '待审查'
    case 'commented':
      return '有评论'
    default:
      return '未知'
  }
}
