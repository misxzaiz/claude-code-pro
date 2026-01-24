/**
 * Git Diff 面板
 *
 * 显示文件变更的 Diff 内容
 */

import React, { useState } from 'react'
import { useGitStore } from '@/stores/gitStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import {
  File,
  FileCode,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
} from 'lucide-react'
import { DiffViewer } from '@/components/Diff/DiffViewer'
import type { GitDiffEntry } from '@/types/git'
import { Button } from '@/components/ui/Button'

interface GitDiffPanelProps {
  baseCommit?: string
  showWorktreeChanges?: boolean
  showIndexChanges?: boolean
  className?: string
}

export function GitDiffPanel({
  baseCommit,
  showWorktreeChanges = false,
  showIndexChanges = false,
  className = '',
}: GitDiffPanelProps) {
  const { diffs, worktreeDiffs, indexDiffs, isLoading, error } = useGitStore()
  const workspace = useWorkspaceStore((s) => s.currentWorkspace)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [selectedFile, setSelectedFile] = useState<GitDiffEntry | null>(null)

  // 获取要显示的 diffs
  const displayDiffs = baseCommit
    ? diffs
    : showWorktreeChanges
      ? worktreeDiffs
      : showIndexChanges
        ? indexDiffs
        : diffs

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

  // 获取变更类型图标
  const getChangeIcon = (changeType: GitDiffEntry['changeType']) => {
    switch (changeType) {
      case 'added':
        return <Plus size={14} className="text-green-500" />
      case 'deleted':
        return <Minus size={14} className="text-red-500" />
      default:
        return <FileCode size={14} className="text-blue-500" />
    }
  }

  // 获取变更类型文本
  const getChangeTypeText = (changeType: GitDiffEntry['changeType']) => {
    const map: Record<GitDiffEntry['changeType'], string> = {
      added: '新增',
      deleted: '删除',
      modified: '修改',
      renamed: '重命名',
      copied: '复制',
    }
    return map[changeType]
  }

  if (!workspace) {
    return (
      <div className={`git-diff-panel empty ${className}`}>
        <p>请先选择一个工作区</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={`git-diff-panel loading ${className}`}>
        <div className="loading-spinner" />
        <p>加载 Diff 中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`git-diff-panel error ${className}`}>
        <p>{error}</p>
      </div>
    )
  }

  if (displayDiffs.length === 0) {
    return (
      <div className={`git-diff-panel empty ${className}`}>
        <File size={32} className="text-gray-400" />
        <p>没有文件变更</p>
      </div>
    )
  }

  return (
    <div className={`git-diff-panel ${className}`}>
      {/* 文件列表 */}
      <div className="diff-file-list">
        {displayDiffs.map((diff) => {
          const isExpanded = expandedFiles.has(diff.filePath)
          const isSelected = selectedFile?.filePath === diff.filePath
          const statsText =
            diff.additions || diff.deletions
              ? ` (+${diff.additions || 0}, -${diff.deletions || 0})`
              : ''

          return (
            <div
              key={diff.filePath}
              className={`diff-file-item ${diff.changeType} ${isSelected ? 'selected' : ''}`}
            >
              <div
                className="file-header"
                onClick={() => toggleFile(diff.filePath)}
              >
                <button className="expand-btn">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {getChangeIcon(diff.changeType)}

                <span className="file-name">{diff.filePath}</span>

                <span className="change-type-badge">{getChangeTypeText(diff.changeType)}</span>

                {statsText && <span className="file-stats">{statsText}</span>}
              </div>

              {/* 展开的 Diff 内容 */}
              {isExpanded && (
                <div className="file-diff-content">
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
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 统计信息 */}
      <div className="diff-summary">
        {displayDiffs.length > 0 && (
          <>
            <span>
              {displayDiffs.filter((d) => d.changeType === 'added').length} 新增
            </span>
            <span>
              {displayDiffs.filter((d) => d.changeType === 'modified').length} 修改
            </span>
            <span>
              {displayDiffs.filter((d) => d.changeType === 'deleted').length} 删除
            </span>
            {displayDiffs.some((d) => d.additions) && (
              <span className="additions">
                +
                {displayDiffs.reduce((sum, d) => sum + (d.additions || 0), 0)}
              </span>
            )}
            {displayDiffs.some((d) => d.deletions) && (
              <span className="deletions">
                -
                {displayDiffs.reduce((sum, d) => sum + (d.deletions || 0), 0)}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// 辅助函数：根据文件名获取语言
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
    dockerfile: 'docker',
  }

  return languageMap[ext || ''] || 'text'
}
