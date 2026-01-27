/**
 * TodoPanel - 待办事项面板
 *
 * 显示所有待办，支持筛选、排序、执行操作
 */

import { useState, useEffect } from 'react'
import { Plus, Filter, CheckCircle, Clock, Circle } from 'lucide-react'
import { useTodoStore } from '@/stores'
import { TodoCard } from './TodoCard'
import { TodoFilter } from './TodoFilter'

export function TodoPanel() {
  const todos = useTodoStore((state) => state.getAllTodos())
  const queryTodos = useTodoStore((state) => state.queryTodos)
  const stats = useTodoStore((state) => state.stats)
  const createTodo = useTodoStore((state) => state.createTodo)

  const [filter, setFilter] = useState<{
    status: 'all' | 'pending' | 'in_progress' | 'completed'
    priority?: 'low' | 'normal' | 'high' | 'urgent'
  }>({
    status: 'all',
  })

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newTodoTitle, setNewTodoTitle] = useState('')

  const filteredTodos = queryTodos(filter)

  const handleCreateTodo = () => {
    if (newTodoTitle.trim()) {
      createTodo({
        content: newTodoTitle.trim(),
        priority: 'normal',
      })
      setNewTodoTitle('')
      setShowCreateDialog(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-background-elevated">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary">待办事项</h2>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="p-1 rounded hover:bg-background-hover text-text-secondary hover:text-text-primary transition-all"
            title="新建待办"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* 统计信息 */}
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span>总计: {stats.total}</span>
          <span className="flex items-center gap-1">
            <Circle size={10} />
            待处理: {stats.pending}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={10} />
            进行中: {stats.inProgress}
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle size={10} />
            已完成: {stats.completed}
          </span>
        </div>
      </div>

      {/* 筛选器 */}
      <TodoFilter filter={filter} onChange={setFilter} />

      {/* 待办列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {filteredTodos.map((todo) => (
          <TodoCard key={todo.id} todo={todo} />
        ))}

        {filteredTodos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <CheckCircle size={48} className="mb-3 opacity-50" />
            <p className="text-sm">没有待办事项</p>
          </div>
        )}
      </div>

      {/* 创建对话框 */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background-elevated rounded-lg shadow-xl p-4 w-96">
            <h3 className="text-base font-semibold mb-3">新建待办</h3>
            <input
              type="text"
              value={newTodoTitle}
              onChange={(e) => setNewTodoTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateTodo()
                } else if (e.key === 'Escape') {
                  setShowCreateDialog(false)
                  setNewTodoTitle('')
                }
              }}
              placeholder="输入待办内容..."
              className="w-full px-3 py-2 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowCreateDialog(false)
                  setNewTodoTitle('')
                }}
                className="px-3 py-1.5 text-sm rounded hover:bg-background-hover text-text-secondary"
              >
                取消
              </button>
              <button
                onClick={handleCreateTodo}
                disabled={!newTodoTitle.trim()}
                className="px-3 py-1.5 text-sm rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
