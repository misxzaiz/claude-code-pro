/**
 * Git 面板主组件
 *
 * 显示 Git 状态、文件变更、提交输入等
 */

import { useEffect } from 'react'
import { ChevronRight, GitPullRequest } from 'lucide-react'
import { useGitStore } from '@/stores/gitStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { GitStatusHeader } from './GitStatusHeader'
import { FileChangesList } from './FileChangesList'
import { CommitInput } from './CommitInput'
import { QuickActions } from './QuickActions'

interface GitPanelProps {
  width?: number
  className?: string
}

export function GitPanel({ width, className = '' }: GitPanelProps) {
  const { status, isLoading, error, refreshStatus } = useGitStore()
  const currentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace())

  // 工作区切换时刷新状态
  useEffect(() => {
    console.log('[GitPanel] useEffect 触发', {
      currentWorkspace: currentWorkspace ? {
        id: currentWorkspace.id,
        name: currentWorkspace.name,
        path: currentWorkspace.path,
      } : null,
      status,
      isLoading,
      error,
    })

    if (currentWorkspace) {
      console.log('[GitPanel] 调用 refreshStatus', { path: currentWorkspace.path })
      refreshStatus(currentWorkspace.path)
    } else {
      console.log('[GitPanel] currentWorkspace 为空，不调用 refreshStatus')
    }
  }, [currentWorkspace?.path])

  // 计算是否有变更
  const hasChanges =
    status &&
    (status.staged.length > 0 ||
     status.unstaged.length > 0 ||
     status.untracked.length > 0)

  if (!status) {
    console.log('[GitPanel] 渲染"不是 Git 仓库"状态', {
      currentWorkspace: currentWorkspace ? {
        id: currentWorkspace.id,
        name: currentWorkspace.name,
        path: currentWorkspace.path,
      } : null,
      isLoading,
      error,
    })

    return (
      <aside
        className={`flex flex-col bg-background-elevated border-l border-border ${className}`}
        style={{ width: width ? `${width}px` : '320px' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <GitPullRequest size={16} className="text-primary" />
            <span className="text-sm font-medium text-text-primary">Git</span>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 gap-3">
          <div className="text-text-tertiary text-sm">不是 Git 仓库</div>
          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3 text-center max-w-full break-all">
              错误: {error}
            </div>
          )}
          {currentWorkspace && (
            <div className="text-xs text-text-tertiary break-all text-center max-w-full">
              工作区路径: {currentWorkspace.path}
            </div>
          )}
        </div>
      </aside>
    )
  }

  return (
    <aside
      className={`flex flex-col bg-background-elevated border-l border-border ${className}`}
      style={{ width: width ? `${width}px` : '320px' }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-2">
          <GitPullRequest size={16} className="text-primary" />
          <span className="text-sm font-medium text-text-primary">Git</span>
          {hasChanges && (
            <span className="flex items-center justify-center w-5 h-5 text-xs bg-primary/20 text-primary rounded-full">
              {(status.staged.length + status.unstaged.length + status.untracked.length)}
            </span>
          )}
        </div>
        <ChevronRight size={14} className="text-text-tertiary" />
      </div>

      {/* 状态头部 */}
      <GitStatusHeader
        status={status}
        isLoading={isLoading}
        onRefresh={() => currentWorkspace && refreshStatus(currentWorkspace.path)}
      />

      {/* 文件变更列表 */}
      <FileChangesList
        staged={status.staged}
        unstaged={status.unstaged}
        untracked={status.untracked}
        workspacePath={currentWorkspace?.path || ''}
      />

      {/* 错误提示 */}
      {error && (
        <div className="px-4 py-2 mx-4 mb-2 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg">
          {error}
        </div>
      )}

      {/* 提交输入 */}
      {hasChanges && <CommitInput hasChanges={hasChanges} />}

      {/* 快捷操作 */}
      <QuickActions hasChanges={hasChanges} />
    </aside>
  )
}
