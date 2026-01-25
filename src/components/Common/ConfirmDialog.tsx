/**
 * 自定义确认对话框组件
 */

import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export function ConfirmDialog({
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  type = 'danger',
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // 自动聚焦确认按钮
  useEffect(() => {
    if (confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, []);

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  // 根据类型设置颜色
  const getColorClass = () => {
    switch (type) {
      case 'danger':
        return 'bg-danger hover:bg-danger/90';
      case 'warning':
        return 'bg-warning hover:bg-warning/90';
      case 'info':
        return 'bg-primary hover:bg-primary/90';
      default:
        return 'bg-primary hover:bg-primary/90';
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-background-elevated rounded-xl p-6 w-full max-w-md border border-border shadow-glow">
        {/* 标题 */}
        {title && (
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            {title}
          </h2>
        )}

        {/* 提示信息 */}
        <p className="text-sm text-text-secondary whitespace-pre-wrap mb-6">
          {message}
        </p>

        {/* 按钮组 */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm text-white rounded-lg transition-colors ${getColorClass()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
