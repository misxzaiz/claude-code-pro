/**
 * 增强版聊天消息列表组件 - 支持内容块架构
 *
 * 核心特性：
 * - Assistant 消息包含 blocks 数组
 * - 工具调用穿插在文本中间显示
 * - 支持流式更新内容块
 */

import { useMemo, memo, useState } from 'react';
import React from 'react';
import { Virtuoso } from 'react-virtuoso';
import { clsx } from 'clsx';
import type { ChatMessage, UserChatMessage, AssistantChatMessage, ContentBlock, TextBlock, ToolCallBlock } from '../../types';
import { useEventChatStore } from '../../stores';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { getToolConfig, extractToolKeyInfo } from '../../utils/toolConfig';
import { formatDuration, calculateDuration, generateOutputSummary } from '../../utils/toolSummary';
import { Check, XCircle, Loader2, AlertTriangle, Play, ChevronDown, ChevronRight } from 'lucide-react';

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

/** Markdown 渲染器 */
function formatContent(content: string): string {
  try {
    const raw = marked.parse(content) as string;
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span', 'div'],
      ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
    });
  } catch {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }
}

/** 用户消息组件 */
const UserBubble = memo(function UserBubble({ message }: { message: UserChatMessage }) {
  return (
    <div className="flex justify-end my-2">
      <div className="max-w-[85%] px-4 py-3 rounded-2xl
                  bg-gradient-to-br from-primary to-primary-600
                  text-white shadow-glow">
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    </div>
  );
});

/** 文本内容块组件 */
const TextBlockRenderer = memo(function TextBlockRenderer({ block }: { block: TextBlock }) {
  const formattedContent = useMemo(() => formatContent(block.content), [block.content]);

  return (
    <div
      className="prose prose-invert prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: formattedContent }}
    />
  );
});

/**
 * 状态图标配置
 */
const STATUS_CONFIG = {
  pending: { icon: Loader2, className: 'animate-spin text-yellow-500', label: '等待中' },
  running: { icon: Play, className: 'text-blue-500 animate-pulse', label: '运行中' },
  completed: { icon: Check, className: 'text-green-500', label: '已完成' },
  failed: { icon: XCircle, className: 'text-red-500', label: '失败' },
  partial: { icon: AlertTriangle, className: 'text-orange-500', label: '部分完成' },
} as const;

/** 工具调用块组件 - 优化版本 */
const ToolCallBlockRenderer = memo(function ToolCallBlockRenderer({ block }: { block: ToolCallBlock }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFullOutput, setShowFullOutput] = useState(false);

  // 获取工具配置
  const toolConfig = useMemo(() => getToolConfig(block.name), [block.name]);

  // 状态图标
  const statusConfig = STATUS_CONFIG[block.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  // 计算耗时
  const duration = useMemo(() => {
    if (block.duration) return formatDuration(block.duration);
    const calculated = calculateDuration(block.startedAt, block.completedAt);
    return calculated ? formatDuration(calculated) : '';
  }, [block.duration, block.startedAt, block.completedAt]);

  // 提取关键信息
  const keyInfo = useMemo(() => extractToolKeyInfo(block.name, block.input), [block.name, block.input]);

  // 生成输出摘要
  const outputSummary = useMemo(() => {
    if (block.status === 'completed' && block.output) {
      return generateOutputSummary(block.name, block.output, block.status);
    }
    return null;
  }, [block.name, block.output, block.status]);

  // 格式化输入参数
  const formatInput = (input: Record<string, unknown>): string => {
    const entries = Object.entries(input);
    if (entries.length === 0) return '';
    return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  };

  // 工具图标组件
  const ToolIcon = toolConfig.icon;

  // 是否可展开（有输入参数或有输出）
  const hasInput = block.input && Object.keys(block.input).length > 0;
  const hasOutput = block.output && block.output.length > 0;
  const hasError = block.status === 'failed' && block.error;
  const canExpand = hasInput || hasOutput || hasError;

  // 状态动画类
  const statusAnimationClass = useMemo(() => {
    switch (block.status) {
      case 'pending':
        return 'animate-pulse border-dashed';
      case 'running':
        return 'animate-pulse';
      case 'completed':
        return '';
      case 'failed':
        return 'animate-shake-once';
      case 'partial':
        return '';
      default:
        return '';
    }
  }, [block.status]);

  return (
    <div
      className={clsx(
        'my-2 rounded-lg overflow-hidden w-full transition-all duration-200',
        'border border-border',
        'bg-background-surface',
        statusAnimationClass
      )}
    >
      {/* 工具调用头部 - 左侧色条 */}
      <div
        className={clsx(
          'flex items-center gap-3 px-3 py-2',
          canExpand ? 'cursor-pointer hover:bg-background-hover' : 'cursor-default',
          'border-l-4',
          toolConfig.borderColor
        )}
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
      >
        {/* 工具类型图标 */}
        <div className={clsx('p-1.5 rounded-md', toolConfig.bgColor)}>
          <ToolIcon className={clsx('w-4 h-4', toolConfig.color)} />
        </div>

        {/* 操作描述 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-secondary">
              {block.status === 'running' ? '正在' : '已'}{toolConfig.label}
            </span>
            {keyInfo && (
              <span className={clsx('font-medium truncate', toolConfig.color)}>
                {keyInfo}
              </span>
            )}
          </div>
          {/* 输出摘要（折叠时显示） */}
          {!isExpanded && outputSummary && (
            <div className="text-xs text-text-tertiary mt-0.5 flex items-center gap-1">
              <span>{outputSummary.summary}</span>
              {outputSummary.expandable && (
                <ChevronRight className="w-3 h-3 shrink-0" />
              )}
            </div>
          )}
        </div>

        {/* 状态与耗时 */}
        <div className="flex items-center gap-2 shrink-0">
          {duration && (
            <span className="text-xs text-text-tertiary">{duration}</span>
          )}
          <StatusIcon className={clsx('w-4 h-4', statusConfig.className)} />
        </div>

        {/* 展开/收起图标 */}
        {canExpand && (
          <ChevronDown
            className={clsx(
              'w-4 h-4 text-text-muted transition-transform shrink-0',
              isExpanded && 'rotate-180'
            )}
          />
        )}
      </div>

      {/* 可展开的详情 */}
      {isExpanded && (
        <div className="px-4 py-3 bg-background-subtle border-t border-border">
          {/* 工具名称和时间 */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-muted font-mono">{block.name}</span>
            <div className="text-xs text-text-tertiary flex gap-3">
              <span>开始: {new Date(block.startedAt).toLocaleTimeString('zh-CN')}</span>
              {block.completedAt && (
                <span>完成: {new Date(block.completedAt).toLocaleTimeString('zh-CN')}</span>
              )}
            </div>
          </div>

          {/* 输入参数 */}
          {hasInput && (
            <div className="mb-3">
              <div className="text-xs text-text-muted mb-1.5 flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                输入参数
              </div>
              <pre className="text-xs text-text-secondary bg-background-surface rounded p-2.5 max-w-full overflow-x-auto font-mono">
                {formatInput(block.input)}
              </pre>
            </div>
          )}

          {/* 输出结果 */}
          {hasOutput && (
            <div className="mb-3">
              <div className="text-xs text-text-muted mb-1.5 flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                输出结果
                {outputSummary && outputSummary.expandable && (
                  <button
                    onClick={() => setShowFullOutput(!showFullOutput)}
                    className="ml-auto text-primary hover:text-primary-hover text-xs"
                  >
                    {showFullOutput ? '收起' : '展开全部'}
                  </button>
                )}
              </div>
              <pre className={clsx(
                'text-xs text-text-secondary bg-background-surface rounded p-2.5 overflow-x-auto font-mono',
                showFullOutput ? 'max-h-96 overflow-y-auto' : 'max-h-48 overflow-y-auto'
              )}>
                {showFullOutput
                  ? (block.output ?? '')
                  : ((block.output ?? '').length > 1000
                    ? (block.output ?? '').slice(0, 1000) + '\n... (内容过长，已截断，点击"展开全部"查看)'
                    : (block.output ?? ''))}
              </pre>
            </div>
          )}

          {/* 错误信息 */}
          {hasError && (
            <div className="mb-3">
              <div className="text-xs text-error mb-1.5 flex items-center gap-1.5">
                <XCircle className="w-3 h-3" />
                错误信息
              </div>
              <pre className="text-xs text-error bg-error-faint rounded p-2.5 overflow-x-auto font-mono">
                {block.error}
              </pre>
            </div>
          )}

          {/* 状态标签 */}
          <div className="flex items-center gap-2">
            <span className={clsx(
              'text-xs px-2 py-0.5 rounded-full',
              toolConfig.bgColor,
              toolConfig.color
            )}>
              {statusConfig.label}
            </span>
            {duration && (
              <span className="text-xs text-text-tertiary">
                耗时 {duration}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

/** 内容块渲染器 */
function renderContentBlock(block: ContentBlock): React.ReactNode {
  switch (block.type) {
    case 'text':
      return <TextBlockRenderer key={`text-${block.content.slice(0, 20)}`} block={block} />;
    case 'tool_call':
      return <ToolCallBlockRenderer key={block.id} block={block} />;
    default:
      return null;
  }
}

/** 助手消息组件 - 使用内容块架构 */
const AssistantBubble = memo(function AssistantBubble({ message }: { message: AssistantChatMessage }) {
  const hasBlocks = message.blocks && message.blocks.length > 0;

  return (
    <div className="flex gap-3 my-2">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-600
                      flex items-center justify-center shadow-glow shrink-0">
        <span className="text-sm font-bold text-white">C</span>
      </div>

      {/* 内容 */}
      <div className="flex-1 space-y-1 min-w-0">
        {/* 头部信息 */}
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-text-primary">Claude</span>
          <span className="text-xs text-text-tertiary">
            {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* 渲染内容块 */}
        {hasBlocks ? (
          <div className="space-y-1">
            {message.blocks.map((block, index) => (
              <div key={index}>
                {renderContentBlock(block)}
              </div>
            ))}
          </div>
        ) : message.content ? (
          // 兼容旧格式（content 字符串）
          <div
            className="prose prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: formatContent(message.content) }}
          />
        ) : null}

        {/* 流式光标 */}
        {message.isStreaming && (
          <span className="inline-flex ml-1">
            <span className="flex gap-0.5 items-end h-4">
              <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </span>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 优化重渲染：只有关键属性变化时才重新渲染
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.isStreaming === nextProps.message.isStreaming &&
    JSON.stringify(prevProps.message.blocks) === JSON.stringify(nextProps.message.blocks)
  );
});

/** 系统消息组件 */
const SystemBubble = memo(function SystemBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-center my-2">
      <p className="text-sm text-text-muted italic">{content}</p>
    </div>
  );
});

/** 消息渲染器 */
function renderChatMessage(message: ChatMessage): React.ReactNode {
  switch (message.type) {
    case 'user':
      return <UserBubble key={message.id} message={message} />;
    case 'assistant':
      return <AssistantBubble key={message.id} message={message} />;
    case 'system':
      return <SystemBubble key={message.id} content={(message as any).content} />;
    default:
      return null;
  }
}

interface EnhancedChatMessagesProps {
  /** 是否正在流式传输 */
  isStreaming?: boolean;
}

/** 空状态组件 */
const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      {/* Logo 图标 */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center shadow-glow mb-6 hover:shadow-glow-lg transition-all">
        <span className="text-3xl font-bold text-white">C</span>
      </div>

      {/* 标题 */}
      <h1 className="text-2xl font-semibold text-text-primary mb-2">
        Claude Code Pro
      </h1>

      {/* 描述 */}
      <p className="text-text-secondary mb-8 max-w-md">
        AI 驱动的代码助手，支持文件操作、代码编辑和智能分析
      </p>

      {/* 功能列表 */}
      <div className="grid grid-cols-3 gap-4 max-w-lg">
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background-surface border border-border shadow-soft hover:shadow-medium hover:border-border-strong transition-all">
          <div className="w-8 h-8 rounded-lg bg-success-faint flex items-center justify-center">
            <span className="text-success text-sm">📁</span>
          </div>
          <span className="text-xs text-text-tertiary">文件操作</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background-surface border border-border shadow-soft hover:shadow-medium hover:border-border-strong transition-all">
          <div className="w-8 h-8 rounded-lg bg-warning-faint flex items-center justify-center">
            <span className="text-warning text-sm">⚡</span>
          </div>
          <span className="text-xs text-text-tertiary">快速编辑</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background-surface border border-border shadow-soft hover:shadow-medium hover:border-border-strong transition-all">
          <div className="w-8 h-8 rounded-lg bg-primary-faint flex items-center justify-center">
            <span className="text-primary text-sm">🔍</span>
          </div>
          <span className="text-xs text-text-tertiary">代码分析</span>
        </div>
      </div>

      {/* 提示 */}
      <p className="text-text-tertiary text-sm mt-8">
        在下方输入框开始对话...
      </p>
    </div>
  );
});

/**
 * 增强版聊天消息列表组件
 *
 * 使用内容块架构渲染消息，工具调用穿插在文本中间
 */
export function EnhancedChatMessages({
  isStreaming: _isStreaming,
}: EnhancedChatMessagesProps) {
  const { messages, archivedMessages, loadArchivedMessages } = useEventChatStore();

  const isEmpty = messages.length === 0;
  const hasArchive = archivedMessages.length > 0;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* 归档消息提示 */}
      {hasArchive && (
        <div className="flex justify-center py-3 bg-background-surface border-b border-border">
          <button
            onClick={loadArchivedMessages}
            className="text-xs text-primary hover:text-primary-hover transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            加载 {archivedMessages.length} 条历史消息
          </button>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 min-h-0">
        <div className="h-full px-4">
          {isEmpty ? (
            <EmptyState />
          ) : (
            <Virtuoso
              style={{ height: '100%' }}
              data={messages}
              itemContent={(_index, item) => renderChatMessage(item)}
              components={{
                EmptyPlaceholder: () => null,
              }}
              followOutput="auto"
              increaseViewportBy={{ top: 100, bottom: 300 }}
              initialTopMostItemIndex={messages.length - 1}
            />
          )}
        </div>
      </div>
    </div>
  );
}
