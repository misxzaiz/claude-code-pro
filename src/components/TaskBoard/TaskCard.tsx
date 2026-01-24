/**
 * Task Card
 *
 * 任务卡片，展示单个任务的简要信息
 */

import type { Task, TaskStatus } from '../../core/models'

interface TaskCardProps {
  task: Task
  onClick?: (taskId: string) => void
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const handleClick = () => {
    if (onClick) {
      onClick(task.id)
    }
  }

  // 计算执行次数
  const runCount = task.runIds.length
  const currentRun = task.activeRunId ? `Run ${runCount}/${runCount}` : `Run ${runCount}/${runCount}`

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return `${Math.floor(diff / 86400000)} 天前`
  }

  // 状态颜色
  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-700'
      case 'pending': return 'bg-blue-100 text-blue-700'
      case 'running': return 'bg-yellow-100 text-yellow-700'
      case 'waiting_review': return 'bg-purple-100 text-purple-700'
      case 'completed': return 'bg-green-100 text-green-700'
      case 'failed': return 'bg-red-100 text-red-700'
      case 'cancelled': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <button
      onClick={handleClick}
      className="w-full text-left p-3 bg-background hover:bg-background-hover border border-border rounded-lg transition-colors"
    >
      {/* 任务标题 */}
      <div className="font-medium text-text-primary text-sm mb-2 line-clamp-2">
        {task.title}
      </div>

      {/* 任务元信息 */}
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <div className="flex items-center gap-2">
          {/* 状态标签 */}
          <span className={`px-2 py-0.5 rounded ${getStatusColor(task.status)}`}>
            {task.status === 'waiting_review' ? '待审查' :
             task.status === 'running' ? '执行中' :
             task.status === 'completed' ? '已完成' :
             task.status === 'failed' ? '失败' :
             task.status === 'draft' ? '草稿' : task.status}
          </span>

          {/* Agent 类型 */}
          <span className="text-text-tertiary">
            {task.agentType === 'claude-code' ? 'Claude' : 'IFlow'}
          </span>
        </div>

        {/* 执行次数 */}
        {runCount > 0 && (
          <span className="text-text-tertiary">
            {currentRun}
          </span>
        )}
      </div>

      {/* 标签 */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 bg-background-elevated text-text-secondary rounded"
            >
              #{tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-xs px-2 py-0.5 bg-background-elevated text-text-secondary rounded">
              +{task.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* 时间 */}
      <div className="mt-2 text-xs text-text-tertiary">
        {formatTime(task.updatedAt)}
      </div>
    </button>
  )
}
