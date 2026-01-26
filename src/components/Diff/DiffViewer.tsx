/**
 * Diff 差异查看器组件
 * 简化版实现，使用纯文本渲染
 */

import { computeDiff } from '../../services/diffService';
import { logger } from '@/utils/logger';
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
  /** 是否显示状态提示（默认 true） */
  showStatusHint?: boolean;
  /** 最大高度（可选，用于限制高度） */
  maxHeight?: string;
  /** 内容是否被省略（如文件过大） */
  contentOmitted?: boolean;
}

/**
 * Diff 查看器组件 - 统一版本
 * 支持可选的状态提示显示
 */
export function DiffViewer({
  oldContent,
  newContent,
  changeType,
  statusHint,
  showStatusHint = true,
  maxHeight,
  contentOmitted = false
}: DiffViewerProps) {
  // 添加调试日志（仅在开发环境）
  logger.debug('[DiffViewer] 渲染:', {
    oldContentLength: oldContent?.length ?? 0,
    newContentLength: newContent?.length ?? 0,
    changeType,
    contentOmitted,
    timestamp: new Date().toISOString()
  });

  // 如果内容被省略，显示提示信息
  if (contentOmitted) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="text-6xl mb-4">📄</div>
        <div className="text-text-secondary mb-2">文件内容过大</div>
        <div className="text-text-tertiary text-sm">
          为了性能考虑，已省略显示此文件的差异内容
        </div>
      </div>
    );
  }

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
    <div
      className="flex flex-col overflow-auto font-mono text-sm"
      style={{ maxHeight, height: maxHeight ? undefined : '100%' }}
    >
      {/* 状态提示（可选） */}
      {showStatusHint && statusHint && (
        <div className={`px-4 py-2 border-b flex items-center gap-3 text-xs shrink-0 ${
          statusHint.has_conflict
            ? 'bg-yellow-500/10 border-yellow-500/20'
            : 'bg-blue-500/5 border-blue-500/10'
        }`}>
          {statusHint.has_conflict && (
            <span className="text-yellow-600">⚠️</span>
          )}
          <span className="text-text-secondary flex-1">
            {statusHint.message || (statusHint.has_conflict ? '注意' : '信息')}
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
                <span className="w-8 text-right text-text-tertiary shrink-0 select-none">
                  {line.oldLineNumber ?? '×'}
                </span>
                {/* 新行号 */}
                <span className="w-8 text-right text-text-tertiary shrink-0 select-none">
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
                  className={`flex-1 whitespace-nowrap ${
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
 * 简化版 Diff 查看器 - 不显示状态提示
 * 为了向后兼容保留的别名
 * @deprecated 使用 DiffViewer 并设置 showStatusHint={false} 代替
 */
export function SimpleDiffViewer({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  return (
    <DiffViewer
      oldContent={oldContent}
      newContent={newContent}
      showStatusHint={false}
    />
  );
}
