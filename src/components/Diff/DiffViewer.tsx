/**
 * Diff 差异查看器组件
 * 简化版实现，使用纯文本渲染
 */

import { useState } from 'react';
import { computeDiff } from '../../services/diffService';
import { restoreFileVersion } from '../../services/fileVersionService';
import { clsx } from 'clsx';

/** 审核状态 */
export type ReviewStatus = 'pending' | 'accepted' | 'rejected';

interface DiffViewerProps {
  /** 原始内容 */
  oldContent: string;
  /** 修改后内容 */
  newContent: string;
  /** 语言类型 */
  language?: string;
  /** 只读模式 */
  readOnly?: boolean;
  /** 工具调用 ID（用于撤回） */
  toolCallId?: string;
  /** 文件路径（用于撤回） */
  filePath?: string;
  /** 初始审核状态 */
  reviewStatus?: ReviewStatus;
  /** 是否已应用 */
  isApplied?: boolean;
  /** 审核状态变化回调 */
  onReviewStatusChange?: (status: ReviewStatus) => void;
}

/**
 * CodeMirror Diff 查看器组件（暂不实现，使用简化版）
 */
export function DiffViewer({ oldContent, newContent }: DiffViewerProps) {
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
                <span className="w-12 text-right text-text-tertiary shrink-0 select-none">
                  {line.oldLineNumber ?? '×'}
                </span>
                {/* 新行号 */}
                <span className="w-12 text-right text-text-tertiary shrink-0 select-none">
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
  /** 工具调用 ID（用于撤回） */
  toolCallId?: string;
  /** 初始审核状态 */
  reviewStatus?: ReviewStatus;
  /** 是否已应用 */
  isApplied?: boolean;
  /** 审核状态变化回调 */
  onReviewStatusChange?: (status: ReviewStatus) => void;
  /** 撤回操作回调 */
  onRevert?: () => Promise<boolean>;
}

export function SimpleDiffViewer({
  oldContent,
  newContent,
  toolCallId,
  reviewStatus: initialReviewStatus = 'pending',
  isApplied: initialIsApplied = true,
  onReviewStatusChange,
  onRevert,
}: SimpleDiffViewerProps) {
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(initialReviewStatus);
  const [isApplied, setIsApplied] = useState(initialIsApplied);
  const [isReverting, setIsReverting] = useState(false);

  const diff = computeDiff(oldContent, newContent);

  // 处理接受操作
  const handleAccept = () => {
    const newStatus: ReviewStatus = 'accepted';
    setReviewStatus(newStatus);
    onReviewStatusChange?.(newStatus);
  };

  // 处理拒绝操作
  const handleReject = () => {
    const newStatus: ReviewStatus = 'rejected';
    setReviewStatus(newStatus);
    onReviewStatusChange?.(newStatus);
  };

  // 处理撤回操作
  const handleRevert = async () => {
    if (!toolCallId) return;

    setIsReverting(true);
    try {
      const success = onRevert
        ? await onRevert()
        : await restoreFileVersion(toolCallId);

      if (success) {
        setIsApplied(false);
      } else {
        console.error('Failed to revert changes');
      }
    } finally {
      setIsReverting(false);
    }
  };

  // 获取审核状态显示
  const getReviewStatusDisplay = () => {
    switch (reviewStatus) {
      case 'accepted':
        return { text: '已接受', color: 'text-success', bg: 'bg-success/10' };
      case 'rejected':
        return { text: '已拒绝', color: 'text-danger', bg: 'bg-danger/10' };
      default:
        return { text: '待审核', color: 'text-warning', bg: 'bg-warning/10' };
    }
  };

  const statusDisplay = getReviewStatusDisplay();

  return (
    <div className="h-full w-full flex flex-col overflow-auto font-mono text-sm">
      {/* 差异摘要 */}
      <div className="flex items-center justify-between px-4 py-2 bg-background-elevated border-b border-border text-xs shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-text-secondary">差异摘要</span>
          <span className="text-green-500">+{diff.addedCount} 行添加</span>
          <span className="text-red-500">-{diff.removedCount} 行删除</span>
          {/* 审核状态 */}
          <span className={clsx('px-2 py-0.5 rounded', statusDisplay.bg, statusDisplay.color)}>
            {statusDisplay.text}
          </span>
        </div>

        {/* 操作按钮 */}
        {isApplied && (
          <div className="flex items-center gap-2">
            {reviewStatus === 'pending' && (
              <>
                <button
                  onClick={handleAccept}
                  className="px-3 py-1 bg-success/10 text-success hover:bg-success/20 rounded transition-colors text-xs font-medium"
                >
                  接受
                </button>
                <button
                  onClick={handleReject}
                  className="px-3 py-1 bg-danger/10 text-danger hover:bg-danger/20 rounded transition-colors text-xs font-medium"
                >
                  拒绝
                </button>
              </>
            )}
            <button
              onClick={handleRevert}
              disabled={isReverting || !isApplied}
              className={clsx(
                'px-3 py-1 rounded transition-colors text-xs font-medium',
                isReverting || !isApplied
                  ? 'bg-text-tertiary/20 text-text-tertiary cursor-not-allowed'
                  : 'bg-background-hover text-text-secondary hover:bg-text-tertiary/20'
              )}
            >
              {isReverting ? '撤回中...' : '撤回'}
            </button>
          </div>
        )}

        {!isApplied && (
          <span className="text-text-tertiary text-xs">已撤回</span>
        )}
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
                <span className="w-12 text-right text-text-tertiary shrink-0 select-none">
                  {line.oldLineNumber ?? '×'}
                </span>
                {/* 新行号 */}
                <span className="w-12 text-right text-text-tertiary shrink-0 select-none">
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
