/**
 * Task Column
 *
 * 任务列，展示某一状态的所有任务
 */

import { TaskCard } from './TaskCard'
import type { Task, TaskStatus } from '../../core/models'

interface TaskColumnProps {
  status: TaskStatus
  title: string
  color: string
  tasks: Task[]
  onTaskClick?: (taskId: string) => void
}

export function TaskColumn({ title, color, tasks, onTaskClick }: TaskColumnProps) {
  return (
    <div className={`flex-shrink-0 w-80 flex flex-col border-l-4 ${color} bg-background-elevated rounded-lg`}>
      {/* 列标题 */}
      <div className="p-3 border-b border-border-subtle">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary">{title}</h3>
          <span className="text-sm text-text-secondary">{tasks.length}</span>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {tasks.length === 0 ? (
          <div className="text-center text-text-secondary text-sm py-8">
            暂无任务
          </div>
        ) : (
          tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={onTaskClick}
            />
          ))
        )}
      </div>
    </div>
  )
}
