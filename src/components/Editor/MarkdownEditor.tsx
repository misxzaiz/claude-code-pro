/**
 * Markdown 编辑器组件
 * 支持编辑/预览模式切换
 */

import { useState, useMemo, useCallback } from 'react';
import { CodeMirrorEditor } from './Editor';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { MermaidDiagram } from '../Chat/MermaidDiagram';
import { CodeBlock } from '../Chat/CodeBlock';
import { extractMermaidBlocks, splitMarkdownWithMermaid } from '../../utils/markdown';

interface MarkdownEditorProps {
  /** 编辑器内容 */
  value: string;
  /** 内容变化回调 */
  onChange: (value: string) => void;
  /** 保存回调 */
  onSave?: () => void;
  /** 只读模式 */
  readOnly?: boolean;
}

/** 视图模式 */
type ViewMode = 'edit' | 'preview';

// 配置 marked
marked.setOptions({
  breaks: true,  // 支持 GFM 换行
  gfm: true,     // GitHub Flavored Markdown
});

/** Markdown 渲染器（使用 marked + DOMPurify） */
function formatContent(content: string): string {
  try {
    const raw = marked.parse(content) as string;
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th'],
      ALLOWED_ATTR: ['class', 'href', 'target', 'rel', 'align'],
    });
  } catch {
    // 降级到简单处理
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }
}

export function MarkdownEditor({ value, onChange, onSave, readOnly = false }: MarkdownEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('edit');

  // 预览模式下的渲染处理 - 拆分为文本和 Mermaid 部分
  const previewParts = useMemo(() => {
    return splitMarkdownWithMermaid(value);
  }, [value]);

  // 模式切换
  const handleModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* 模式切换栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle bg-background-elevated">
        <div className="flex items-center gap-1 bg-background-base rounded-lg p-0.5">
          <button
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              viewMode === 'edit'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-tertiary hover:text-text-primary'
            }`}
            onClick={() => handleModeChange('edit')}
            title="编辑模式"
          >
            编辑
          </button>
          <button
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              viewMode === 'preview'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-tertiary hover:text-text-primary'
            }`}
            onClick={() => handleModeChange('preview')}
            title="预览模式"
          >
            预览
          </button>
        </div>

        <div className="flex-1" />
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden relative">
        {/* 编辑模式 */}
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            viewMode === 'edit' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          }`}
        >
          <CodeMirrorEditor
            value={value}
            language="markdown"
            onChange={onChange}
            onSave={onSave}
            readOnly={readOnly}
          />
        </div>

        {/* 预览模式 */}
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            viewMode === 'preview' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          }`}
        >
          <div className="h-full overflow-auto">
            <div className="max-w-none px-6 py-4 prose prose-invert prose-sm">
              {previewParts.map((part, index) => {
                if (part.type === 'mermaid') {
                  // Mermaid 图表
                  return (
                    <div key={`mermaid-${part.id || index}`}>
                      <MermaidDiagram
                        code={part.content}
                        id={part.id || `mermaid-${index}`}
                      />
                    </div>
                  );
                } else {
                  // 普通 Markdown（包含代码块）
                  const html = formatContent(part.content);
                  return (
                    <div
                      key={`text-${index}`}
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  );
                }
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
