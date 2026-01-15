/**
 * ToolGroupBubble - 工具组消息组件
 *
 * 将多个工具调用聚合展示，支持折叠/展开
 */

import { memo, useState, useMemo } from 'react';
import { type ToolGroupChatMessage, type ToolChatMessage, type ToolStatus } from '../../types';
import { formatDuration, calculateToolGroupStatus } from '../../utils/toolSummary';
import {
  IconRunning, IconCompleted, IconFailed, IconPartial,
  IconChevronRight, IconChevronDown
} from '../Common/Icons';

interface ToolGroupBubbleProps {
  message: ToolGroupChatMessage;
  /** 工具组包含的工具消息列表 */
  tools: ToolChatMessage[];
}

/** 获取组状态图标 */
function getGroupStatusIcon(status: ToolStatus) {
  switch (status) {
    case 'pending':
      return null;
    case 'running':
      return IconRunning;
    case 'completed':
      return IconCompleted;
    case 'failed':
      return IconFailed;
    case 'partial':
      return IconPartial;
    default:
      return null;
  }
}

/** 获取状态颜色类名 */
function getStatusColor(status: ToolStatus): string {
  switch (status) {
    case 'pending':
      return 'text-text-muted';
    case 'running':
      return 'text-warning animate-pulse';
    case 'completed':
      return 'text-success';
    case 'failed':
      return 'text-error';
    case 'partial':
      return 'text-warning';
    default:
      return 'text-text-muted';
  }
}

/** 单个工具项展示 */
const ToolItem = memo(function ToolItem({ tool }: { tool: ToolChatMessage }) {
  let StatusIcon = tool.status === 'completed' ? IconCompleted :
                    tool.status === 'failed' ? IconFailed :
                    tool.status === 'running' ? IconRunning :
                    tool.status === 'partial' ? IconPartial : null;

  const duration = tool.duration ||
    (tool.completedAt ? formatDuration(
      new Date(tool.completedAt).getTime() - new Date(tool.startedAt).getTime()
    ) : undefined);

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-background-surface border border-border-subtle">
      {StatusIcon && (
        <div className={clsx("shrink-0", getStatusColor(tool.status))}>
          <StatusIcon size={12} />
        </div>
      )}
      <span className="text-sm text-text-secondary flex-1 truncate">
        {tool.summary}
      </span>
      {duration && (
        <span className="text-xs text-text-tertiary shrink-0">
          {duration}
        </span>
      )}
    </div>
  );
});

function clsx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export const ToolGroupBubble = memo(function ToolGroupBubble({
  message,
  tools
}: ToolGroupBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAllTools, setShowAllTools] = useState(false);

  // 计算组状态（可能比 message.status 更新）
  const groupStatus = useMemo(() => {
    return calculateToolGroupStatus(tools);
  }, [tools]);

  const StatusIcon = getGroupStatusIcon(groupStatus);

  // 计算时长
  const duration = message.duration ||
    (message.completedAt ? formatDuration(
      new Date(message.completedAt).getTime() - new Date(message.startedAt).getTime()
    ) : undefined);

  // 显示的工具列表（默认最多显示 3 个）
  const displayedTools = showAllTools ? tools : tools.slice(0, 3);
  const hasMoreTools = tools.length > 3;

  // 统计各状态工具数量
  const stats = useMemo(() => {
    const completed = tools.filter(t => t.status === 'completed').length;
    const failed = tools.filter(t => t.status === 'failed').length;
    const running = tools.filter(t => t.status === 'running').length;
    return { completed, failed, running };
  }, [tools]);

  return (
    <div className="my-2">
      {/* 工具组摘要 */}
      <div
        className={clsx(
          "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all hover:shadow-medium",
          groupStatus === 'running' && "bg-warning-faint border-warning/30",
          groupStatus === 'completed' && "bg-success-faint border-success/30",
          (groupStatus === 'failed' || groupStatus === 'partial') && "bg-warning-faint border-warning/30",
          groupStatus === 'pending' && "bg-background-surface border-border",
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* 状态图标 */}
        {StatusIcon && (
          <div className={clsx("shrink-0", getStatusColor(groupStatus))}>
            <StatusIcon size={14} />
          </div>
        )}

        {/* 摘要内容 */}
        <div className="flex-1">
          <span className={clsx(
            "text-sm",
            groupStatus === 'running' ? "text-text-primary" : "text-text-secondary"
          )}>
            {message.summary}
          </span>

          {/* 状态统计 */}
          {tools.length > 0 && (
            <span className="ml-2 text-xs text-text-tertiary">
              {stats.completed > 0 && `${stats.completed} 完成`}
              {stats.running > 0 && ` ${stats.running} 进行中`}
              {stats.failed > 0 && ` ${stats.failed} 失败`}
            </span>
          )}
        </div>

        {/* 时长 */}
        {duration && (
          <span className="text-xs text-text-tertiary">
            {duration}
          </span>
        )}

        {/* 展开/折叠图标 */}
        <div className="shrink-0 text-text-subtle">
          {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        </div>
      </div>

      {/* 展开后的工具列表 */}
      {isExpanded && tools.length > 0 && (
        <div className="mt-2 ml-4 space-y-1.5">
          {displayedTools.map((tool) => (
            <ToolItem key={tool.id} tool={tool} />
          ))}

          {/* 显示更多按钮 */}
          {hasMoreTools && !showAllTools && (
            <button
              onClick={() => setShowAllTools(true)}
              className="w-full px-3 py-2 text-xs text-primary hover:text-primary-hover hover:bg-background-hover rounded-md transition-colors"
            >
              查看全部 {tools.length} 个工具
            </button>
          )}
        </div>
      )}
    </div>
  );
});
