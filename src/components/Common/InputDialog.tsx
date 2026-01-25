/**
 * 自定义输入对话框组件
 */

import { useEffect, useRef, useState } from 'react';

interface InputDialogProps {
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  validate?: (value: string) => string | null; // 返回错误信息，null 表示验证通过
}

export function InputDialog({
  title,
  message,
  defaultValue = '',
  placeholder = '',
  onConfirm,
  onCancel,
  validate,
}: InputDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动聚焦输入框
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  // 处理确认
  const handleConfirm = () => {
    // 如果有验证函数，先验证
    if (validate) {
      const validationError = validate(value);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    onConfirm(value.trim());
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  // 输入变化时清除错误
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setError(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-elevated rounded-xl p-6 w-full max-w-md border border-border shadow-glow">
        {/* 标题 */}
        <h2 className="text-lg font-semibold text-text-primary mb-2">
          {title}
        </h2>

        {/* 提示信息 */}
        {message && (
          <p className="text-sm text-text-secondary mb-4">
            {message}
          </p>
        )}

        {/* 输入框 */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full px-3 py-2 bg-background-surface border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 transition-colors ${
            error
              ? 'border-danger focus:ring-danger'
              : 'border-border focus:ring-primary'
          }`}
        />

        {/* 错误提示 */}
        {error && (
          <p className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}

        {/* 按钮组 */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!value.trim()}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
