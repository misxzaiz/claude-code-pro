import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslateStore, useConfigStore, useViewStore } from '../../stores';
import { baiduTranslate } from '../../services/tauri';
import { Languages, Copy, Send, X } from 'lucide-react';

interface Position {
  x: number;
  y: number;
}

interface SelectionInfo {
  text: string;
  position: Position;
}

function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

export function GlobalTranslateMenu() {
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [translatedText, setTranslatedText] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const config = useConfigStore((state) => state.config);
  const setLeftPanelType = useViewStore((state) => state.setLeftPanelType);
  const setSourceText = useTranslateStore((state) => state.setSourceText);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    const selectedText = window.getSelection()?.toString().trim();
    if (selectedText && selectedText.length > 0 && selectedText.length < 5000) {
      e.preventDefault();
      setSelection({
        text: selectedText,
        position: { x: e.clientX, y: e.clientY },
      });
      setTranslatedText('');
      setError(null);
    }
  }, []);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setSelection(null);
      setTranslatedText('');
      setError(null);
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSelection(null);
      setTranslatedText('');
      setError(null);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleContextMenu, handleClickOutside, handleKeyDown]);

  const handleTranslate = async (targetLang?: string) => {
    if (!selection) return;

    const baiduConfig = config?.baiduTranslate;
    if (!baiduConfig?.appId || !baiduConfig?.secretKey) {
      setError('请先在设置中配置百度翻译 API');
      return;
    }

    const isChinese = containsChinese(selection.text);
    const to = targetLang || (isChinese ? 'en' : 'zh');

    setIsTranslating(true);
    setError(null);

    try {
      const result = await baiduTranslate(
        selection.text,
        baiduConfig.appId,
        baiduConfig.secretKey,
        to
      );

      if (result.success && result.result) {
        setTranslatedText(result.result);
      } else {
        setError(result.error || '翻译失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '翻译请求失败');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopy = async () => {
    if (translatedText) {
      await navigator.clipboard.writeText(translatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendToPanel = () => {
    if (selection) {
      setSourceText(selection.text);
      setLeftPanelType('translate');
      setSelection(null);
    }
  };

  const handleClose = () => {
    setSelection(null);
    setTranslatedText('');
    setError(null);
  };

  if (!selection) return null;

  const isChinese = containsChinese(selection.text);
  const buttonText = isChinese ? '翻译为英语' : '翻译为中文';

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: selection.position.x,
    top: selection.position.y,
    zIndex: 9999,
  };

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="bg-background-elevated border border-border rounded-xl shadow-xl overflow-hidden min-w-[200px] max-w-[360px]"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background-surface">
        <div className="flex items-center gap-2">
          <Languages size={14} className="text-primary" />
          <span className="text-xs font-medium text-text-primary">翻译</span>
        </div>
        <button
          onClick={handleClose}
          className="p-1 text-text-tertiary hover:text-text-primary rounded transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      <div className="p-3">
        <div className="text-xs text-text-tertiary mb-1">选中文本:</div>
        <div className="text-sm text-text-primary bg-background-surface p-2 rounded-lg max-h-[100px] overflow-y-auto">
          {selection.text.length > 200 ? selection.text.slice(0, 200) + '...' : selection.text}
        </div>
      </div>

      {!translatedText && !error && (
        <div className="px-3 pb-3">
          <button
            onClick={() => handleTranslate()}
            disabled={isTranslating}
            className="w-full py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-50 transition-colors"
          >
            {isTranslating ? '翻译中...' : buttonText}
          </button>
        </div>
      )}

      {error && (
        <div className="px-3 pb-3">
          <div className="p-2 text-sm text-danger bg-danger/10 rounded-lg">
            {error}
          </div>
          <button
            onClick={() => handleTranslate()}
            disabled={isTranslating}
            className="w-full mt-2 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-50 transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {translatedText && (
        <div className="px-3 pb-3">
          <div className="text-xs text-text-tertiary mb-1">翻译结果:</div>
          <div className="text-sm text-text-primary bg-primary/5 border border-primary/20 p-2 rounded-lg max-h-[150px] overflow-y-auto">
            {translatedText}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-text-secondary hover:text-text-primary bg-background-surface border border-border rounded-lg transition-colors"
            >
              <Copy size={12} />
              {copied ? '已复制' : '复制'}
            </button>
            <button
              onClick={handleSendToPanel}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-white bg-primary rounded-lg hover:bg-primary/80 transition-colors"
            >
              <Send size={12} />
              发送到面板
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
