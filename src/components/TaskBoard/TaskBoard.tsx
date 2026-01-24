/**
 * Task Board
 *
 * 任务看板，展示所有任务及其状态
 */

import { useTaskStore } from '../../stores/taskStore'
import { TaskColumn } from './TaskColumn'
import type { TaskStatus } from '../../core/models'

interface TaskBoardProps {
  onTaskClick?: (taskId: string) => void
}

/**
 * 任务看板的列配置
 */
const BOARD_COLUMNS: { status: TaskStatus; title: string; color: string }[] = [
  { status: 'draft', title: '草稿', color: 'border-l-gray-400' },
  { status: 'pending', title: '待执行', color: 'border-l-blue-400' },
  { status: 'running', title: '进行中', color: 'border-l-yellow-400' },
  { status: 'waiting_review', title: '待审查', color: 'border-l-purple-400' },
  { status: 'completed', title: '已完成', color: 'border-l-green-400' },
  { status: 'failed', title: '失败', color: 'border-l-red-400' },
]

export function TaskBoard({ onTaskClick }: TaskBoardProps) {
  const { getAllTasks } = useTaskStore()

  const tasks = getAllTasks()

  // 按状态分组任务
  const tasksByStatus = BOARD_COLUMNS.reduce((acc, column) => {
    acc[column.status] = tasks.filter(task => task.status === column.status)
    return acc
  }, {} as Record<TaskStatus, typeof tasks>)

  return (
    <div className="flex h-full overflow-x-auto gap-4 p-4">
      {BOARD_COLUMNS.map(column => (
        <TaskColumn
          key={column.status}
          status={column.status}
          title={column.title}
          color={column.color}
          tasks={tasksByStatus[column.status] || []}
          onTaskClick={onTaskClick}
        />
      ))}
    </div>
  )
}
