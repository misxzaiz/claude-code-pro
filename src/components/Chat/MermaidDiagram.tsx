/**
 * Mermaid 图表渲染组件
 *
 * 功能：
 * - 懒加载 mermaid 库，减少首屏体积
 * - 支持暗色主题（匹配项目配色）
 * - 错误处理和友好提示
 * - 加载状态显示
 */

import { memo, useEffect, useRef, useState } from 'react';
import { getMermaidConfig } from '../../utils/mermaid-config';

interface MermaidDiagramProps {
  /** Mermaid 图表代码 */
  code: string;
  /** 唯一标识符（用于生成图表 ID） */
  id: string;
}

/**
 * Mermaid 渲染状态
 */
type RenderState = 'idle' | 'loading' | 'success' | 'error';

/**
 * MermaidDiagram 组件
 *
 * @example
 * ```tsx
 * <MermaidDiagram
 *   code="graph TD\n  A --> B"
 *   id="mermaid-1"
 * />
 * ```
 */
export const MermaidDiagram = memo(function MermaidDiagram({ code, id }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RenderState>('idle');
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let mermaidInstance: any = null;

    const renderDiagram = async () => {
      // 空代码不渲染
      if (!code || !code.trim()) {
        return;
      }

      setState('loading');
      setError(null);

      try {
        // 动态导入 mermaid（懒加载）
        const mermaidModule = await import('mermaid');
        mermaidInstance = mermaidModule.default;

        // 检查是否已初始化
        if (!mermaidInstance.isInitialized?.()) {
          const config = getMermaidConfig('dark');
          mermaidInstance.initialize(config);
        }

        // 生成唯一 ID（避免多个图表冲突）
        const uniqueId = `mermaid-${id}`;

        // 渲染图表
        const { svg } = await mermaidInstance.render(uniqueId, code);

        if (mounted) {
          setSvg(svg);
          setState('success');
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          console.error('Mermaid render error:', err);
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          setError(errorMessage);
          setState('error');
          setSvg('');
        }
      }
    };

    renderDiagram();

    return () => {
      mounted = false;
    };
  }, [code, id]);

  // ===== 渲染状态 =====

  // 1. 错误状态
  if (state === 'error') {
    return (
      <div className="my-4 p-4 bg-danger-faint border border-danger/30 rounded-lg overflow-auto">
        <div className="flex items-start gap-2">
          {/* 错误图标 */}
          <svg
            className="w-5 h-5 text-danger shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>

          <div className="flex-1 min-w-0">
            <p className="text-sm text-danger font-medium">图表渲染失败</p>
            {error && (
              <p className="text-xs text-text-muted mt-1">
                {error.includes('Parse error') ? '语法错误，请检查 Mermaid 代码格式' : error}
              </p>
            )}
            <details className="mt-2">
              <summary className="text-xs text-text-tertiary cursor-pointer hover:text-text-secondary transition-colors">
                查看原始代码
              </summary>
              <pre className="mt-2 text-xs text-text-secondary bg-background-base p-3 rounded border border-border-subtle overflow-auto">
                <code>{code}</code>
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }

  // 2. 加载状态
  if (state === 'loading') {
    return (
      <div className="my-4 p-6 bg-background-surface border border-border-subtle rounded-lg">
        <div className="flex items-center gap-3">
          {/* 加载动画 */}
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-sm text-text-tertiary">正在渲染图表...</p>
        </div>
      </div>
    );
  }

  // 3. 成功状态
  if (state === 'success' && svg) {
    return (
      <div
        ref={ref}
        className="my-4 overflow-auto bg-background-surface border border-border-subtle rounded-lg p-4"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  // 4. 空状态（初始状态）
  return null;
}, (prevProps, nextProps) => {
  // 自定义比较：只在代码或 ID 变化时重新渲染
  return prevProps.code === nextProps.code && prevProps.id === nextProps.id;
});
