/**
 * Snapshot Viewer
 *
 * 快照查看器，展示执行结果的快照
 */

import type { RunSnapshot } from '../../core/models'

interface SnapshotViewerProps {
  snapshot: RunSnapshot
}

export function SnapshotViewer({ snapshot }: SnapshotViewerProps) {
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  return (
    <div className="p-4 space-y-4">
      {/* 统计信息 */}
      <div className="flex items-center gap-4 p-3 bg-background-elevated rounded-lg border border-border">
        <div className="text-sm">
          <span className="text-text-secondary">耗时: </span>
          <span className="font-medium text-text-primary">{formatDuration(snapshot.duration)}</span>
        </div>
        {snapshot.tokenUsage && snapshot.tokenUsage.total > 0 && (
          <div className="text-sm">
            <span className="text-text-secondary">Tokens: </span>
            <span className="font-medium text-text-primary">{snapshot.tokenUsage.total}</span>
          </div>
        )}
        {snapshot.fileChanges && snapshot.fileChanges.length > 0 && (
          <div className="text-sm">
            <span className="text-text-secondary">文件变更: </span>
            <span className="font-medium text-text-primary">{snapshot.fileChanges.length}</span>
          </div>
        )}
      </div>

      {/* 消息列表 */}
      <div className="space-y-3">
        {snapshot.messages.map(message => (
          <div
            key={message.id}
            className={`p-3 rounded-lg ${
              message.role === 'user'
                ? 'bg-primary/10 ml-8'
                : 'bg-background-elevated border border-border mr-8'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-medium ${
                message.role === 'user' ? 'text-primary' : 'text-text-secondary'
              }`}>
                {message.role === 'user' ? '用户' : 'Assistant'}
              </span>
              <span className="text-xs text-text-tertiary">
                {new Date(message.timestamp).toLocaleTimeString('zh-CN')}
              </span>
            </div>
            <div className="text-sm text-text-primary whitespace-pre-wrap">
              {message.content}
            </div>
          </div>
        ))}
      </div>

      {/* 工具调用列表 */}
      {snapshot.toolCalls.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-text-primary">工具调用</h4>
          {snapshot.toolCalls.map(toolCall => (
            <div
              key={toolCall.id}
              className="p-3 bg-background-elevated border border-border rounded-lg"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{toolCall.tool}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                    {toolCall.status === 'completed' ? '完成' :
                     toolCall.status === 'failed' ? '失败' :
                     toolCall.status === 'running' ? '执行中' : '等待中'}
                  </span>
                </div>
                {toolCall.endedAt && (
                  <span className="text-xs text-text-tertiary">
                    {formatDuration(Number(toolCall.endedAt) - Number(toolCall.startedAt))}
                  </span>
                )}
              </div>

              {/* 结果 */}
              {toolCall.result !== undefined && (
                <div className="text-xs text-text-secondary">
                  <span className="font-medium">结果:</span>
                  <pre className="mt-1 p-2 bg-background rounded overflow-x-auto max-h-40 overflow-y-auto">
                    {typeof toolCall.result === 'string'
                      ? toolCall.result
                      : JSON.stringify(toolCall.result, null, 2) as string}
                  </pre>
                </div>
              )}

              {/* 错误 */}
              {toolCall.error && (
                <div className="text-xs text-red-600 mt-2">
                  <span className="font-medium">错误:</span>
                  <span>{toolCall.error}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 文件变更列表 */}
      {snapshot.fileChanges && snapshot.fileChanges.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-text-primary">文件变更</h4>
          {snapshot.fileChanges.map((fileChange, index) => (
            <div
              key={index}
              className="p-3 bg-background-elevated border border-border rounded-lg"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  fileChange.type === 'created' ? 'bg-green-100 text-green-700' :
                  fileChange.type === 'modified' ? 'bg-blue-100 text-blue-700' :
                  fileChange.type === 'deleted' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {fileChange.type === 'created' ? '新增' :
                   fileChange.type === 'modified' ? '修改' :
                   fileChange.type === 'deleted' ? '删除' : fileChange.type}
                </span>
                <span className="text-sm text-text-primary font-mono">{fileChange.path}</span>
              </div>

              {/* Diff */}
              {fileChange.diff && (
                <pre className="mt-2 p-2 bg-background rounded text-xs overflow-x-auto max-h-60 overflow-y-auto">
                  {fileChange.diff}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
