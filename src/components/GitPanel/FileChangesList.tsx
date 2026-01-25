/**
 * 文件变更列表组件
 *
 * 显示暂存和未暂存的文件变更
 */

import { File, Check, X, Plus, Minus } from 'lucide-react'
import { useGitStore } from '@/stores/gitStore'
import type { GitFileChange } from '@/types'

interface FileChangesListProps {
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: string[]
  workspacePath: string
  onFileClick?: (file: GitFileChange, type: 'staged' | 'unstaged') => void
  onUntrackedFileClick?: (path: string) => void  // 新增：未跟踪文件点击
}

export function FileChangesList({ staged, unstaged, untracked, workspacePath, onFileClick, onUntrackedFileClick }: FileChangesListProps) {
  const { stageFile, unstageFile, getWorktreeFileDiff } = useGitStore()

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

  const getChangeText = (status: GitFileChange['status']) => {
    const map: Record<GitFileChange['status'], string> = {
      untracked: '未跟踪',
      modified: '已修改',
      added: '已添加',
      deleted: '已删除',
      renamed: '已重命名',
      copied: '已复制',
      unmerged: '未合并',
    }
    return map[status]
  }
  // 保留 getChangeText 以备将来使用
  void getChangeText

  const totalChanges = staged.length + unstaged.length + untracked.length

  if (totalChanges === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 text-text-tertiary text-sm">
        没有变更
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* 已暂存的变更 */}
      {staged.length > 0 && (
        <div className="border-b border-border-subtle">
          <div className="px-4 py-2 text-xs font-medium text-text-secondary bg-background-surface">
            已暂存 ({staged.length})
          </div>
          <div className="py-1">
            {staged.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-2 px-4 py-1.5 hover:bg-background-hover group cursor-pointer"
                onClick={() => onFileClick?.(file, 'staged')}
              >
                {getChangeIcon(file.status)}
                <span className="flex-1 text-sm text-text-primary truncate">
                  {file.path}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    unstageFile(workspacePath, file.path)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-text-tertiary hover:text-text-primary hover:bg-background-surface rounded transition-all"
                  title="取消暂存"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 未暂存的变更 */}
      {unstaged.length > 0 && (
        <div className="border-b border-border-subtle">
          <div className="px-4 py-2 text-xs font-medium text-text-secondary bg-background-surface">
            未暂存 ({unstaged.length})
          </div>
          <div className="py-1">
            {unstaged.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-2 px-4 py-1.5 hover:bg-background-hover group cursor-pointer"
                onClick={() => onFileClick?.(file, 'unstaged')}
              >
                {getChangeIcon(file.status)}
                <span className="flex-1 text-sm text-text-primary truncate">
                  {file.path}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    stageFile(workspacePath, file.path)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-text-tertiary hover:text-success hover:bg-background-surface rounded transition-all"
                  title="暂存"
                >
                  <Check size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 未跟踪的文件 */}
      {untracked.length > 0 && (
        <div className="border-b border-border-subtle">
          <div className="px-4 py-2 text-xs font-medium text-text-secondary bg-background-surface">
            未跟踪 ({untracked.length})
          </div>
          <div className="py-1">
            {untracked.map((path) => (
              <div
                key={path}
                className="flex items-center gap-2 px-4 py-1.5 hover:bg-background-hover group cursor-pointer"
                onClick={() => onUntrackedFileClick?.(path)}
              >
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
                  title="暂存"
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
