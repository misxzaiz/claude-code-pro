import { memo, useMemo, useCallback } from 'react';
import { clsx } from 'clsx';
import { Languages, Loader2 } from 'lucide-react';
import { useMessageTranslationStore } from '../../stores/messageTranslationStore';
import {
  splitHTMLToSegments,
  wrapTranslationInTag,
  isTranslatableSegment,
  type Segment,
  type ParagraphSegment,
} from '../../utils/translateUtils';
import { codeBlockToReact } from '../../utils/markdown-enhanced';
import type { CodeBlockMatch } from '../../utils/markdown-enhanced';

interface BilingualTextRendererProps {
  messageId: string;
  content: string;
  processedHTML: string;
  codeBlocks: CodeBlockMatch[];
  showTranslation?: boolean;
}

function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

export const BilingualTextRenderer = memo(function BilingualTextRenderer({
  messageId,
  content,
  processedHTML,
  codeBlocks,
  showTranslation = true,
}: BilingualTextRendererProps) {
  const translation = useMessageTranslationStore((state) => state.getTranslation(messageId));
  const isTranslating = useMessageTranslationStore((state) => state.isTranslating(messageId));
  const translateMessage = useMessageTranslationStore((state) => state.translateMessage);

  const segments = useMemo(() => {
    return splitHTMLToSegments(processedHTML, codeBlocks.length);
  }, [processedHTML, codeBlocks.length]);

  const translatableParagraphs = useMemo(() => {
    return segments
      .filter(isTranslatableSegment)
      .map((seg) => ({
        originalText: seg.originalText,
        tagName: seg.tagName,
      }));
  }, [segments]);

  const paragraphIndexMap = useMemo(() => {
    const map = new Map<string, number[]>();
    let idx = 0;
    for (const seg of segments) {
      if (seg.type === 'paragraph') {
        const text = seg.originalText;
        if (!map.has(text)) {
          map.set(text, []);
        }
        map.get(text)!.push(idx);
        idx++;
      }
    }
    return map;
  }, [segments]);

  const translatedTextMap = useMemo(() => {
    const map = new Map<string, string>();
    if (translation?.paragraphs) {
      for (const p of translation.paragraphs) {
        map.set(p.originalText, p.translatedText);
      }
    }
    return map;
  }, [translation?.paragraphs]);

  const hasChineseContent = useMemo(() => {
    return translatableParagraphs.some((p) => containsChinese(p.originalText));
  }, [translatableParagraphs]);

  const needsTranslation = useMemo(() => {
    return !hasChineseContent && translatableParagraphs.length > 0;
  }, [hasChineseContent, translatableParagraphs]);

  const handleTranslate = useCallback(() => {
    if (translatableParagraphs.length > 0) {
      translateMessage(messageId, translatableParagraphs);
    }
  }, [messageId, translatableParagraphs, translateMessage]);

  const getTranslatedHTML = useCallback(
    (segment: ParagraphSegment): string | null => {
      if (!translation || (translation.status !== 'done' && translation.status !== 'pending')) return null;

      const translatedText = translatedTextMap.get(segment.originalText);
      if (!translatedText) return null;

      return wrapTranslationInTag(translatedText, segment.tagName);
    },
    [translation, translatedTextMap]
  );

  const renderSegment = (segment: Segment, index: number) => {
    if (segment.type === 'code') {
      return (
        <div key={`code-${index}`} className="my-2">
          {codeBlockToReact(codeBlocks[segment.codeBlockIndex], index)}
        </div>
      );
    }

    if (segment.type === 'other') {
      return (
        <div
          key={`other-${index}`}
          dangerouslySetInnerHTML={{ __html: segment.html }}
        />
      );
    }

    if (segment.type === 'paragraph') {
      const translatedHTML = getTranslatedHTML(segment);
      const showTranslated = translatedHTML && translation?.paragraphs.some(
        p => p.originalText === segment.originalText
      );

      return (
        <div key={`para-${index}`} className="paragraph-segment">
          <div
            className={clsx('original-text', showTranslated && 'opacity-70')}
            dangerouslySetInnerHTML={{ __html: segment.originalHTML }}
          />
          {showTranslated && translatedHTML && (
            <div
              className="translated-text mt-1 text-text-secondary text-sm"
              dangerouslySetInnerHTML={{ __html: translatedHTML }}
            />
          )}
        </div>
      );
    }

    return null;
  };

  if (!showTranslation || !needsTranslation) {
    return (
      <>
        {segments.map((segment, index) => {
          if (segment.type === 'code') {
            return (
              <div key={`code-${index}`} className="my-2">
                {codeBlockToReact(codeBlocks[segment.codeBlockIndex], index)}
              </div>
            );
          }
          if (segment.type === 'other') {
            return (
              <div
                key={`other-${index}`}
                dangerouslySetInnerHTML={{ __html: segment.html }}
              />
            );
          }
          if (segment.type === 'paragraph') {
            return (
              <div
                key={`para-${index}`}
                dangerouslySetInnerHTML={{ __html: segment.originalHTML }}
              />
            );
          }
          return null;
        })}
      </>
    );
  }

  const translatedCount = translation?.paragraphs.length || 0;
  const totalCount = translatableParagraphs.length;
  const progress = isTranslating ? `${translatedCount}/${totalCount}` : '';

  return (
    <div className="bilingual-container relative">
      <button
        onClick={handleTranslate}
        disabled={isTranslating || translation?.status === 'done'}
        className={clsx(
          'absolute -right-2 -top-2 z-10',
          'flex items-center gap-1 px-2 py-1 rounded-md',
          'text-xs transition-all duration-200',
          isTranslating
            ? 'bg-primary/20 text-primary cursor-wait'
            : translation?.status === 'done'
            ? 'bg-success/20 text-success cursor-default'
            : 'bg-background-surface hover:bg-primary/20 text-text-muted hover:text-primary border border-border'
        )}
        title={translation?.status === 'done' ? '已翻译' : '翻译为中文'}
      >
        {isTranslating ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>翻译中 {progress}</span>
          </>
        ) : translation?.status === 'done' ? (
          <>
            <Languages className="w-3 h-3" />
            <span>已翻译</span>
          </>
        ) : (
          <>
            <Languages className="w-3 h-3" />
            <span>翻译</span>
          </>
        )}
      </button>

      {translation?.status === 'error' && (
        <div className="mb-2 p-2 text-xs text-danger bg-danger/10 rounded-md">
          {translation.error}
          <button
            onClick={handleTranslate}
            className="ml-2 underline hover:no-underline"
          >
            重试
          </button>
        </div>
      )}

      {segments.map((segment, index) => renderSegment(segment, index))}
    </div>
  );
});
