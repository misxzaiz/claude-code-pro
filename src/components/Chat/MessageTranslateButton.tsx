import { memo, useMemo, useCallback } from 'react';
import { clsx } from 'clsx';
import { Languages, Loader2, Check } from 'lucide-react';
import { useMessageTranslationStore } from '../../stores/messageTranslationStore';
import type { ContentBlock, TextBlock } from '../../types';
import { extractTranslatableParagraphsFromMarkdown, containsChinese } from '../../utils/translateUtils';

interface MessageTranslateButtonProps {
  messageId: string;
  blocks: ContentBlock[];
  isStreaming?: boolean;
}

function extractAllTranslatableContent(blocks: ContentBlock[]): Array<{ originalText: string; tagName: string }> {
  const allParagraphs: Array<{ originalText: string; tagName: string }> = [];
  
  for (const block of blocks) {
    if (block.type === 'text') {
      const textBlock = block as TextBlock;
      const paragraphs = extractTranslatableParagraphsFromMarkdown(textBlock.content);
      allParagraphs.push(...paragraphs);
    }
  }
  
  return allParagraphs;
}

export const MessageTranslateButton = memo(function MessageTranslateButton({
  messageId,
  blocks,
  isStreaming,
}: MessageTranslateButtonProps) {
  const translation = useMessageTranslationStore((state) => state.getTranslation(messageId));
  const progress = useMessageTranslationStore((state) => state.getProgress(messageId));
  const isTranslating = useMessageTranslationStore((state) => state.isTranslating(messageId));
  const translateMessage = useMessageTranslationStore((state) => state.translateMessage);

  const translatableContent = useMemo(() => {
    return extractAllTranslatableContent(blocks);
  }, [blocks]);

  const hasChineseContent = useMemo(() => {
    return translatableContent.some((p) => containsChinese(p.originalText));
  }, [translatableContent]);

  const needsTranslation = useMemo(() => {
    return !hasChineseContent && translatableContent.length > 0;
  }, [hasChineseContent, translatableContent]);

  const handleTranslate = useCallback(() => {
    if (translatableContent.length > 0) {
      translateMessage(messageId, translatableContent);
    }
  }, [messageId, translatableContent, translateMessage]);

  if (isStreaming || !needsTranslation) {
    return null;
  }

  const isDone = translation?.status === 'done';
  const progressPercent = progress ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className="message-translate-control">
      {isTranslating && progress && (
        <div className="translate-progress-bar">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 className="w-3 h-3 animate-spin text-primary" />
            <span className="text-xs text-text-secondary">
              翻译中 {progress.current}/{progress.total}
            </span>
          </div>
          <div className="h-1 bg-background-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
      
      <button
        onClick={handleTranslate}
        disabled={isTranslating || isDone}
        className={clsx(
          'flex items-center gap-1 px-2 py-1 rounded-md',
          'text-xs transition-all duration-200',
          isTranslating
            ? 'bg-primary/20 text-primary cursor-wait'
            : isDone
            ? 'bg-success/20 text-success cursor-default'
            : 'bg-background-surface hover:bg-primary/20 text-text-muted hover:text-primary border border-border'
        )}
        title={isDone ? '已翻译' : '翻译为中文'}
      >
        {isTranslating ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>翻译中</span>
          </>
        ) : isDone ? (
          <>
            <Check className="w-3 h-3" />
            <span>已翻译</span>
          </>
        ) : (
          <>
            <Languages className="w-3 h-3" />
            <span>翻译</span>
          </>
        )}
      </button>
    </div>
  );
});
