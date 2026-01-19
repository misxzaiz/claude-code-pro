/**
 * CodeMirror 6 编辑器组件
 */

import { useEffect, useRef, useMemo } from 'react';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  lineNumbers,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { lintGutter } from '@codemirror/lint';

// 现代化主题
import { modernTheme } from './modernTheme';

// 获取语言扩展
async function getLanguageExtension(lang: string) {
  const langMap: Record<string, any> = {
    // JavaScript / TypeScript
    javascript: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true })),
    typescript: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true, typescript: true })),
    json: () => import('@codemirror/lang-json').then(m => m.json()),
    // Web
    html: () => import('@codemirror/lang-html').then(m => m.html()),
    css: () => import('@codemirror/lang-css').then(m => m.css()),
    // Markdown
    markdown: () => import('@codemirror/lang-markdown').then(m => m.markdown()),
    // Python
    python: () => import('@codemirror/lang-python').then(m => m.python()),
    // Java
    java: () => import('@codemirror/lang-java').then(m => m.java()),
    // Rust
    rust: () => import('@codemirror/lang-rust').then(m => m.rust()),
    // C/C++
    c: () => import('@codemirror/lang-cpp').then(m => m.cpp()),
    cpp: () => import('@codemirror/lang-cpp').then(m => m.cpp()),
    // Go
    go: () => import('@codemirror/lang-go').then(m => m.go()),
    // SQL
    sql: () => import('@codemirror/lang-sql').then(m => m.sql()),
    // XML
    xml: () => import('@codemirror/lang-xml').then(m => m.xml()),
  };

  return langMap[lang]?.() || Promise.resolve(null);
}

interface EditorProps {
  /** 编辑器内容 */
  value: string;
  /** 语言类型 */
  language: string;
  /** 内容变化回调 */
  onChange: (value: string) => void;
  /** 只读模式 */
  readOnly?: boolean;
  /** 保存回调 */
  onSave?: () => void;
  /** 是否显示行号 */
  lineNumbers?: boolean;
}

export function CodeMirrorEditor({
  value,
  language,
  onChange,
  readOnly = false,
  onSave,
  lineNumbers: showLineNumbers = true,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // 自定义保存快捷键
  const saveKeymap = useMemo(
    () => keymap.of(onSave ? [{ key: 'Mod-s', run: () => { onSave(); return true; } }] : []),
    [onSave]
  );

  // 初始化编辑器（组件通过 key 属性强制重新挂载，所以只需在挂载时执行一次）
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    // 异步创建编辑器（需要加载语言扩展）
    const createEditor = async () => {
      // 异步加载语言扩展
      const langExtension = await getLanguageExtension(language);

      // 如果组件已卸载，不继续
      if (cancelled || !containerRef.current) return;

      // 基础扩展数组
      const extensions = [
        modernTheme,
        highlightSpecialChars(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        showLineNumbers ? lineNumbers() : [],
        highlightSelectionMatches(),
        history(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        EditorView.editable.of(!readOnly),
        saveKeymap,
        keymap.of(defaultKeymap),
        keymap.of(historyKeymap),
        keymap.of(closeBracketsKeymap),
        keymap.of(searchKeymap),
        lintGutter(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newValue = update.state.doc.toString();
            onChange(newValue);
          }
        }),
      ];

      // 如果语言扩展加载成功，添加到扩展数组中
      if (langExtension) {
        extensions.push(langExtension);
      }

      // 创建编辑器状态
      const state = EditorState.create({
        doc: value,
        extensions,
      });

      // 创建编辑器视图
      const view = new EditorView({
        state,
        parent: containerRef.current,
      });
      viewRef.current = view;
    };

    createEditor();

    // 清理函数
    return () => {
      cancelled = true;
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
    // 只在组件挂载时执行，props 变化时通过 key 强制重新挂载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
    />
  );
}
