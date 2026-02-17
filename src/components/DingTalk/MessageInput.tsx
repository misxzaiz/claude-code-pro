/**
 * 钉钉消息输入框组件
 */

import { useState, useRef, useEffect } from 'react';
import { Button } from '../Common';

interface MessageInputProps {
  onSend: (content: string, conversationId: string) => void;
  disabled?: boolean;
  defaultConversationId?: string;
  loading?: boolean;
}

export function MessageInput({
  onSend,
  disabled = false,
  defaultConversationId = '',
  loading = false,
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const [conversationId, setConversationId] = useState(defaultConversationId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setConversationId(defaultConversationId);
  }, [defaultConversationId]);

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed || disabled || loading) return;

    onSend(trimmed, conversationId);
    setContent('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

    // 自动调整高度
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  return (
    <div className="border-t border-border bg-background-elevated p-4">
      {/* 会话 ID 输入 */}
      <div className="mb-2">
        <input
          type="text"
          value={conversationId}
          onChange={(e) => setConversationId(e.target.value)}
          placeholder="会话 ID (群聊或单聊 ID)"
          className="w-full px-3 py-2 text-sm bg-background-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          disabled={disabled}
        />
      </div>

      {/* 消息输入框 */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          className="flex-1 px-3 py-2 text-sm bg-background-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
          style={{ minHeight: 36, maxHeight: 120 }}
          rows={1}
          disabled={disabled}
        />

        <Button
          onClick={handleSend}
          disabled={disabled || loading || !content.trim()}
          size="sm"
          variant="primary"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              发送中
            </>
          ) : (
            <>
              <svg
                className="-ml-1 mr-2 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
              发送
            </>
          )}
        </Button>
      </div>

      {/* 提示信息 */}
      <div className="mt-2 text-xs text-text-tertiary">
        💡 提示: 会话 ID 可以在钉钉群设置或单聊中查看
      </div>
    </div>
  );
}
