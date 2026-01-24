/**
 * Run History
 *
 * 展示任务的所有执行记录
 */

import type { RunSummary } from '../../core/models'

interface RunHistoryProps {
  runs: RunSummary[]
  selectedRunId: string | null
  onRunSelect: (runId: string) => void
}

export function RunHistory({ runs, selectedRunId, onRunSelect }: RunHistoryProps) {
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const getStatusIcon = (status: RunSummary['status']) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        )
      case 'failed':
      case 'cancelled':
        return (
          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        )
      case 'running':
        return (
          <svg className="w-4 h-4 text-yellow-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )
      default:
        return (
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
        )
    }
  }

  const getStatusText = (status: RunSummary['status']) => {
    switch (status) {
      case 'completed': return '完成'
      case 'failed': return '失败'
      case 'cancelled': return '已取消'
      case 'running': return '执行中'
      default: return '等待中'
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* 标题 */}
      <div className="p-3 border-b border-border-subtle">
        <h3 className="font-semibold text-text-primary">执行历史</h3>
        <p className="text-xs text-text-secondary mt-1">共 {runs.length} 次执行</p>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {runs.length === 0 ? (
          <div className="p-4 text-center text-text-secondary text-sm">
            暂无执行记录
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {[...runs].reverse().map(run => (
              <button
                key={run.id}
                onClick={() => onRunSelect(run.id)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedRunId === run.id
                    ? 'bg-primary/10 border border-primary/30'
                    : 'bg-background hover:bg-background-hover border border-transparent'
                }`}
              >
                {/* 序号和状态 */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      Run #{run.sequence}
                    </span>
                    {getStatusIcon(run.status)}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    run.status === 'completed' ? 'bg-green-100 text-green-700' :
                    run.status === 'failed' ? 'bg-red-100 text-red-700' :
                    run.status === 'running' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {getStatusText(run.status)}
                  </span>
                </div>

                {/* 统计信息 */}
                <div className="text-xs text-text-secondary space-y-1">
                  <div className="flex items-center justify-between">
                    <span>时间</span>
                    <span>{formatTime(run.startedAt)}</span>
                  </div>

                  {run.status === 'completed' && (
                    <div className="flex items-center justify-between">
                      <span>耗时</span>
                      <span>{formatDuration(run.summary.duration)}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span>消息</span>
                    <span>{run.summary.messageCount}</span>
                  </div>

                  {run.summary.toolCallCount > 0 && (
                    <div className="flex items-center justify-between">
                      <span>工具调用</span>
                      <span>{run.summary.toolCallCount}</span>
                    </div>
                  )}

                  {run.summary.fileChangeCount > 0 && (
                    <div className="flex items-center justify-between">
                      <span>文件变更</span>
                      <span>{run.summary.fileChangeCount}</span>
                    </div>
                  )}

                  {run.hasError && (
                    <div className="flex items-center text-red-600">
                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span>执行出错</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
