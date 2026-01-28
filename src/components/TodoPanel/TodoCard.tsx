/**
 * TodoCard - 单个待办卡片
 */

import { useState } from 'react'
import { Circle, Clock, CheckCircle, Trash2, MoreVertical, Calendar, Timer, ChevronDown, ChevronRight, Edit, Globe, MessageSquare, FolderOpen } from 'lucide-react'
import { useTodoStore, useWorkspaceStore } from '@/stores'
import { PriorityIcon } from './PriorityIcon'
import type { TodoItem } from '@/types'

interface TodoCardProps {
  todo: TodoItem
  onTodoClick?: (todo: TodoItem) => void
  onToggleStatus?: (todo: TodoItem) => void
  onDelete?: (todoId: string) => void
  onToggleSubtask?: (todoId: string, subtaskId: string) => void
}

export function TodoCard({ todo, onTodoClick, onToggleStatus, onDelete, onToggleSubtask }: TodoCardProps) {
  const todoStore = useTodoStore()
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const [showMenu, setShowMenu] = useState(false)
  const [showSubtasks, setShowSubtasks] = useState(false)

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

  const handleDelete = () => {
    if (onDelete) {
      onDelete(todo.id)
    }
  }

  return (
    <div
      className={`p-3 rounded-lg border transition-all hover:shadow-sm cursor-pointer ${
        todo.status === 'in_progress'
          ? 'bg-primary/5 border-primary/30'
          : todo.status === 'completed'
          ? 'bg-green-500/5 border-green-500/30 opacity-60'
          : 'bg-background-surface border-border-subtle hover:border-border'
      }`}
      onClick={() => onTodoClick?.(todo)}
    >
      {/* 头部：状态 + 内容 + 优先级 */}
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

        {/* 更多操作按钮 */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className="p-1 rounded hover:bg-background-hover text-text-secondary hover:text-text-primary transition-all"
          >
            <MoreVertical size={14} />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowMenu(false)
                }}
              />
              <div className="absolute right-0 top-full mt-1 bg-background-elevated border border-border rounded shadow-lg z-20 py-1 min-w-[120px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowMenu(false)
                    onTodoClick?.(todo)
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-background-hover flex items-center gap-2"
                >
                  <Edit size={14} />
                  编辑
                </button>
                {todo.sessionId && (
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      // TODO: 实现跳转到对话的逻辑
                      console.log('跳转到会话:', todo.sessionId)
                      // 可以在这里调用 restoreFromHistory 或切换到对应会话
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-background-hover flex items-center gap-2"
                    title="跳转到关联的对话"
                  >
                    <MessageSquare size={14} />
                    查看对话
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-background-hover flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  删除
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 子任务进度条 */}
      {totalSubtasks > 0 && (
        <div className="mt-3">
          <div
            className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer hover:text-text-primary transition-colors"
            onClick={() => setShowSubtasks(!showSubtasks)}
          >
            {showSubtasks ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>子任务进度</span>
            <span className="ml-auto font-medium">
              {completedSubtasks}/{totalSubtasks}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 bg-background-tertiary rounded-full h-1.5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${subtaskProgress}%` }}
              />
            </div>
            <span className="text-xs text-text-secondary">{Math.round(subtaskProgress)}%</span>
          </div>

          {/* 展开的子任务列表 */}
          {showSubtasks && (
            <div className="mt-2 space-y-1.5 pl-5">
              {todo.subtasks?.map((subtask) => (
                <div
                  key={subtask.id}
                  className="flex items-center gap-2 text-sm group"
                >
                  <input
                    type="checkbox"
                    checked={subtask.completed}
                    onChange={(e) => {
                      e.stopPropagation()
                      if (onToggleSubtask) {
                        onToggleSubtask(todo.id, subtask.id)
                      }
                    }}
                    className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                  />
                  <span
                    className={`flex-1 ${
                      subtask.completed
                        ? 'line-through text-text-tertiary'
                        : 'text-text-secondary'
                    }`}
                  >
                    {subtask.title}
                  </span>
                </div>
              ))}
              {totalSubtasks === 0 && (
                <div className="text-xs text-text-tertiary italic">暂无子任务</div>
              )}
            </div>
          )}
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
