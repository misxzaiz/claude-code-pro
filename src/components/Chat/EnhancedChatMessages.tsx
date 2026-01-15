/**
 * 增强版聊天消息列表组件 - 支持新的分层对话流消息类型
 *
 * 支持渲染：
 * - UserMessage
 * - AssistantMessage
 * - ToolMessage (单个工具调用)
 * - ToolGroupMessage (工具组)
 */

import { useMemo, memo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { ChatMessage, UserChatMessage, AssistantChatMessage } from '../../types';
import { ToolBubble } from './ToolBubble';
import { ToolGroupBubble } from './ToolGroupBubble';
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

/** 助手消息组件 */
const AssistantBubble = memo(function AssistantBubble({ message, isStreaming }: { message: AssistantChatMessage; isStreaming?: boolean }) {
  const formattedContent = useMemo(() => formatContent(message.content), [message.content]);

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

        {/* 消息内容 */}
        <div
          className="prose prose-invert prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: formattedContent }}
        />

        {/* 流式光标 */}
        {isStreaming && (
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
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.isStreaming === nextProps.isStreaming
  );
});

/** 系统消息组件 */
const SystemBubble = memo(function SystemBubble({ message }: { message: { content: string } }) {
  return (
    <div className="flex justify-center my-2">
      <p className="text-sm text-text-muted italic">{message.content}</p>
    </div>
  );
});

/** 消息渲染器 */
function renderChatMessage(
  message: ChatMessage,
  toolMessagesMap: Map<string, ChatMessage>,
  isStreaming?: boolean
) {
  switch (message.type) {
    case 'user':
      return <UserBubble key={message.id} message={message} />;

    case 'assistant':
      return <AssistantBubble key={message.id} message={message} isStreaming={isStreaming} />;

    case 'system':
      return <SystemBubble key={message.id} message={message} />;

    case 'tool':
      return <ToolBubble key={message.id} message={message} />;

    case 'tool_group': {
      // 获取工具组包含的工具消息
      const toolMessages: ChatMessage[] = [];
      for (const toolId of message.toolIds) {
        const toolMsg = toolMessagesMap.get(toolId);
        if (toolMsg) {
          toolMessages.push(toolMsg);
        }
      }
      return (
        <ToolGroupBubble
          key={message.id}
          message={message}
          tools={toolMessages.filter(m => m.type === 'tool')}
        />
      );
    }

    default:
      return null;
  }
}

interface EnhancedChatMessagesProps {
  /** 当前流式内容（可选） */
  currentContent?: string;
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
 * 使用 useEventChatStore 获取新的消息类型数据
 */
export function EnhancedChatMessages({
  currentContent = '',
  isStreaming = false,
}: EnhancedChatMessagesProps) {
  const { messages, archivedMessages, loadArchivedMessages } = useEventChatStore();

  // 构建工具消息映射（用于 ToolGroupBubble 获取工具列表）
  const toolMessagesMap = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const msg of messages) {
      if (msg.type === 'tool') {
        map.set(msg.toolId, msg);
      }
    }
    return map;
  }, [messages]);

  // 合并已完成消息和当前流式消息
  const displayData = useMemo(() => {
    const baseData: ChatMessage[] = [...messages];

    // 如果有流式内容，追加为临时消息
    if (isStreaming && currentContent) {
      baseData.push({
        id: 'current-streaming',
        type: 'assistant',
        content: currentContent,
        timestamp: new Date().toISOString(),
        isStreaming: true,
      } as AssistantChatMessage);
    }

    return baseData;
  }, [messages, currentContent, isStreaming]);

  const isEmpty = displayData.length === 0;
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
              data={displayData}
              itemContent={(_index, item) => renderChatMessage(item, toolMessagesMap, isStreaming && item.id === 'current-streaming')}
              components={{
                EmptyPlaceholder: () => null,
              }}
              followOutput="auto"
              increaseViewportBy={{ top: 100, bottom: 300 }}
              initialTopMostItemIndex={displayData.length - 1}
            />
          )}
        </div>
      </div>
    </div>
  );
}
