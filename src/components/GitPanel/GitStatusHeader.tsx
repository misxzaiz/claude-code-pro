/**
 * Git 状态头部组件
 *
 * 显示分支、远程、同步状态等信息
 */

import { GitBranch, ArrowUpDown, RefreshCw } from 'lucide-react'
import type { GitRepositoryStatus } from '@/types'

interface GitStatusHeaderProps {
  status: GitRepositoryStatus | null
  isLoading: boolean
  onRefresh: () => void
}

export function GitStatusHeader({ status, isLoading, onRefresh }: GitStatusHeaderProps) {

  if (!status) {
    return (
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <span className="text-sm text-text-tertiary">不是 Git 仓库</span>
      </div>
    )
  }

  if (status.isEmpty) {
    return (
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <span className="text-sm text-text-tertiary">空仓库（无提交）</span>
      </div>
    )
  }

  return (
    <div className="px-4 py-3 border-b border-border-subtle space-y-2">
      {/* 分支信息 */}
      <div className="flex items-center gap-2 text-sm">
        <GitBranch size={14} className="text-text-tertiary shrink-0" />
        <span className="text-text-primary font-medium">{status.branch || 'HEAD'}</span>
        {status.commit && (
          <span className="text-text-tertiary text-xs font-mono">
            {status.shortCommit}
          </span>
        )}
      </div>

      {/* 同步状态 */}
      {(status.ahead > 0 || status.behind > 0) && (
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          {status.ahead > 0 && (
            <span className="flex items-center gap-1" title="领先远程">
              <ArrowUpDown size={12} className="text-success rotate-180" />
              +{status.ahead}
            </span>
          )}
          {status.behind > 0 && (
            <span className="flex items-center gap-1" title="落后远程">
              <ArrowUpDown size={12} className="text-warning" />
              -{status.behind}
            </span>
          )}
        </div>
      )}

      {/* 刷新按钮 */}
      <button
        onClick={onRefresh}
        disabled={isLoading}
        className="absolute top-3 right-3 p-1 text-text-tertiary hover:text-text-primary hover:bg-background-hover rounded transition-colors disabled:opacity-50"
        title="刷新状态"
      >
        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
      </button>
    </div>
  )
}
