/**
 * 自动迭代启动对话框
 */

import { useState } from 'react';
import { Button } from '../Common';
import { ITERATION_MODES, type IterationMode, type IterationConfig } from '../../types/iteration';

interface StartIterationModalProps {
  onClose: () => void;
  onStart: (config: IterationConfig) => void;
}

export function StartIterationModal({ onClose, onStart }: StartIterationModalProps) {
  const [mode, setMode] = useState<IterationMode>('feature');
  const [description, setDescription] = useState('');
  const [maxIterations, setMaxIterations] = useState(10);
  const [autoRunTests, setAutoRunTests] = useState(true);
  const [autoRunBuild, setAutoRunBuild] = useState(true);
  const [pauseAfterEachRound, setPauseAfterEachRound] = useState(false);

  const handleStart = () => {
    if (!description.trim()) {
      return;
    }

    const config: IterationConfig = {
      mode,
      description: description.trim(),
      maxIterations,
      autoRunTests,
      autoRunBuild,
      pauseAfterEachRound,
    };

    onStart(config);
    onClose();
  };

  const selectedModeInfo = ITERATION_MODES[mode];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-elevated rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto shadow-soft">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary">自动项目迭代</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 迭代模式选择 */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-text-secondary mb-2">
            迭代模式
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(ITERATION_MODES) as [IterationMode, typeof ITERATION_MODES[IterationMode]][]).map(
              ([key, info]) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    mode === key
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-border-subtle text-text-secondary'
                  }`}
                >
                  <div className="font-medium text-sm mb-1">{info.label}</div>
                  <div className="text-xs text-text-tertiary">{info.description}</div>
                </button>
              )
            )}
          </div>
        </div>

        {/* 迭代描述 */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-text-secondary mb-2">
            迭代描述
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述你想要实现的目标，例如：为项目添加用户认证功能，包括注册、登录、密码重置..."
            className="w-full h-24 px-3 py-2 bg-background-surface border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary resize-none focus:outline-none focus:border-primary"
          />
          <p className="text-xs text-text-tertiary mt-1">
            {selectedModeInfo.description}
          </p>
        </div>

        {/* 高级选项 */}
        <div className="mb-6 p-4 bg-background-surface rounded-lg border border-border">
          <div className="text-sm font-medium text-text-secondary mb-3">高级选项</div>

          {/* 最大迭代次数 */}
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm text-text-secondary">最大迭代次数</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMaxIterations(Math.max(1, maxIterations - 1))}
                className="w-7 h-7 flex items-center justify-center rounded border border-border hover:border-primary text-text-secondary hover:text-primary transition-colors"
              >
                -
              </button>
              <span className="w-8 text-center text-sm text-text-primary">{maxIterations}</span>
              <button
                onClick={() => setMaxIterations(Math.min(50, maxIterations + 1))}
                className="w-7 h-7 flex items-center justify-center rounded border border-border hover:border-primary text-text-secondary hover:text-primary transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* 自动运行测试 */}
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm text-text-secondary">自动运行测试</label>
            <button
              onClick={() => setAutoRunTests(!autoRunTests)}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                autoRunTests ? 'bg-primary' : 'bg-background-hover'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  autoRunTests ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* 自动运行构建 */}
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm text-text-secondary">自动运行构建</label>
            <button
              onClick={() => setAutoRunBuild(!autoRunBuild)}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                autoRunBuild ? 'bg-primary' : 'bg-background-hover'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  autoRunBuild ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* 每轮后暂停 */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-text-secondary">每轮后暂停</label>
            <button
              onClick={() => setPauseAfterEachRound(!pauseAfterEachRound)}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                pauseAfterEachRound ? 'bg-primary' : 'bg-background-hover'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  pauseAfterEachRound ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            onClick={handleStart}
            disabled={!description.trim()}
            className="min-w-[100px]"
          >
            开始迭代
          </Button>
        </div>
      </div>
    </div>
  );
}
