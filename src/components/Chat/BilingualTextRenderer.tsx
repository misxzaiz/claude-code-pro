import { memo, useMemo, useCallback, useState } from 'react';
import { clsx } from 'clsx';
import { Loader2, Languages } from 'lucide-react';
import { useMessageTranslationStore } from '../../stores/messageTranslationStore';
import {
  splitHTMLToSegments,
  wrapTranslationInTag,
  isTranslatableSegment,
  containsChinese,
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
}

export const BilingualTextRenderer = memo(function BilingualTextRenderer({
  messageId,
  content,
  processedHTML,
  codeBlocks,
}: BilingualTextRendererProps) {
  const translation = useMessageTranslationStore((state) => state.getTranslation(messageId));
  const getParagraphTranslation = useMessageTranslationStore((state) => state.getParagraphTranslation);
  const isParagraphTranslating = useMessageTranslationStore((state) => state.isParagraphTranslating);
  const translateParagraph = useMessageTranslationStore((state) => state.translateParagraph);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    paragraphIndex: number;
    segment: ParagraphSegment;
  } | null>(null);

  const segments = useMemo(() => {
    return splitHTMLToSegments(processedHTML, codeBlocks.length);
  }, [processedHTML, codeBlocks.length]);

  const translatedTextMap = useMemo(() => {
    const map = new Map<string, string>();
    if (translation?.paragraphs) {
      for (const p of translation.paragraphs) {
        map.set(p.originalText, p.translatedText);
      }
    }
    return map;
  }, [translation?.paragraphs]);

  const handleParagraphContextMenu = useCallback((e: React.MouseEvent, paragraphIndex: number, segment: ParagraphSegment) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      paragraphIndex,
      segment,
    });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const getTranslatedHTML = useCallback(
    (segment: ParagraphSegment, paragraphIndex: number): string | null => {
      if (translation?.status === 'done') {
        const translatedText = translatedTextMap.get(segment.originalText);
        if (translatedText) {
          return wrapTranslationInTag(translatedText, segment.tagName);
        }
      }

      const paragraphTranslation = getParagraphTranslation(messageId, paragraphIndex);
      if (paragraphTranslation?.status === 'done' && paragraphTranslation.translatedText) {
        return wrapTranslationInTag(paragraphTranslation.translatedText, segment.tagName);
      }

      return null;
    },
    [translation, translatedTextMap, getParagraphTranslation, messageId]
  );

  const isParagraphBeingTranslated = useCallback((paragraphIndex: number): boolean => {
    return isParagraphTranslating(messageId, paragraphIndex);
  }, [isParagraphTranslating, messageId]);

  const renderSegment = (segment: Segment, index: number, paragraphIndex: number) => {
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
      const translatedHTML = getTranslatedHTML(segment, paragraphIndex);
      const showTranslated = !!translatedHTML;
      const isThisParagraphTranslating = isParagraphBeingTranslated(paragraphIndex);
      const hasChinese = containsChinese(segment.originalText);

      return (
        <div 
          key={`para-${index}`} 
          className="paragraph-segment"
          onContextMenu={(e) => !hasChinese && handleParagraphContextMenu(e, paragraphIndex, segment)}
        >
          <div
            className={clsx('original-text', showTranslated && 'opacity-70')}
            dangerouslySetInnerHTML={{ __html: segment.originalHTML }}
          />
          {isThisParagraphTranslating && !showTranslated && (
            <div className="translated-text mt-1 text-text-muted text-sm flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>翻译中...</span>
            </div>
          )}
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

  let paragraphIndex = 0;
  const renderedSegments = segments.map((segment, index) => {
    if (segment.type === 'paragraph') {
      const currentParagraphIndex = paragraphIndex;
      paragraphIndex++;
      return renderSegment(segment, index, currentParagraphIndex);
    }
    return renderSegment(segment, index, -1);
  });

  return (
    <>
      {renderedSegments}
      
      {contextMenu && (
        <ParagraphContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          messageId={messageId}
          paragraphIndex={contextMenu.paragraphIndex}
          segment={contextMenu.segment}
          onClose={handleCloseContextMenu}
          translateParagraph={translateParagraph}
        />
      )}
    </>
  );
});

interface ParagraphContextMenuProps {
  x: number;
  y: number;
  messageId: string;
  paragraphIndex: number;
  segment: ParagraphSegment;
  onClose: () => void;
  translateParagraph: (messageId: string, paragraphIndex: number, originalText: string, tagName: string) => Promise<void>;
}

function ParagraphContextMenu({
  x,
  y,
  messageId,
  paragraphIndex,
  segment,
  onClose,
  translateParagraph,
}: ParagraphContextMenuProps) {
  const paragraphTranslation = useMessageTranslationStore((state) => 
    state.getParagraphTranslation(messageId, paragraphIndex)
  );
  const isTranslating = useMessageTranslationStore((state) => 
    state.isParagraphTranslating(messageId, paragraphIndex)
  );

  const handleTranslate = async () => {
    await translateParagraph(messageId, paragraphIndex, segment.originalText, segment.tagName);
    onClose();
  };

  const isTranslated = paragraphTranslation?.status === 'done';

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 9999,
  };

  return (
    <>
      <div 
        className="fixed inset-0 z-[9998]" 
        onClick={onClose}
      />
      <div
        style={menuStyle}
        className="bg-background-elevated border border-border rounded-lg shadow-xl overflow-hidden min-w-[120px] z-[9999]"
      >
        <button
          onClick={handleTranslate}
          disabled={isTranslating || isTranslated}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-background-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTranslating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Languages className="w-4 h-4" />
          )}
          <span>
            {isTranslating ? '翻译中...' : isTranslated ? '已翻译' : '翻译此段'}
          </span>
        </button>
      </div>
    </>
  );
}
