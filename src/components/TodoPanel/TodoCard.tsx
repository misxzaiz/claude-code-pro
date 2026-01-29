/**
 * TodoCard - 单个待办卡片
 */

import { Circle, Clock, CheckCircle, Calendar, Timer, Edit, Globe, FolderOpen, Trash2 } from 'lucide-react'
import { useWorkspaceStore } from '@/stores'
import { PriorityIcon } from './PriorityIcon'
import type { TodoItem } from '@/types'

interface TodoCardProps {
  todo: TodoItem
  onEditClick?: (todo: TodoItem) => void
  onToggleStatus?: (todo: TodoItem) => void
  onDeleteClick?: (todo: TodoItem) => void
}

export function TodoCard({ todo, onEditClick, onToggleStatus, onDeleteClick }: TodoCardProps) {
  const workspaces = useWorkspaceStore((state) => state.workspaces)

  // 获取待办所属的工作区
  const todoWorkspace = todo.workspaceId
    ? workspaces.find(w => w.id === todo.workspaceId)
    : null

  const statusConfig = {
    pending: {
      icon: Circle,
      color: 'text-text-tertiary',
      bg: 'bg-background-tertiary',
      label: '待处理',
    },
    in_progress: {
      icon: Clock,
      color: 'text-primary',
      bg: 'bg-primary/10',
      label: '进行中',
    },
    completed: {
      icon: CheckCircle,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
      label: '已完成',
    },
    cancelled: {
      icon: CheckCircle,
      color: 'text-text-tertiary',
      bg: 'bg-background-tertiary',
      label: '已取消',
    },
  }[todo.status]

  const priorityConfig = {
    urgent: { label: '紧急' },
    high: { label: '高' },
    normal: { label: '普通' },
    low: { label: '低' },
  }[todo.priority] || { label: '普通' }

  const StatusIcon = statusConfig.icon

  // 子任务进度计算
  const completedSubtasks = todo.subtasks ? todo.subtasks.filter((st) => st.completed).length : 0
  const totalSubtasks = todo.subtasks?.length || 0
  const subtaskProgress = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0

  const handleToggleStatus = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onToggleStatus) {
      onToggleStatus(todo)
    }
  }

  return (
    <div
      className={`p-3 rounded-lg border transition-all hover:shadow-sm ${
        todo.status === 'in_progress'
          ? 'bg-primary/5 border-primary/30'
          : todo.status === 'completed'
          ? 'bg-green-500/5 border-green-500/30 opacity-60'
          : 'bg-background-surface border-border-subtle hover:border-border'
      }`}
    >
      {/* 头部：状态 + 内容 + 优先级 + 编辑按钮 */}
      <div className="flex items-start gap-2">
        <button
          onClick={handleToggleStatus}
          className={`p-1 rounded ${statusConfig.bg} ${statusConfig.color} hover:opacity-80 transition-all`}
          title={statusConfig.label}
        >
          <StatusIcon size={16} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm break-words ${
                todo.status === 'completed' ? 'line-through text-text-tertiary' : 'text-text-primary'
              }`}
            >
              {todo.content || '<无内容>'}
            </span>
            <span className="text-xs" title={priorityConfig.label}>
              <PriorityIcon priority={todo.priority} size={14} />
            </span>
          </div>

          {/* 标签 */}
          {todo.tags && todo.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              {todo.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-xs text-text-tertiary bg-background-tertiary rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 工作区标记 */}
          {!todoWorkspace ? (
            <div className="mt-1.5 flex items-center gap-1 text-xs text-blue-500">
              <Globe size={12} />
              <span>全局待办</span>
            </div>
          ) : todoWorkspace && (
            <div className="mt-1.5 flex items-center gap-1 text-xs text-purple-500">
              <FolderOpen size={12} />
              <span>{todoWorkspace.name}</span>
            </div>
          )}

          {/* 截止日期 */}
          {todo.dueDate && (
            <div className="mt-1.5 flex items-center gap-1 text-xs">
              <Calendar size={12} />
              <span className={new Date(todo.dueDate) < new Date() ? 'text-red-500 font-medium' : 'text-text-secondary'}>
                {new Date(todo.dueDate).toLocaleDateString('zh-CN', {
                  month: 'short',
                  day: 'numeric',
                })}
                {new Date(todo.dueDate) < new Date() && ' (逾期)'}
              </span>
            </div>
          )}

          {/* 工作量 */}
          {todo.estimatedHours && (
            <div className="mt-1 flex items-center gap-1 text-xs text-text-secondary">
              <Timer size={12} />
              <span>
                {todo.spentHours || 0} / {todo.estimatedHours}h
              </span>
              {todo.estimatedHours && todo.spentHours && (
                <div className="flex-1 ml-2 bg-background-tertiary rounded-full h-1.5 max-w-[60px]">
                  <div
                    className="bg-primary h-1.5 rounded-full"
                    style={{ width: `${Math.min((todo.spentHours / todo.estimatedHours) * 100, 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* 进度信息 */}
          {todo.status === 'in_progress' && todo.lastProgress && (
            <div className="mt-2 text-xs text-text-secondary">
              {todo.lastProgress}
            </div>
          )}

          {/* 相关文件 */}
          {todo.relatedFiles && todo.relatedFiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {todo.relatedFiles.map((file) => (
                <span
                  key={file}
                  className="px-1.5 py-0.5 text-xs text-blue-500 bg-blue-500/10 rounded font-mono max-w-[120px] truncate"
                  title={file}
                >
                  {file.split('/').pop()}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 编辑按钮 */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEditClick?.(todo)
          }}
          className="p-1.5 rounded hover:bg-background-hover text-text-secondary hover:text-text-primary transition-all"
          title="编辑待办"
        >
          <Edit size={14} />
        </button>

        {/* 删除按钮 */}
        {onDeleteClick && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (confirm(`确定要删除待办 "${todo.content}" 吗？`)) {
                onDeleteClick(todo)
              }
            }}
            className="p-1.5 rounded hover:bg-red-500/10 text-text-secondary hover:text-red-500 transition-all"
            title="删除待办"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* 子任务进度条 - 单行显示，悬停显示完整内容 */}
      {totalSubtasks > 0 && (
        <div className="mt-3 group/">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <div className="flex-1 bg-background-tertiary rounded-full h-1.5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${subtaskProgress}%` }}
              />
            </div>
            <span className="whitespace-nowrap">
              {completedSubtasks}/{totalSubtasks}
            </span>
            <span className="text-text-muted">({Math.round(subtaskProgress)}%)</span>
          </div>

          {/* 悬停显示的子任务详情 - 单行省略 */}
          <div className="mt-1.5 flex items-center gap-1 flex-wrap text-xs text-text-secondary">
            {todo.subtasks?.map((subtask, idx) => (
              <span
                key={subtask.id}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded max-w-[150px] truncate ${
                  subtask.completed
                    ? 'bg-green-500/10 text-green-500 line-through'
                    : 'bg-background-tertiary'
                }`}
                title={subtask.title}
              >
                <span className="w-3 h-3 rounded-full border flex items-center justify-center text-[10px]">
                  {idx + 1}
                </span>
                {subtask.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 底部：时间 */}
      <div className="mt-2 text-xs text-text-muted">
        {new Date(todo.createdAt).toLocaleString('zh-CN', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  )
}
