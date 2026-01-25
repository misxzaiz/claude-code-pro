/**
 * Diff 差异查看器组件
 * 简化版实现，使用纯文本渲染
 */

import { computeDiff } from '../../services/diffService';
import type { DiffChangeType } from '@/types/git';

interface DiffViewerProps {
  /** 原始内容 */
  oldContent?: string;
  /** 修改后内容 */
  newContent?: string;
  /** 变更类型 */
  changeType?: DiffChangeType;
  /** 状态提示 */
  statusHint?: {
    has_conflict: boolean
    message?: string
    current_view: string
  };
  /** 语言类型 */
  language?: string;
  /** 只读模式 */
  readOnly?: boolean;
}

/**
 * CodeMirror Diff 查看器组件（暂不实现，使用简化版）
 */
export function DiffViewer({ oldContent, newContent, changeType, statusHint }: DiffViewerProps) {
  // 根据 change_type 处理 undefined
  const effectiveOldContent = (() => {
    if (changeType === 'added' && oldContent === undefined) {
      return ''  // 新增文件：旧内容为空
    }
    return oldContent ?? ''
  })()

  const effectiveNewContent = (() => {
    if (changeType === 'deleted' && newContent === undefined) {
      return ''  // 删除文件：新内容为空
    }
    return newContent ?? ''
  })()

  const diff = computeDiff(effectiveOldContent, effectiveNewContent);

  return (
    <div className="h-full w-full flex flex-col overflow-auto font-mono text-sm">
      {/* 状态冲突提示 */}
      {statusHint?.has_conflict && (
        <div className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center gap-3 text-xs shrink-0">
          <span className="text-yellow-600">⚠️</span>
          <span className="text-text-secondary flex-1">
            {statusHint.message}
          </span>
          <span className="text-text-tertiary">
            {statusHint.current_view}
          </span>
        </div>
      )}

      {/* 差异摘要 */}
      <div className="flex items-center gap-4 px-4 py-2 bg-background-elevated border-b border-border text-xs shrink-0">
        <span className="text-text-secondary">差异摘要</span>
        <span className="text-green-500">+{diff.addedCount} 行添加</span>
        <span className="text-red-500">-{diff.removedCount} 行删除</span>
      </div>

      {/* 差异内容 */}
      <div className="flex-1 overflow-auto p-4">
        {diff.lines.length === 0 ? (
          <div className="text-text-tertiary text-center py-8">无变化</div>
        ) : (
          <div className="space-y-0.5">
            {diff.lines.map((line, idx) => (
              <div
                key={idx}
                className={`flex gap-4 px-2 py-0.5 ${
                  line.type === 'added'
                    ? 'bg-green-500/10'
                    : line.type === 'removed'
                      ? 'bg-red-500/10'
                      : ''
                }`}
              >
                {/* 旧行号 */}
                <span className="w-2 text-right text-text-tertiary shrink-0 select-none">
                  {line.oldLineNumber ?? '×'}
                </span>
                {/* 新行号 */}
                <span className="w-2 text-right text-text-tertiary shrink-0 select-none">
                  {line.newLineNumber ?? '×'}
                </span>
                {/* 标记 */}
                <span
                  className={`w-4 shrink-0 select-none font-bold ${
                    line.type === 'added'
                      ? 'text-green-500'
                      : line.type === 'removed'
                        ? 'text-red-500'
                        : 'text-text-tertiary'
                  }`}
                >
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                {/* 内容 */}
                <span
                  className={`flex-1 break-all ${
                    line.type === 'removed' ? 'text-text-tertiary line-through' : 'text-text-secondary'
                  }`}
                >
                  {line.content || '\u00A0'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 简化版 Diff 查看器 - 纯文本渲染
 * 用于不想使用 CodeMirror 的场景
 */
interface SimpleDiffViewerProps {
  oldContent: string;
  newContent: string;
}

export function SimpleDiffViewer({ oldContent, newContent }: SimpleDiffViewerProps) {
  const diff = computeDiff(oldContent, newContent);

  return (
    <div className="h-full w-full flex flex-col overflow-auto font-mono text-sm">
      {/* 差异摘要 */}
      <div className="flex items-center gap-4 px-4 py-2 bg-background-elevated border-b border-border text-xs shrink-0">
        <span className="text-text-secondary">差异摘要</span>
        <span className="text-green-500">+{diff.addedCount} 行添加</span>
        <span className="text-red-500">-{diff.removedCount} 行删除</span>
      </div>

      {/* 差异内容 */}
      <div className="flex-1 overflow-auto p-4">
        {diff.lines.length === 0 ? (
          <div className="text-text-tertiary text-center py-8">无变化</div>
        ) : (
          <div className="space-y-0.5">
            {diff.lines.map((line, idx) => (
              <div
                key={idx}
                className={`flex gap-4 px-2 py-0.5 ${
                  line.type === 'added'
                    ? 'bg-green-500/10'
                    : line.type === 'removed'
                      ? 'bg-red-500/10'
                      : ''
                }`}
              >
                {/* 旧行号 */}
                <span className="w-2 text-right text-text-tertiary shrink-0 select-none">
                  {line.oldLineNumber ?? '×'}
                </span>
                {/* 新行号 */}
                <span className="w-2 text-right text-text-tertiary shrink-0 select-none">
                  {line.newLineNumber ?? '×'}
                </span>
                {/* 标记 */}
                <span
                  className={`w-4 shrink-0 select-none font-bold ${
                    line.type === 'added'
                      ? 'text-green-500'
                      : line.type === 'removed'
                        ? 'text-red-500'
                        : 'text-text-tertiary'
                  }`}
                >
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                {/* 内容 */}
                <span
                  className={`flex-1 break-all ${
                    line.type === 'removed' ? 'text-text-tertiary line-through' : 'text-text-secondary'
                  }`}
                >
                  {line.content || '\u00A0'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
