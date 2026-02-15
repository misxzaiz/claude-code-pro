/**
 * Git 面板主组件
 */

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, GitPullRequest, X, Check, RotateCcw, MoreHorizontal, GitBranch, FolderGit2 } from 'lucide-react'
import { useGitStore } from '@/stores/gitStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { GitStatusHeader } from './GitStatusHeader'
import { FileChangesList } from './FileChangesList'
import { CommitInput } from './CommitInput'
import { QuickActions } from './QuickActions'
import { DiffViewer } from '@/components/Diff/DiffViewer'
import { Button } from '@/components/Common/Button'
import { DropdownMenu } from '@/components/Common/DropdownMenu'
import { logger } from '@/utils/logger'
import type { GitFileChange, GitDiffEntry } from '@/types'

interface GitPanelProps {
  width?: number
  className?: string
  onOpenDiffInTab?: (diff: GitDiffEntry) => void
}

export function GitPanel({ width, className = '', onOpenDiffInTab }: GitPanelProps) {
  const { t } = useTranslation('git')
  const { status, isLoading, error, refreshStatus, getWorktreeFileDiff, getIndexFileDiff, stageFile, unstageFile, discardChanges, initRepository, isRepository } = useGitStore()
  const currentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace())

  const [selectedDiff, setSelectedDiff] = useState<GitDiffEntry | null>(null)
  const [isDiffLoading, setIsDiffLoading] = useState(false)

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [isBatchOperating, setIsBatchOperating] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [showInitPrompt, setShowInitPrompt] = useState(false)
  const [initBranchName, setInitBranchName] = useState('main')

  // 处理文件点击事件
  const handleFileClick = async (file: GitFileChange, type: 'staged' | 'unstaged') => {
    if (!currentWorkspace) return

    logger.debug('[GitPanel] handleFileClick 被调用:', {
      filePath: file.path,
      type,
      timestamp: new Date().toISOString()
    })

    setIsDiffLoading(true)
    try {
      // 根据 type 选择获取 diff 的方法
      const diff = type === 'staged'
        ? await getIndexFileDiff(currentWorkspace.path, file.path)
        : await getWorktreeFileDiff(currentWorkspace.path, file.path)

      logger.debug('[GitPanel] 获取到 diff:', {
        filePath: diff.file_path,
        changeType: diff.change_type,
        oldContentLength: diff.old_content?.length ?? 0,
        newContentLength: diff.new_content?.length ?? 0,
        contentOmitted: diff.content_omitted,
        timestamp: new Date().toISOString()
      })

      // 如果提供了 onOpenDiffInTab 回调,在 Tab 中打开
      if (onOpenDiffInTab) {
        onOpenDiffInTab(diff)
      } else {
        // 否则在面板内显示
        setSelectedDiff(diff)
      }
    } catch (err) {
      logger.error('[GitPanel] 获取文件 diff 失败:', err)
    } finally {
      setIsDiffLoading(false)
    }
  }

  // 处理未跟踪文件点击事件
  const handleUntrackedFileClick = async (filePath: string) => {
    if (!currentWorkspace) return

    setIsDiffLoading(true)
    try {
      // 对于未跟踪文件，也调用 getWorktreeFileDiff
      // 因为它是新增文件，应该显示为全绿（添加）
      const diff = await getWorktreeFileDiff(currentWorkspace.path, filePath)

      // 如果提供了 onOpenDiffInTab 回调,在 Tab 中打开
      if (onOpenDiffInTab) {
        onOpenDiffInTab(diff)
      } else {
        // 否则在面板内显示
        setSelectedDiff(diff)
      }
    } catch (err) {
      console.error('[GitPanel] 获取未跟踪文件 diff 失败:', err)
    } finally {
      setIsDiffLoading(false)
    }
  }

  // 关闭 diff 查看器
  const handleCloseDiff = () => {
    setSelectedDiff(null)
  }

  // 切换文件选择状态
  const toggleFileSelection = useCallback((path: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    if (!status) return

    const allPaths = [
      ...status.staged.map(f => f.path),
      ...status.unstaged.map(f => f.path),
      ...status.untracked
    ]

    setSelectedFiles(prev => {
      if (prev.size === allPaths.length && allPaths.length > 0) {
        return new Set()  // 取消全选
      } else {
        return new Set(allPaths)  // 全选
      }
    })
  }, [status])

  // 批量暂存
  const handleBatchStage = useCallback(async () => {
    if (!currentWorkspace || selectedFiles.size === 0) return

    setIsBatchOperating(true)
    try {
      // 只操作可以暂存的文件（unstaged 和 untracked）
      const stageablePaths = Array.from(selectedFiles).filter(path => {
        return status?.unstaged.some(f => f.path === path) ||
               status?.untracked.includes(path)
      })

      for (const path of stageablePaths) {
        await stageFile(currentWorkspace.path, path)
      }

      // 刷新状态
      await refreshStatus(currentWorkspace.path)

      // 清空选择
      setSelectedFiles(new Set())
    } finally {
      setIsBatchOperating(false)
    }
  }, [currentWorkspace, selectedFiles, status, stageFile, refreshStatus])

  // 批量取消暂存
  const handleBatchUnstage = useCallback(async () => {
    if (!currentWorkspace || selectedFiles.size === 0) return

    setIsBatchOperating(true)
    try {
      // 只操作可以取消暂存的文件（staged）
      const unstageablePaths = Array.from(selectedFiles).filter(path => {
        return status?.staged.some(f => f.path === path)
      })

      for (const path of unstageablePaths) {
        await unstageFile(currentWorkspace.path, path)
      }

      // 刷新状态
      await refreshStatus(currentWorkspace.path)

      // 清空选择
      setSelectedFiles(new Set())
    } finally {
      setIsBatchOperating(false)
    }
  }, [currentWorkspace, selectedFiles, status, unstageFile, refreshStatus])

  // 批量丢弃
  const handleBatchDiscard = useCallback(async () => {
    if (!currentWorkspace || selectedFiles.size === 0) return

    const confirmed = window.confirm(t('confirmDiscard', { count: selectedFiles.size }))
    if (!confirmed) return

    setIsBatchOperating(true)
    try {
      // 只操作可以丢弃的文件（unstaged）
      const discardablePaths = Array.from(selectedFiles).filter(path => {
        return status?.unstaged.some(f => f.path === path)
      })

      for (const path of discardablePaths) {
        await discardChanges(currentWorkspace.path, path)
      }

      // 刷新状态
      await refreshStatus(currentWorkspace.path)

      // 清空选择
      setSelectedFiles(new Set())
    } finally {
      setIsBatchOperating(false)
    }
  }, [currentWorkspace, selectedFiles, status, discardChanges, refreshStatus])

  // 初始化 Git 仓库
  const handleInitRepository = useCallback(async () => {
    if (!currentWorkspace) return

    setIsInitializing(true)
    try {
      await initRepository(currentWorkspace.path, initBranchName)
      setShowInitPrompt(false)
      setInitBranchName('main')
    } catch (err) {
      logger.error('[GitPanel] 初始化仓库失败:', err)
    } finally {
      setIsInitializing(false)
    }
  }, [currentWorkspace, initBranchName, initRepository])

  // 如果使用 onOpenDiffInTab,则不需要内部显示 Diff
  const useInternalDiff = !onOpenDiffInTab

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
        <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 gap-4">
          <FolderGit2 size={48} className="text-text-tertiary opacity-50" />
          <div className="text-text-tertiary text-sm text-center">{t('notGitRepo')}</div>
          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3 text-center max-w-full break-all">
              {error}
            </div>
          )}
          {currentWorkspace && (
            <>
              <div className="text-xs text-text-tertiary break-all text-center max-w-full">
                {t('workspacePath')}: {currentWorkspace.path}
              </div>
              
              {!showInitPrompt ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowInitPrompt(true)}
                  className="mt-2"
                >
                  <GitBranch size={14} className="mr-1" />
                  {t('init.button')}
                </Button>
              ) : (
                <div className="w-full max-w-[280px] bg-background-surface border border-border rounded-lg p-3 mt-2">
                  <div className="text-xs text-text-secondary mb-2">{t('init.title')}</div>
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      value={initBranchName}
                      onChange={(e) => setInitBranchName(e.target.value)}
                      placeholder="main"
                      className="flex-1 px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="text-xs text-text-tertiary mb-3">{t('init.branchHint')}</div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setShowInitPrompt(false)
                        setInitBranchName('main')
                      }}
                      disabled={isInitializing}
                    >
                      {t('init.cancel')}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleInitRepository}
                      disabled={isInitializing || !initBranchName.trim()}
                    >
                      {isInitializing ? t('init.initializing') : t('init.confirm')}
                    </Button>
                  </div>
                </div>
              )}
            </>
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-2">
          <GitPullRequest size={16} className="text-primary" />
          <span className="text-sm font-medium text-text-primary">{t('title')}</span>
          {hasChanges && (
            <span className="flex items-center justify-center w-5 h-5 text-xs bg-primary/20 text-primary rounded-full">
              {(status.staged.length + status.unstaged.length + status.untracked.length)}
            </span>
          )}
        </div>
        {useInternalDiff && selectedDiff && (
          <button
            onClick={handleCloseDiff}
            className="p-1 text-text-tertiary hover:text-text-primary hover:bg-background-surface rounded transition-all"
            title={t('closeDiff')}
          >
            <X size={14} />
          </button>
        )}
        {!(useInternalDiff && selectedDiff) && <ChevronRight size={14} className="text-text-tertiary" />}
      </div>

      {useInternalDiff && selectedDiff && (
        <div className="flex-1 overflow-hidden flex flex-col border-b border-border-subtle">
          {isDiffLoading ? (
            <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
              {t('loading')}
            </div>
          ) : (
            <div className="h-full">
              <div className="px-4 py-2 text-xs font-medium text-text-secondary bg-background-surface border-b border-border-subtle">
                {selectedDiff.file_path}
              </div>
              <div className="h-[calc(100%-32px)]">
                <DiffViewer
                  oldContent={selectedDiff.old_content}
                  newContent={selectedDiff.new_content}
                  changeType={selectedDiff.change_type}
                  statusHint={selectedDiff.status_hint}
                  contentOmitted={selectedDiff.content_omitted ?? false}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {!(useInternalDiff && selectedDiff) && (
        <GitStatusHeader
          status={status}
          isLoading={isLoading}
          onRefresh={() => currentWorkspace && refreshStatus(currentWorkspace.path)}
        />
      )}

      {!(useInternalDiff && selectedDiff) && (
        <>
          {selectedFiles.size > 0 && (
            <div className="px-3 py-2 bg-primary/5 border-b border-primary/20 flex items-center justify-between gap-2">
              <span className="text-xs text-text-secondary flex-1 truncate">
                {t('selectedFiles', { count: selectedFiles.size })}
              </span>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleBatchStage}
                  disabled={isBatchOperating || isLoading}
                  className="px-2"
                  title={t('stageSelected')}
                >
                  <Check size={14} />
                </Button>

                <DropdownMenu
                  trigger={
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isBatchOperating || isLoading}
                      className="px-2"
                      title={t('moreActions')}
                    >
                      <MoreHorizontal size={14} />
                    </Button>
                  }
                  align="right"
                  items={[
                    {
                      key: 'unstage',
                      label: t('unstage'),
                      icon: <X size={14} />,
                      onClick: handleBatchUnstage,
                    },
                    {
                      key: 'discard',
                      label: t('discard'),
                      icon: <RotateCcw size={14} />,
                      variant: 'danger',
                      onClick: handleBatchDiscard,
                    },
                  ]}
                />
              </div>
            </div>
          )}

          <FileChangesList
            staged={status.staged}
            unstaged={status.unstaged}
            untracked={status.untracked}
            workspacePath={currentWorkspace?.path || ''}
            onFileClick={handleFileClick}
            onUntrackedFileClick={handleUntrackedFileClick}
            selectedFiles={selectedFiles}
            onToggleFileSelection={toggleFileSelection}
            onSelectAll={toggleSelectAll}
            isSelectionDisabled={isBatchOperating}
          />
        </>
      )}

      {!(useInternalDiff && selectedDiff) && error && (
        <div className="px-4 py-2 mx-4 mb-2 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg">
          {error}
        </div>
      )}

      {!(useInternalDiff && selectedDiff) && hasChanges && <CommitInput selectedFiles={selectedFiles} />}

      {/* 快捷操作 - 仅在未显示 diff 时显示 */}
      {!(useInternalDiff && selectedDiff) && <QuickActions hasChanges={hasChanges ?? false} />}
    </aside>
  )
}
