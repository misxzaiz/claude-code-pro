/**
 * 增强版聊天消息列表组件 - 支持内容块架构
 *
 * 核心特性：
 * - Assistant 消息包含 blocks 数组
 * - 工具调用穿插在文本中间显示
 * - 支持流式更新内容块
 */

import { useMemo, memo } from 'react';
import React from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { ChatMessage, UserChatMessage, AssistantChatMessage, ContentBlock, TextBlock, ToolCallBlock } from '../../types';
import { useEventChatStore } from '../../stores';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

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

/** 工具调用块组件 */
const ToolCallBlockRenderer = memo(function ToolCallBlockRenderer({ block }: { block: ToolCallBlock }) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  // 状态图标
  const statusIcon = useMemo(() => {
    switch (block.status) {
      case 'pending':
        return <span className="text-warning">⏳</span>;
      case 'running':
        return <span className="text-primary animate-pulse">▶</span>;
      case 'completed':
        return <span className="text-success">✓</span>;
      case 'failed':
        return <span className="text-error">✗</span>;
      default:
        return <span className="text-text-muted">•</span>;
    }
  }, [block.status]);

  // 格式化输入参数
  const formatInput = (input: Record<string, unknown>): string => {
    const entries = Object.entries(input);
    if (entries.length === 0) return '';
    return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  };

  // 工具名称显示优化
  const displayToolName = useMemo(() => {
    return block.name
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/^./, (c) => c.toUpperCase());
  }, [block.name]);

  return (
    <div className="my-2 rounded-lg bg-background-surface border border-border overflow-hidden">
      {/* 工具调用头部 */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-background-hover transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* 状态图标 */}
        <span className="text-lg">{statusIcon}</span>

        {/* 工具名称 */}
        <span className="font-medium text-text-primary flex-1">
          {displayToolName}
        </span>

        {/* 状态文本 */}
        <span className="text-xs text-text-tertiary">
          {block.status === 'pending' && '等待中'}
          {block.status === 'running' && '执行中'}
          {block.status === 'completed' && `已完成 ${block.duration ? `(${block.duration}ms)` : ''}`}
          {block.status === 'failed' && '失败'}
        </span>

        {/* 展开/收起图标 */}
        <span className={`text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>

      {/* 可展开的详情 */}
      {isExpanded && (
        <div className="px-4 py-3 bg-background-subtle border-t border-border">
          {/* 输入参数 */}
          {block.input && Object.keys(block.input).length > 0 && (
            <div className="mb-2">
              <div className="text-xs text-text-muted mb-1">输入参数:</div>
              <pre className="text-xs text-text-secondary bg-background-surface rounded p-2 overflow-x-auto">
                {formatInput(block.input)}
              </pre>
            </div>
          )}

          {/* 输出结果 */}
          {block.status === 'completed' && block.output && (
            <div className="mb-2">
              <div className="text-xs text-text-muted mb-1">输出结果:</div>
              <pre className="text-xs text-text-secondary bg-background-surface rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
                {block.output.length > 500
                  ? block.output.slice(0, 500) + '...'
                  : block.output}
              </pre>
            </div>
          )}

          {/* 错误信息 */}
          {block.status === 'failed' && block.error && (
            <div>
              <div className="text-xs text-error mb-1">错误:</div>
              <pre className="text-xs text-error bg-error-faint rounded p-2 overflow-x-auto">
                {block.error}
              </pre>
            </div>
          )}

          {/* 时间信息 */}
          <div className="text-xs text-text-tertiary flex gap-4">
            <span>开始: {new Date(block.startedAt).toLocaleTimeString('zh-CN')}</span>
            {block.completedAt && (
              <span>完成: {new Date(block.completedAt).toLocaleTimeString('zh-CN')}</span>
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
      <div className="flex-1 space-y-1">
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
        <div className="h-full max-w-3xl mx-auto px-4">
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
