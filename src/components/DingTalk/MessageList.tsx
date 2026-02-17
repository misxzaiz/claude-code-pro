/**
 * 钉钉消息列表组件
 */

import type { DingTalkMessage } from '../../types/dingtalk';

// 简单的时间格式化函数
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return date.toLocaleDateString('zh-CN');
}

interface MessageListProps {
  messages: DingTalkMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary">
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 mb-4 opacity-50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <p className="text-sm">暂无消息</p>
          <p className="text-xs mt-2">发送第一条消息开始对话</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}

interface MessageBubbleProps {
  message: DingTalkMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isInbound = message.direction === 'inbound';

  return (
    <div
      className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}
      title={`会话ID: ${message.conversationId}`}
    >
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2 ${
          isInbound
            ? 'bg-primary-faint text-primary border border-primary/20'
            : 'bg-background-elevated border border-border-subtle'
        }`}
      >
        {/* 发送者名称和时间 */}
        <div
          className={`flex items-center gap-2 mb-1 text-xs ${
            isInbound ? 'text-primary/70' : 'text-text-tertiary'
          }`}
        >
          <span className="font-medium">{message.senderName}</span>
          <span>·</span>
          <span>{formatTime(message.timestamp)}</span>
        </div>

        {/* 消息内容 */}
        <div className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </div>

        {/* 发送状态 (仅发送消息显示) */}
        {!isInbound && message.status && (
          <div className="mt-1 text-xs">
            {message.status === 'pending' && (
              <span className="text-text-tertiary">发送中...</span>
            )}
            {message.status === 'sent' && (
              <span className="text-success">已发送</span>
            )}
            {message.status === 'failed' && (
              <span className="text-danger">
                发送失败: {message.error || '未知错误'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
