/**
 * Markdown 预览组件
 */

import { useMemo } from 'react';
import { markdownCache } from '../../utils/cache';
import { clsx } from 'clsx';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  const html = useMemo(() => {
    return markdownCache.render(content);
  }, [content]);

  return (
    <div
      className={clsx(
        'h-full w-full overflow-auto p-6 prose prose-invert prose-sm max-w-none',
        'prose-headings:font-semibold prose-headings:text-text-primary',
        'prose-h1:text-xl prose-h2:text-lg prose-h3:text-base',
        'prose-p:text-text-secondary prose-p:leading-relaxed',
        'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
        'prose-code:text-text-primary prose-code:bg-background-hover prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm',
        'prose-pre:bg-background-hover prose-pre:border prose-pre:border-border',
        'prose-strong:text-text-primary',
        'prose-em:text-text-secondary',
        'prose-ul:text-text-secondary prose-ol:text-text-secondary',
        'prose-li:text-text-secondary',
        'prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-primary/5 prose-blockquote:pl-4 prose-blockquote:py-1 prose-blockquote:italic',
        'prose-hr:border-border',
        'prose-th:text-text-primary prose-th:bg-background-hover',
        'prose-td:text-text-secondary',
        'prose-img:rounded-lg prose-img:shadow-lg',
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
