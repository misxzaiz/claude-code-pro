/**
 * Git 面板主组件
 *
 * 显示 Git 状态、文件变更、提交输入等
 */

import { useEffect, useState } from 'react'
import { ChevronRight, GitPullRequest, X } from 'lucide-react'
import { useGitStore } from '@/stores/gitStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { GitStatusHeader } from './GitStatusHeader'
import { FileChangesList } from './FileChangesList'
import { CommitInput } from './CommitInput'
import { QuickActions } from './QuickActions'
import { DiffViewer } from '@/components/Diff/DiffViewer'
import type { GitFileChange, GitDiffEntry } from '@/types'

interface GitPanelProps {
  width?: number
  className?: string
}

export function GitPanel({ width, className = '' }: GitPanelProps) {
  const { status, isLoading, error, refreshStatus, getWorktreeFileDiff, getIndexFileDiff } = useGitStore()
  const currentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace())

  // Diff 查看器状态
  const [selectedDiff, setSelectedDiff] = useState<GitDiffEntry | null>(null)
  const [isDiffLoading, setIsDiffLoading] = useState(false)

  // 处理文件点击事件
  const handleFileClick = async (file: GitFileChange, type: 'staged' | 'unstaged') => {
    if (!currentWorkspace) return

    setIsDiffLoading(true)
    try {
      // 根据 type 选择获取 diff 的方法
      const diff = type === 'staged'
        ? await getIndexFileDiff(currentWorkspace.path, file.path)
        : await getWorktreeFileDiff(currentWorkspace.path, file.path)

      setSelectedDiff(diff)
    } catch (err) {
      console.error('[GitPanel] 获取文件 diff 失败:', err)
    } finally {
      setIsDiffLoading(false)
    }
  }

  // 关闭 diff 查看器
  const handleCloseDiff = () => {
    setSelectedDiff(null)
  }

  // 工作区切换时刷新状态
  useEffect(() => {
    if (currentWorkspace) {
      refreshStatus(currentWorkspace.path)
    }
  }, [currentWorkspace?.path])

  // 计算是否有变更
  const hasChanges =
    status &&
    (status.staged.length > 0 ||
     status.unstaged.length > 0 ||
     status.untracked.length > 0)

  if (!status) {
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
        {selectedDiff && (
          <button
            onClick={handleCloseDiff}
            className="p-1 text-text-tertiary hover:text-text-primary hover:bg-background-surface rounded transition-all"
            title="关闭 Diff"
          >
            <X size={14} />
          </button>
        )}
        {!selectedDiff && <ChevronRight size={14} className="text-text-tertiary" />}
      </div>

      {/* Diff 查看器区域 */}
      {selectedDiff && (
        <div className="flex-1 overflow-hidden flex flex-col border-b border-border-subtle">
          {isDiffLoading ? (
            <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
              加载中...
            </div>
          ) : (
            <div className="h-full">
              {/* Diff 头部 */}
              <div className="px-4 py-2 text-xs font-medium text-text-secondary bg-background-surface border-b border-border-subtle">
                {selectedDiff.file_path}
              </div>
              {/* Diff 内容 */}
              <div className="h-[calc(100%-32px)]">
                <DiffViewer
                  oldContent={selectedDiff.old_content}
                  newContent={selectedDiff.new_content}
                  changeType={selectedDiff.change_type}
                  statusHint={selectedDiff.status_hint}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 状态头部 - 仅在未显示 diff 时显示 */}
      {!selectedDiff && (
        <GitStatusHeader
          status={status}
          isLoading={isLoading}
          onRefresh={() => currentWorkspace && refreshStatus(currentWorkspace.path)}
        />
      )}

      {/* 文件变更列表 - 仅在未显示 diff 时显示 */}
      {!selectedDiff && (
        <FileChangesList
          staged={status.staged}
          unstaged={status.unstaged}
          untracked={status.untracked}
          workspacePath={currentWorkspace?.path || ''}
          onFileClick={handleFileClick}
        />
      )}

      {/* 错误提示 - 仅在未显示 diff 时显示 */}
      {!selectedDiff && error && (
        <div className="px-4 py-2 mx-4 mb-2 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg">
          {error}
        </div>
      )}

      {/* 提交输入 - 仅在未显示 diff 时显示 */}
      {!selectedDiff && hasChanges && <CommitInput />}

      {/* 快捷操作 - 仅在未显示 diff 时显示 */}
      {!selectedDiff && <QuickActions hasChanges={hasChanges ?? false} />}
    </aside>
  )
}
