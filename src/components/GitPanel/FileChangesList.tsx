/**
 * 文件变更列表组件
 *
 * 显示暂存和未暂存的文件变更
 */

import { useTranslation } from 'react-i18next'
import { File, Check, X, Plus, Minus } from 'lucide-react'
import { useGitStore } from '@/stores/gitStore'
import type { GitFileChange } from '@/types'

interface FileChangesListProps {
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: string[]
  workspacePath: string
  onFileClick?: (file: GitFileChange, type: 'staged' | 'unstaged') => void
  onUntrackedFileClick?: (path: string) => void
  selectedFiles?: Set<string>
  onToggleFileSelection?: (path: string) => void
  onSelectAll?: () => void
  isSelectionDisabled?: boolean
}

export function FileChangesList({
  staged,
  unstaged,
  untracked,
  workspacePath,
  onFileClick,
  onUntrackedFileClick,
  selectedFiles = new Set(),
  onToggleFileSelection,
  onSelectAll,
  isSelectionDisabled = false
}: FileChangesListProps) {
  const { t } = useTranslation('git')
  const { stageFile, unstageFile } = useGitStore()

  const getChangeIcon = (status: GitFileChange['status']) => {
    switch (status) {
      case 'added':
      case 'untracked':
        return <Plus size={12} className="text-success" />
      case 'deleted':
        return <Minus size={12} className="text-danger" />
      case 'modified':
        return <File size={12} className="text-warning" />
      case 'renamed':
        return <File size={12} className="text-info" />
      default:
        return <File size={12} className="text-text-tertiary" />
    }
  }

  const totalChanges = staged.length + unstaged.length + untracked.length
  const isAllSelected = totalChanges > 0 && selectedFiles.size === totalChanges
  const isSomeSelected = selectedFiles.size > 0

  if (totalChanges === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 text-text-tertiary text-sm">
        {t('status.noChanges')}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 py-2 border-b border-border-subtle flex items-center gap-2">
        <input
          type="checkbox"
          checked={isAllSelected}
          ref={(input) => {
            if (input) {
              input.indeterminate = isSomeSelected && !isAllSelected
            }
          }}
          onChange={onSelectAll}
          disabled={isSelectionDisabled}
          className="w-4 h-4 rounded border-border"
        />
        <span className="text-xs text-text-secondary">
          {selectedFiles.size > 0 ? t('selectedFiles', { count: selectedFiles.size }) : t('selectAll')}
        </span>
      </div>

      {staged.length > 0 && (
        <div className="border-b border-border-subtle">
          <div className="px-4 py-2 text-xs font-medium text-text-secondary bg-background-surface">
            {t('status.staged')} ({staged.length})
          </div>
          <div className="py-1">
            {staged.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-2 px-4 py-1.5 hover:bg-background-hover group cursor-pointer"
                onClick={() => onFileClick?.(file, 'staged')}
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.path)}
                  onChange={(e) => {
                    e.stopPropagation()
                    onToggleFileSelection?.(file.path)
                  }}
                  disabled={isSelectionDisabled}
                  className="w-4 h-4 rounded border-border"
                  onClick={(e) => e.stopPropagation()}
                />
                {getChangeIcon(file.status)}
                <span className="flex-1 text-sm text-text-primary truncate">
                  {file.path}
                </span>
                {file.additions !== undefined && file.deletions !== undefined && (
                  <span className="text-xs text-text-tertiary">
                    <span className="text-success">+{file.additions}</span>
                    <span className="text-danger ml-1">-{file.deletions}</span>
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    unstageFile(workspacePath, file.path)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-text-tertiary hover:text-text-primary hover:bg-background-surface rounded transition-all"
                  title={t('unstage')}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {unstaged.length > 0 && (
        <div className="border-b border-border-subtle">
          <div className="px-4 py-2 text-xs font-medium text-text-secondary bg-background-surface">
            {t('status.unstaged')} ({unstaged.length})
          </div>
          <div className="py-1">
            {unstaged.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-2 px-4 py-1.5 hover:bg-background-hover group cursor-pointer"
                onClick={() => onFileClick?.(file, 'unstaged')}
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.path)}
                  onChange={(e) => {
                    e.stopPropagation()
                    onToggleFileSelection?.(file.path)
                  }}
                  disabled={isSelectionDisabled}
                  className="w-4 h-4 rounded border-border"
                  onClick={(e) => e.stopPropagation()}
                />
                {getChangeIcon(file.status)}
                <span className="flex-1 text-sm text-text-primary truncate">
                  {file.path}
                </span>
                {file.additions !== undefined && file.deletions !== undefined && (
                  <span className="text-xs text-text-tertiary">
                    <span className="text-success">+{file.additions}</span>
                    <span className="text-danger ml-1">-{file.deletions}</span>
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    stageFile(workspacePath, file.path)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-text-tertiary hover:text-success hover:bg-background-surface rounded transition-all"
                  title={t('stage')}
                >
                  <Check size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {untracked.length > 0 && (
        <div className="border-b border-border-subtle">
          <div className="px-4 py-2 text-xs font-medium text-text-secondary bg-background-surface">
            {t('status.untracked')} ({untracked.length})
          </div>
          <div className="py-1">
            {untracked.map((path) => (
              <div
                key={path}
                className="flex items-center gap-2 px-4 py-1.5 hover:bg-background-hover group cursor-pointer"
                onClick={() => onUntrackedFileClick?.(path)}
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.has(path)}
                  onChange={(e) => {
                    e.stopPropagation()
                    onToggleFileSelection?.(path)
                  }}
                  disabled={isSelectionDisabled}
                  className="w-4 h-4 rounded border-border"
                  onClick={(e) => e.stopPropagation()}
                />
                <Plus size={12} className="text-text-tertiary" />
                <span className="flex-1 text-sm text-text-primary truncate">
                  {path}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    stageFile(workspacePath, path)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-text-tertiary hover:text-success hover:bg-background-surface rounded transition-all"
                  title={t('stage')}
                >
                  <Check size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
