/**
 * Markdown 编辑器组件
 * 支持编辑/预览模式切换
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { CodeMirrorEditor } from './Editor';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { MermaidDiagram } from '../Chat/MermaidDiagram';
import { CodeBlock } from '../Chat/CodeBlock';
import { extractMermaidBlocks } from '../../utils/markdown';
import { extractCodeBlocks, replaceCodeBlocksWithPlaceholders } from '../../utils/markdown-enhanced';

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

  // 预览模式下的渲染处理
  const previewContent = useMemo(() => {
    // 1. 提取 Mermaid 代码块
    const { cleanedMarkdown, mermaidBlocks } = extractMermaidBlocks(value);

    // 2. 渲染为 HTML
    const html = formatContent(cleanedMarkdown);

    // 3. 提取代码块并替换为占位符
    const codeBlocks = extractCodeBlocks(html);
    const { processedHTML } = replaceCodeBlocksWithPlaceholders(html, codeBlocks);

    return {
      html: processedHTML,
      codeBlocks,
      mermaidBlocks,
    };
  }, [value]);

  // 模式切换
  const handleModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Shift + P: 切换到预览
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'p') {
        e.preventDefault();
        setViewMode('preview');
      }
      // Ctrl/Cmd + Shift + E: 切换到编辑
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'e') {
        e.preventDefault();
        setViewMode('edit');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
            title="编辑模式 (Ctrl+Shift+E)"
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
            title="预览模式 (Ctrl+Shift+P)"
          >
            预览
          </button>
        </div>

        <div className="flex-1" />

        {/* 快捷键提示 */}
        <span className="text-xs text-text-muted">
          {viewMode === 'edit' ? 'Ctrl+Shift+P 预览' : 'Ctrl+Shift+E 编辑'}
        </span>
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
              {/* 普通 Markdown 内容 */}
              <div dangerouslySetInnerHTML={{ __html: previewContent.html }} />

              {/* 代码块渲染 */}
              {previewContent.codeBlocks.map((block, index) => (
                <div key={`code-block-${index}`}>
                  <CodeBlock
                    className={block.className}
                    children={block.code}
                  />
                </div>
              ))}

              {/* Mermaid 图表渲染 */}
              {previewContent.mermaidBlocks.map(block => (
                <div key={block.id} className="my-6">
                  <MermaidDiagram
                    code={block.code}
                    id={block.id}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
