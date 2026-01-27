/**
 * TodoFilter - 待办筛选器
 */

import { Circle, Clock, CheckCircle, Calendar } from 'lucide-react'
import type { TodoFilter } from '@/types'

interface TodoFilterComponentProps {
  filter: TodoFilter
  onChange: (filter: Partial<TodoFilter>) => void
}

export function TodoFilter({ filter, onChange }: TodoFilterComponentProps) {
  return (
    <div className="px-4 py-2 border-b border-border-subtle flex flex-col gap-2">
      {/* 第一行：状态筛选 */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange({ ...filter, status: 'all' })}
          className={`px-2 py-1 text-xs rounded transition-all ${
            filter.status === 'all'
              ? 'bg-primary text-white'
              : 'hover:bg-background-hover text-text-secondary'
          }`}
        >
          全部
        </button>
        <button
          onClick={() => onChange({ ...filter, status: 'pending' })}
          className={`px-2 py-1 text-xs rounded flex items-center gap-1 transition-all ${
            filter.status === 'pending'
              ? 'bg-primary text-white'
              : 'hover:bg-background-hover text-text-secondary'
          }`}
        >
          <Circle size={12} />
          待处理
        </button>
        <button
          onClick={() => onChange({ ...filter, status: 'in_progress' })}
          className={`px-2 py-1 text-xs rounded flex items-center gap-1 transition-all ${
            filter.status === 'in_progress'
              ? 'bg-primary text-white'
              : 'hover:bg-background-hover text-text-secondary'
          }`}
        >
          <Clock size={12} />
          进行中
        </button>
        <button
          onClick={() => onChange({ ...filter, status: 'completed' })}
          className={`px-2 py-1 text-xs rounded flex items-center gap-1 transition-all ${
            filter.status === 'completed'
              ? 'bg-primary text-white'
              : 'hover:bg-background-hover text-text-secondary'
          }`}
        >
          <CheckCircle size={12} />
          已完成
        </button>
      </div>

      {/* 第二行：日期筛选 */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange({ ...filter, dateFilter: 'all' })}
          className={`px-2 py-1 text-xs rounded flex items-center gap-1 transition-all ${
            !filter.dateFilter || filter.dateFilter === 'all'
              ? 'bg-primary text-white'
              : 'hover:bg-background-hover text-text-secondary'
          }`}
        >
          全部时间
        </button>
        <button
          onClick={() => onChange({ ...filter, dateFilter: 'overdue' })}
          className={`px-2 py-1 text-xs rounded flex items-center gap-1 transition-all ${
            filter.dateFilter === 'overdue'
              ? 'bg-red-500 text-white'
              : 'hover:bg-background-hover text-text-secondary'
          }`}
        >
          <Calendar size={12} />
          已逾期
        </button>
        <button
          onClick={() => onChange({ ...filter, dateFilter: 'today' })}
          className={`px-2 py-1 text-xs rounded transition-all ${
            filter.dateFilter === 'today'
              ? 'bg-primary text-white'
              : 'hover:bg-background-hover text-text-secondary'
          }`}
        >
          今天
        </button>
        <button
          onClick={() => onChange({ ...filter, dateFilter: 'week' })}
          className={`px-2 py-1 text-xs rounded transition-all ${
            filter.dateFilter === 'week'
              ? 'bg-primary text-white'
              : 'hover:bg-background-hover text-text-secondary'
          }`}
        >
          本周
        </button>
      </div>
    </div>
  )
}
