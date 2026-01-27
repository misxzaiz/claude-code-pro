/**
 * TodoCard - 单个待办卡片
 */

import { useState } from 'react'
import { Circle, Clock, CheckCircle, Trash2, MoreVertical } from 'lucide-react'
import { useTodoStore } from '@/stores'
import type { TodoItem } from '@/types'

interface TodoCardProps {
  todo: TodoItem
}

export function TodoCard({ todo }: TodoCardProps) {
  const todoStore = useTodoStore()
  const [showMenu, setShowMenu] = useState(false)

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
    urgent: { icon: '🔴', label: '紧急' },
    high: { icon: '🟠', label: '高' },
    normal: { icon: '🟢', label: '普通' },
    low: { icon: '⚪', label: '低' },
  }[todo.priority]

  const StatusIcon = statusConfig.icon

  const handleToggleStatus = () => {
    const statusFlow: Record<string, TodoItem['status']> = {
      pending: 'in_progress',
      in_progress: 'completed',
      completed: 'pending',
      cancelled: 'pending',
    }

    todoStore.updateTodo(todo.id, {
      status: statusFlow[todo.status],
    })
  }

  const handleDelete = () => {
    if (confirm('确定要删除这个待办吗？')) {
      todoStore.deleteTodo(todo.id)
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
              {todo.content}
            </span>
            <span className="text-xs" title={priorityConfig.label}>
              {priorityConfig.icon}
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
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-background-hover text-text-secondary hover:text-text-primary transition-all"
          >
            <MoreVertical size={14} />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 bg-background-elevated border border-border rounded shadow-lg z-20 py-1 min-w-[120px]">
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
