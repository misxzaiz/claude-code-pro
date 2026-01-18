/**
 * 内联 Diff 视图组件
 * 用于在聊天消息中展示文件修改差异
 */

import { useState, useMemo } from 'react';
import { computeDiff } from '../../services/diffService';
import { restoreFileVersion } from '../../services/fileVersionService';
import { clsx } from 'clsx';
import { FileText, Check, X, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

/** 审核状态 */
export type DiffReviewStatus = 'pending' | 'accepted' | 'rejected';

interface InlineDiffViewerProps {
  /** 文件路径 */
  filePath: string;
  /** 修改前内容 */
  oldContent: string;
  /** 修改后内容 */
  newContent: string;
  /** 工具调用 ID（用于撤回） */
  toolCallId: string;
  /** 初始审核状态 */
  initialReviewStatus?: DiffReviewStatus;
  /** 初始应用状态 */
  initialIsApplied?: boolean;
  /** 状态变化回调 */
  onStatusChange?: (status: DiffReviewStatus, isApplied: boolean) => void;
}

/** 审核状态配置 */
const REVIEW_STATUS_CONFIG: Record<DiffReviewStatus, { text: string; bgColor: string; textColor: string }> = {
  accepted: { text: '已应用', bgColor: 'bg-green-500/10', textColor: 'text-green-500' },
  rejected: { text: '已拒绝', bgColor: 'bg-red-500/10', textColor: 'text-red-500' },
  pending: { text: '待审核', bgColor: 'bg-yellow-500/10', textColor: 'text-yellow-500' },
};

export function InlineDiffViewer({
  filePath,
  oldContent,
  newContent,
  toolCallId,
  initialReviewStatus = 'accepted',
  initialIsApplied = true,
  onStatusChange,
}: InlineDiffViewerProps) {
  const [reviewStatus, setReviewStatus] = useState<DiffReviewStatus>(initialReviewStatus);
  const [isApplied, setIsApplied] = useState(initialIsApplied);
  const [isReverting, setIsReverting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // 计算 diff
  const diff = useMemo(() => computeDiff(oldContent, newContent), [oldContent, newContent]);

  // 获取文件名
  const fileName = useMemo(() => filePath.split('/').pop() || filePath, [filePath]);

  // 状态配置
  const statusConfig = REVIEW_STATUS_CONFIG[reviewStatus];

  // 处理接受操作
  const handleAccept = () => {
    const newStatus: DiffReviewStatus = 'accepted';
    setReviewStatus(newStatus);
    onStatusChange?.(newStatus, true);
  };

  // 处理拒绝操作
  const handleReject = () => {
    const newStatus: DiffReviewStatus = 'rejected';
    setReviewStatus(newStatus);
    onStatusChange?.(newStatus, isApplied);
  };

  // 处理撤回操作
  const handleRevert = async () => {
    if (!toolCallId || !isApplied) return;

    setIsReverting(true);
    try {
      const success = await restoreFileVersion(toolCallId);
      if (success) {
        setIsApplied(false);
        onStatusChange?.(reviewStatus, false);
      }
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background-surface">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 bg-background-elevated border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-text-tertiary" />
          <span className="text-sm font-medium text-text-primary">{fileName}</span>
          {/* 修改统计 */}
          <span className="text-xs text-text-tertiary">
            {diff.addedCount > 0 && <span className="text-green-500">+{diff.addedCount}</span>}
            {(diff.addedCount > 0 || diff.removedCount > 0) && ' '}
            {diff.removedCount > 0 && <span className="text-red-500">-{diff.removedCount}</span>}
          </span>
          {/* 状态标签 */}
          <span className={clsx('text-xs px-2 py-0.5 rounded', statusConfig.bgColor, statusConfig.textColor)}>
            {isReverting ? '撤回中...' : isApplied ? statusConfig.text : '已撤回'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 操作按钮 */}
          {isApplied && reviewStatus === 'pending' && (
            <>
              <button
                onClick={handleAccept}
                className="p-1.5 rounded hover:bg-green-500/10 text-green-500 transition-colors"
                title="接受修改"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={handleReject}
                className="p-1.5 rounded hover:bg-red-500/10 text-red-500 transition-colors"
                title="拒绝修改"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}

          {isApplied && (
            <button
              onClick={handleRevert}
              disabled={isReverting}
              className={clsx(
                'p-1.5 rounded transition-colors',
                isReverting
                  ? 'text-text-tertiary cursor-not-allowed'
                  : 'hover:bg-text-tertiary/10 text-text-secondary'
              )}
              title="撤回修改"
            >
              <RotateCcw className={clsx('w-4 h-4', isReverting && 'animate-spin')} />
            </button>
          )}

          {/* 展开/收起 */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded hover:bg-text-tertiary/10 text-text-tertiary transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Diff 内容 */}
      {isExpanded && (
        <div className="max-h-96 overflow-y-auto font-mono text-xs">
          {diff.lines.length === 0 ? (
            <div className="text-text-tertiary text-center py-8">无变化</div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {diff.lines.map((line, idx) => (
                <div
                  key={idx}
                  className={clsx(
                    'flex gap-3 px-3 py-0.5',
                    line.type === 'added' && 'bg-green-500/5',
                    line.type === 'removed' && 'bg-red-500/5'
                  )}
                >
                  {/* 旧行号 */}
                  <span className="w-8 text-right text-text-tertiary select-none shrink-0">
                    {line.oldLineNumber ?? '·'}
                  </span>
                  {/* 新行号 */}
                  <span className="w-8 text-right text-text-tertiary select-none shrink-0">
                    {line.newLineNumber ?? '·'}
                  </span>
                  {/* 标记 */}
                  <span
                    className={clsx(
                      'w-4 shrink-0 select-none font-bold',
                      line.type === 'added' && 'text-green-500',
                      line.type === 'removed' && 'text-red-500',
                      line.type === 'context' && 'text-text-tertiary'
                    )}
                  >
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                  </span>
                  {/* 内容 */}
                  <span
                    className={clsx(
                      'flex-1 break-all whitespace-pre-wrap',
                      line.type === 'removed' && 'text-text-tertiary'
                    )}
                  >
                    {line.content || ' '}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
