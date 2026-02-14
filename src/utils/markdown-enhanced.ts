/**
 * Markdown 处理增强工具
 *
 * 功能：
 * - 后处理 HTML，将代码块替换为 React 组件
 * - 支持代码高亮和复制功能
 */

import { createElement } from 'react';
import { CodeBlock } from '../components/Chat/CodeBlock';

/**
 * 代码块信息
 */
export interface CodeBlockMatch {
  /** 完整的 HTML（包含 <pre><code>） */
  fullHTML: string;
  /** 提取的代码内容 */
  code: string;
  /** 语言类名（如 language-typescript） */
  className: string;
  /** 在原 HTML 中的起始位置 */
  startIndex: number;
  /** 在原 HTML 中的结束位置 */
  endIndex: number;
}

/**
 * 从 HTML 中提取代码块
 *
 * @param html - Markdown 渲染后的 HTML
 * @returns 代码块列表
 */
export function extractCodeBlocks(html: string): CodeBlockMatch[] {
  const codeBlocks: CodeBlockMatch[] = [];

  // 匹配 <pre><code class="language-xxx">...</code></pre>
  const regex = /<pre><code\s+class="(?:language-)?([^"]*)"(?:[^>]*)>([\s\S]*?)<\/code><\/pre>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const fullHTML = match[0];
    const className = match[1];
    const code = match[2];

    // 解码 HTML 实体
    const decodedCode = code
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    codeBlocks.push({
      fullHTML,
      code: decodedCode,
      className: `language-${className}`,
      startIndex: match.index,
      endIndex: match.index + fullHTML.length,
    });
  }

  return codeBlocks;
}

/**
 * 将 HTML 中的代码块替换为占位符
 *
 * @param html - 原始 HTML
 * @param codeBlocks - 代码块列表
 * @returns 替换后的 HTML 和占位符映射
 */
export function replaceCodeBlocksWithPlaceholders(
  html: string,
  codeBlocks: CodeBlockMatch[]
): {
  processedHTML: string;
  codeBlocks: CodeBlockMatch[];
} {
  let processedHTML = html;

  // 从后向前替换（避免索引变化）
  for (let i = codeBlocks.length - 1; i >= 0; i--) {
    const block = codeBlocks[i];
    const placeholder = `__CODE_BLOCK_${i}__`;
    processedHTML =
      processedHTML.slice(0, block.startIndex) +
      placeholder +
      processedHTML.slice(block.endIndex);
  }

  return {
    processedHTML,
    codeBlocks,
  };
}

/**
 * 将代码块转换为 React 元素
 */
export function codeBlockToReact(block: CodeBlockMatch, index: number): React.ReactNode {
  return createElement(CodeBlock, {
    key: `code-block-${index}`,
    className: block.className,
    children: block.code,
  });
}

/**
 * 检查 HTML 是否包含代码块
 */
export function hasCodeBlocks(html: string): boolean {
  return /<pre><code\s+class="(?:language-)?[^"]*"/.test(html);
}
