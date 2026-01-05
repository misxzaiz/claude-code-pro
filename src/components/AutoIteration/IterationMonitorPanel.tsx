/**
 * 自动迭代监控面板
 */

import { useIterationStore, useChatStore } from '../../stores';
import { PHASE_LABELS } from '../../types/iteration';
import { Button } from '../Common';

interface IterationMonitorPanelProps {
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onMinimize?: () => void;
}

export function IterationMonitorPanel({
  onPause,
  onResume,
  onStop,
  onMinimize,
}: IterationMonitorPanelProps) {
  const iterationStore = useIterationStore();
  const chatStore = useChatStore();

  const {
    phase,
    currentIteration,
    config,
    timeline,
    currentIssues,
    totalIssuesFound,
    totalIssuesFixed,
    planSteps,
    currentStepIndex,
    isPaused,
    isRunning,
  } = iterationStore;

  const { isStreaming, currentContent } = chatStore;

  // 如果没有配置，不显示面板
  if (!config || !isRunning) {
    return null;
  }

  // 计算进度百分比
  const progress = config.maxIterations > 0
    ? Math.min((currentIteration / config.maxIterations) * 100, 100)
    : 0;

  // 格式化时间
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // 获取阶段图标
  const getPhaseIcon = (currentPhase: string) => {
    switch (currentPhase) {
      case 'planning':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        );
      case 'executing':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'reviewing':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'fixing':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37.996.608 2.296.07 2.572-1.065c1.756-.426 1.756-2.924 0-3.35a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c.94-1.543-.826-3.31 2.37-2.37.996-.608 2.296-.07 2.572 1.065z" />
          </svg>
        );
      case 'validating':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        );
      case 'completed':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'paused':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  // 获取阶段颜色
  const getPhaseColor = (currentPhase: string) => {
    switch (currentPhase) {
      case 'planning':
      case 'executing':
        return 'text-primary';
      case 'reviewing':
      case 'fixing':
        return 'text-warning';
      case 'validating':
        return 'text-info';
      case 'completed':
        return 'text-success';
      case 'paused':
        return 'text-text-tertiary';
      case 'failed':
        return 'text-danger';
      default:
        return 'text-text-secondary';
    }
  };

  return (
    <div className="bg-background-elevated border-t border-border p-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 ${getPhaseColor(phase)}`}>
            {getPhaseIcon(phase)}
            <span className="text-sm font-medium">
              {PHASE_LABELS[phase]}
            </span>
            {isStreaming && (
              <span className="flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isPaused ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onResume}
              className="text-xs px-2 py-1"
            >
              <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
              继续
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={onPause}
              className="text-xs px-2 py-1"
            >
              <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
              </svg>
              暂停
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onStop}
            className="text-xs px-2 py-1 text-danger hover:text-danger"
          >
            <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
            停止
          </Button>
          {onMinimize && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onMinimize}
              className="text-xs px-2 py-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </Button>
          )}
        </div>
      </div>

      {/* 进度信息 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* 迭代进度 */}
        <div className="bg-background-surface rounded-lg p-3">
          <div className="text-xs text-text-tertiary mb-1">迭代进度</div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-semibold text-text-primary">{currentIteration}</span>
            <span className="text-xs text-text-tertiary">/ {config.maxIterations}</span>
          </div>
          <div className="mt-2 h-1.5 bg-background-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 问题统计 */}
        <div className="bg-background-surface rounded-lg p-3">
          <div className="text-xs text-text-tertiary mb-1">问题发现/修复</div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-semibold text-text-primary">{totalIssuesFixed}</span>
            <span className="text-xs text-text-tertiary">/ {totalIssuesFound}</span>
          </div>
          {currentIssues.length > 0 && (
            <div className="mt-2 text-xs text-warning">
              当前 {currentIssues.length} 个问题待修复
            </div>
          )}
        </div>

        {/* 当前步骤 */}
        <div className="bg-background-surface rounded-lg p-3">
          <div className="text-xs text-text-tertiary mb-1">当前步骤</div>
          <div className="text-sm text-text-primary truncate">
            {currentStepIndex < planSteps.length
              ? `步骤 ${currentStepIndex + 1}/${planSteps.length}`
              : '-'
            }
          </div>
          {currentStepIndex < planSteps.length && (
            <div className="mt-1 text-xs text-text-tertiary truncate">
              {planSteps[currentStepIndex]?.description}
            </div>
          )}
        </div>
      </div>

      {/* AI 响应预览 */}
      {(isStreaming || currentContent) && (
        <div className="mb-4 p-3 bg-background-surface rounded-lg">
          <div className="text-xs text-text-tertiary mb-1">AI 响应</div>
          <div className="text-sm text-text-secondary max-h-20 overflow-y-auto">
            {currentContent || '等待响应...'}
          </div>
        </div>
      )}

      {/* 时间线 */}
      <div className="bg-background-surface rounded-lg p-3">
        <div className="text-xs text-text-tertiary mb-2">时间线</div>
        <div className="space-y-1.5 max-h-24 overflow-y-auto">
          {timeline.slice(-5).map((event) => (
            <div key={event.id} className="flex items-start gap-2 text-xs">
              <span className="text-text-tertiary shrink-0">{formatTime(event.timestamp)}</span>
              <span className="text-text-secondary">{event.message}</span>
            </div>
          ))}
          {timeline.length === 0 && (
            <div className="text-xs text-text-tertiary text-center py-2">
              等待开始...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
