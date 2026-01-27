/**
 * TodoFilter - 待办筛选器
 */

import { Circle, Clock, CheckCircle, XCircle } from 'lucide-react'

interface TodoFilterProps {
  filter: {
    status: 'all' | 'pending' | 'in_progress' | 'completed'
    priority?: 'low' | 'normal' | 'high' | 'urgent'
  }
  onChange: (filter: TodoFilterProps['filter']) => void
}

export function TodoFilter({ filter, onChange }: TodoFilterProps) {
  return (
    <div className="px-4 py-2 border-b border-border-subtle flex items-center gap-2">
      {/* 状态筛选 */}
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
    </div>
  )
}
