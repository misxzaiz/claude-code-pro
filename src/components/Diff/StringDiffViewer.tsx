/**
 * 字符串替换 Diff 查看器组件
 * 用于展示 old_string → new_string 的变化
 */

import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { FileText, RotateCcw, ExternalLink, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { revertStringReplace } from '../../services/stringReplaceService';

/** 审核状态 */
export type StringDiffReviewStatus = 'pending' | 'accepted' | 'rejected';

interface StringDiffViewerProps {
  /** 文件路径 */
  filePath: string;
  /** 修改前的字符串 */
  oldString: string;
  /** 修改后的字符串 */
  newString: string;
  /** 是否替换所有匹配 */
  replaceAll?: boolean;
  /** 工具调用 ID（用于撤回） */
  toolCallId: string;
  /** 初始审核状态 */
  initialReviewStatus?: StringDiffReviewStatus;
  /** 初始应用状态 */
  initialIsApplied?: boolean;
  /** 状态变化回调 */
  onStatusChange?: (status: StringDiffReviewStatus, isApplied: boolean) => void;
  /** 打开编辑器回调 */
  onOpenInEditor?: (filePath: string, line?: number) => void;
}

/** 审核状态配置 */
const REVIEW_STATUS_CONFIG: Record<StringDiffReviewStatus, { text: string; bgColor: string; textColor: string }> = {
  accepted: { text: '已应用', bgColor: 'bg-green-500/10', textColor: 'text-green-500' },
  rejected: { text: '已拒绝', bgColor: 'bg-red-500/10', textColor: 'text-red-500' },
  pending: { text: '待审核', bgColor: 'bg-yellow-500/10', textColor: 'text-yellow-500' },
};

/** 检查是否为多行字符串 */
function isMultiline(str: string): boolean {
  return str.includes('\n');
}

/** 获取显示的字符串（截断过长内容） */
function getDisplayString(str: string, maxLength = 100): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}

/** 格式化字符串显示（处理换行和特殊字符） */
function formatStringForDisplay(str: string): string {
  return str
    .replace(/\t/g, '→  ') // 制表符
    .replace(/\n/g, '↵\n'); // 换行符
}

export function StringDiffViewer({
  filePath,
  oldString,
  newString,
  replaceAll = false,
  toolCallId,
  initialReviewStatus = 'accepted',
  initialIsApplied = true,
  onStatusChange,
  onOpenInEditor,
}: StringDiffViewerProps) {
  const [reviewStatus, setReviewStatus] = useState<StringDiffReviewStatus>(initialReviewStatus);
  const [isApplied, setIsApplied] = useState(initialIsApplied);
  const [isReverting, setIsReverting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!isMultiline(oldString) && !isMultiline(newString));
  const [showFull, setShowFull] = useState(false);

  // 获取文件名
  const fileName = useMemo(() => {
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] || filePath;
  }, [filePath]);

  // 判断是否需要截断显示
  const needsTruncate = (oldString.length > 100 || newString.length > 100) && !showFull;

  // 状态配置
  const statusConfig = REVIEW_STATUS_CONFIG[reviewStatus];

  // 处理接受操作
  const handleAccept = () => {
    const newStatus: StringDiffReviewStatus = 'accepted';
    setReviewStatus(newStatus);
    setIsApplied(true);
    onStatusChange?.(newStatus, true);
  };

  // 处理拒绝操作
  const handleReject = () => {
    const newStatus: StringDiffReviewStatus = 'rejected';
    setReviewStatus(newStatus);
    onStatusChange?.(newStatus, isApplied);
  };

  // 处理撤回操作
  const handleRevert = async () => {
    if (!isApplied) return;

    setIsReverting(true);
    try {
      const success = await revertStringReplace(toolCallId, filePath, oldString, newString, replaceAll);
      if (success) {
        setIsApplied(false);
        onStatusChange?.(reviewStatus, false);
      }
    } finally {
      setIsReverting(false);
    }
  };

  // 处理在编辑器中打开
  const handleOpenInEditor = () => {
    onOpenInEditor?.(filePath);
  };

  const oldIsMultiline = isMultiline(oldString);
  const newIsMultiline = isMultiline(newString);
  const hasMultiline = oldIsMultiline || newIsMultiline;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background-surface">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 bg-background-elevated border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-text-tertiary" />
          <span className="text-sm font-medium text-text-primary">{fileName}</span>
          {replaceAll && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-warning/10 text-warning">
              全部替换
            </span>
          )}
          {/* 状态标签 */}
          <span className={clsx('text-xs px-2 py-0.5 rounded', statusConfig.bgColor, statusConfig.textColor)}>
            {isReverting ? '撤回中...' : isApplied ? statusConfig.text : '已撤回'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 待审核状态的操作按钮 */}
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

          {/* 撤回按钮 */}
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

          {/* 在编辑器中打开 */}
          <button
            onClick={handleOpenInEditor}
            className="p-1.5 rounded hover:bg-text-tertiary/10 text-text-tertiary transition-colors"
            title="在编辑器中打开"
          >
            <ExternalLink className="w-4 h-4" />
          </button>

          {/* 展开/收起 */}
          {hasMultiline && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded hover:bg-text-tertiary/10 text-text-tertiary transition-colors"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Diff 内容 */}
      {isExpanded && (
        <div className="p-3 space-y-2">
          {/* 截断提示 */}
          {needsTruncate && (
            <button
              onClick={() => setShowFull(!showFull)}
              className="text-xs text-primary hover:text-primary-hover transition-colors"
            >
              {showFull ? '收起' : '展开完整内容'}
            </button>
          )}

          {/* 删除的内容 */}
          <div className={clsx(
            'rounded p-2 font-mono text-xs',
            'bg-red-500/5 border border-red-500/20'
          )}>
            <div className="flex items-center gap-1.5 mb-1.5 text-red-500">
              <span className="font-bold">-</span>
              <span className="text-text-tertiary">删除</span>
            </div>
            <pre className={clsx(
              'whitespace-pre-wrap break-words text-red-400',
              !showFull && needsTruncate && 'line-clamp-3'
            )}>
              {formatStringForDisplay(needsTruncate && !showFull ? getDisplayString(oldString, 200) : oldString)}
            </pre>
          </div>

          {/* 添加的内容 */}
          <div className={clsx(
            'rounded p-2 font-mono text-xs',
            'bg-green-500/5 border border-green-500/20'
          )}>
            <div className="flex items-center gap-1.5 mb-1.5 text-green-500">
              <span className="font-bold">+</span>
              <span className="text-text-tertiary">添加</span>
            </div>
            <pre className={clsx(
              'whitespace-pre-wrap break-words text-green-400',
              !showFull && needsTruncate && 'line-clamp-3'
            )}>
              {formatStringForDisplay(needsTruncate && !showFull ? getDisplayString(newString, 200) : newString)}
            </pre>
          </div>

          {/* 多行修改提示 */}
          {hasMultiline && (
            <div className="text-xs text-text-tertiary">
              {oldString.split('\n').length} 行 → {newString.split('\n').length} 行
            </div>
          )}
        </div>
      )}
    </div>
  );
}
