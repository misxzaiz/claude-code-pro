import { useState } from 'react';
import { useTranslateStore } from '../../stores';
import { Button } from '../Common';
import { ArrowRightLeft, Copy, Send, Trash2, Clock } from 'lucide-react';

interface TranslatePanelProps {
  onSendToChat?: (text: string) => void;
}

export function TranslatePanel({ onSendToChat }: TranslatePanelProps) {
  const {
    sourceText,
    translatedText,
    direction,
    isTranslating,
    error,
    history,
    setSourceText,
    setDirection,
    translate,
    clearResult,
    removeFromHistory,
    clearHistory,
  } = useTranslateStore();

  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (translatedText) {
      await navigator.clipboard.writeText(translatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendToChat = () => {
    if (translatedText && onSendToChat) {
      onSendToChat(translatedText);
    }
  };

  const handleHistoryClick = (item: { sourceText: string; translatedText: string }) => {
    setSourceText(item.sourceText);
    useTranslateStore.getState().setTranslatedText(item.translatedText);
    setShowHistory(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <ArrowRightLeft size={16} className="text-primary" />
          <span className="text-sm font-medium text-text-primary">翻译</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1.5 rounded transition-colors ${
              showHistory ? 'bg-primary/10 text-primary' : 'text-text-tertiary hover:text-text-primary hover:bg-background-hover'
            }`}
            title="历史记录"
          >
            <Clock size={14} />
          </button>
          <button
            onClick={clearResult}
            className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-background-hover rounded transition-colors"
            title="清空"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {showHistory ? (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-secondary">历史记录</span>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-xs text-text-tertiary hover:text-danger transition-colors"
              >
                清空全部
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <div className="text-center text-text-tertiary text-sm py-8">
              暂无历史记录
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-background-surface rounded-lg border border-border hover:border-primary/30 cursor-pointer transition-colors group"
                  onClick={() => handleHistoryClick(item)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-text-tertiary mb-1">
                        {item.direction === 'toEn' ? '中 → 英' : '英 → 中'}
                      </div>
                      <div className="text-sm text-text-primary truncate">{item.sourceText}</div>
                      <div className="text-sm text-text-secondary truncate mt-1">{item.translatedText}</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromHistory(item.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-text-tertiary hover:text-danger transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setDirection('toEn')}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                direction === 'toEn'
                  ? 'bg-primary text-white'
                  : 'bg-background-surface text-text-secondary hover:text-text-primary'
              }`}
            >
              中 → 英
            </button>
            <button
              onClick={() => setDirection('toZh')}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                direction === 'toZh'
                  ? 'bg-primary text-white'
                  : 'bg-background-surface text-text-secondary hover:text-text-primary'
              }`}
            >
              英 → 中
            </button>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <div className="text-xs text-text-tertiary mb-1">原文</div>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder={direction === 'toEn' ? '输入中文...' : '输入英文...'}
              className="flex-1 min-h-[80px] p-3 bg-background-surface border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary resize-none outline-none focus:border-primary transition-colors"
            />
          </div>

          <Button
            onClick={translate}
            disabled={isTranslating || !sourceText.trim()}
            className="w-full"
          >
            {isTranslating ? '翻译中...' : '翻译'}
          </Button>

          {error && (
            <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
              {error}
            </div>
          )}

          {translatedText && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="text-xs text-text-tertiary mb-1">译文</div>
              <div className="flex-1 min-h-[80px] p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm text-text-primary overflow-y-auto">
                {translatedText}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary bg-background-surface border border-border rounded-lg transition-colors"
                >
                  <Copy size={12} />
                  {copied ? '已复制' : '复制'}
                </button>
                {onSendToChat && (
                  <button
                    onClick={handleSendToChat}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-white bg-primary rounded-lg hover:bg-primary/80 transition-colors"
                  >
                    <Send size={12} />
                    发送到对话
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
