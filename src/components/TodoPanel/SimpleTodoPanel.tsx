/**
 * 简化的待办面板
 *
 * - 只显示当前工作区的待办
 * - 直接读写文件
 * - 简单的状态筛选
 * - 无缓存,无复杂逻辑
 */

import { useState, useEffect } from 'react'
import { Plus, CheckCircle, Circle, Clock, Search, ArrowUpDown } from 'lucide-react'
import { useWorkspaceStore } from '@/stores'
import { simpleTodoService } from '@/services/simpleTodoService'
import { TodoCard } from './TodoCard'
import { TodoDetailDialog } from './TodoDetailDialog'
import { TodoForm } from './TodoForm'
import type { TodoItem, TodoStatus, TodoPriority } from '@/types'

export function SimpleTodoPanel() {
  const currentWorkspace = useWorkspaceStore(state => state.getCurrentWorkspace())
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedTodo, setSelectedTodo] = useState<TodoItem | null>(null)

  // 搜索和排序相关
  const [searchQuery, setSearchQuery] = useState('')
  type SortByType = 'createdAt' | 'dueDate' | 'priority'
  type SortOrderType = 'desc' | 'asc'
  const [sortBy, setSortBy] = useState<SortByType>('createdAt')
  const [sortOrder, setSortOrder] = useState<SortOrderType>('desc')

  // 标签相关
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  // 初始化:加载工作区待办
  useEffect(() => {
    if (!currentWorkspace) {
      setTodos([])
      return
    }

    // 设置工作区并加载待办
    simpleTodoService.setWorkspace(currentWorkspace.path).then(() => {
      refreshTodos()
    })

    // 订阅变化
    const unsubscribe = simpleTodoService.subscribe(refreshTodos)

    return () => {
      unsubscribe()
    }
  }, [currentWorkspace])

  // 优先级权重（用于排序）
  const priorityWeight: Record<TodoPriority, number> = {
    urgent: 4,
    high: 3,
    normal: 2,
    low: 1,
  }

  // 刷新待办列表（包含搜索、筛选、排序逻辑）
  const refreshTodos = () => {
    let result = simpleTodoService.getAllTodos()

    // 1. 状态筛选
    if (statusFilter !== 'all') {
      result = result.filter(t => t.status === statusFilter)
    }

    // 2. 搜索过滤
    if (searchQuery.trim()) {
      const keyword = searchQuery.toLowerCase()
      result = result.filter(t =>
        t.content.toLowerCase().includes(keyword) ||
        t.description?.toLowerCase().includes(keyword) ||
        t.tags?.some(tag => tag.toLowerCase().includes(keyword))
      )
    }

    // 3. 排序
    result = result.sort((a, b) => {
      let compareResult = 0

      if (sortBy === 'createdAt') {
        compareResult = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      } else if (sortBy === 'dueDate') {
        // 没有截止日期的放到最后
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_VALUE
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_VALUE
        compareResult = aDate - bDate
      } else if (sortBy === 'priority') {
        compareResult = priorityWeight[a.priority] - priorityWeight[b.priority]
      }

      return sortOrder === 'desc' ? -compareResult : compareResult
    })

    setTodos(result)
  }

  // 当筛选、搜索、排序变化时刷新
  useEffect(() => {
    refreshTodos()
  }, [statusFilter, searchQuery, sortBy, sortOrder])

  // 创建待办
  const handleCreateTodo = async (data: {
    content: string
    description?: string
    priority: TodoPriority
    dueDate?: string
    estimatedHours?: number
    subtasks?: { title: string }[]
  }) => {
    try {
      await simpleTodoService.createTodo({
        content: data.content,
        description: data.description,
        priority: data.priority,
        dueDate: data.dueDate,
        estimatedHours: data.estimatedHours,
        subtasks: data.subtasks,
        tags: tags.length > 0 ? tags : undefined,
      })

      // 重置表单状态
      setTags([])
      setTagInput('')
      setShowCreateDialog(false)
      await refreshTodos()
      // 不再自动打开详情,直接留在列表
    } catch (error) {
      console.error('创建待办失败:', error)
      alert('创建失败: ' + (error as Error).message)
    }
  }

  // 添加标签
  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
      setTagInput('')
    }
  }

  // 移除标签
  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag))
  }

  // 切换状态
  const handleToggleStatus = async (todo: TodoItem) => {
    const statusFlow: Record<TodoItem['status'], TodoStatus> = {
      pending: 'in_progress',
      in_progress: 'completed',
      completed: 'pending',
      cancelled: 'pending',
    }

    try {
      await simpleTodoService.updateTodo(todo.id, {
        status: statusFlow[todo.status],
      })
      refreshTodos()
    } catch (error) {
      console.error('更新状态失败:', error)
    }
  }

  // 删除待办
  const handleDeleteTodo = async (todo: TodoItem) => {
    try {
      await simpleTodoService.deleteTodo(todo.id)
      refreshTodos()
    } catch (error) {
      console.error('删除待办失败:', error)
      alert('删除失败: ' + (error as Error).message)
    }
  }

  const stats = simpleTodoService.getStats()

  if (!currentWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary">
        <div className="text-center">
          <p>请先打开一个工作区</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background-elevated">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary">
            待办事项
            <span className="ml-2 text-xs font-normal text-text-secondary">
              ({stats.pending} 待处理 / {stats.inProgress} 进行中)
            </span>
          </h2>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="p-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-all"
            title="创建待办"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* 搜索框 */}
        <div className="mb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索待办..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-background-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-text-primary placeholder-text-tertiary"
            />
          </div>
        </div>

        {/* 筛选器和排序器 - 垂直布局适配窄屏 */}
        <div className="flex flex-col gap-2">
          {/* 第一行：状态筛选器 */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2 py-1 text-xs rounded whitespace-nowrap transition-all ${
                statusFilter === 'all'
                  ? 'bg-primary text-white'
                  : 'hover:bg-background-hover text-text-secondary'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-2 py-1 text-xs rounded flex items-center gap-1 whitespace-nowrap transition-all ${
                statusFilter === 'pending'
                  ? 'bg-primary text-white'
                  : 'hover:bg-background-hover text-text-secondary'
              }`}
            >
              <Circle size={12} />
              待处理
            </button>
            <button
              onClick={() => setStatusFilter('in_progress')}
              className={`px-2 py-1 text-xs rounded flex items-center gap-1 whitespace-nowrap transition-all ${
                statusFilter === 'in_progress'
                  ? 'bg-primary text-white'
                  : 'hover:bg-background-hover text-text-secondary'
              }`}
            >
              <Clock size={12} />
              进行中
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-2 py-1 text-xs rounded flex items-center gap-1 whitespace-nowrap transition-all ${
                statusFilter === 'completed'
                  ? 'bg-primary text-white'
                  : 'hover:bg-background-hover text-text-secondary'
              }`}
            >
              <CheckCircle size={12} />
              已完成
            </button>
          </div>

          {/* 第二行：排序选择器（右对齐） */}
          <div className="flex items-center justify-end gap-1">
            <ArrowUpDown size={14} className="text-text-tertiary flex-shrink-0" />
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [newSortBy, newSortOrder] = e.target.value.split('-') as [SortByType, SortOrderType]
                setSortBy(newSortBy)
                setSortOrder(newSortOrder)
              }}
              className="px-2 py-1 text-xs bg-background-surface border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/50 text-text-secondary cursor-pointer max-w-[200px]"
            >
              <option value="createdAt-desc">最新↓</option>
              <option value="createdAt-asc">最早↑</option>
              <option value="dueDate-asc">截止↑</option>
              <option value="dueDate-desc">截止↓</option>
              <option value="priority-desc">优先级↓</option>
              <option value="priority-asc">优先级↑</option>
            </select>
          </div>
        </div>
      </div>

      {/* 待办列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {todos.map(todo => (
          <TodoCard
            key={todo.id}
            todo={todo}
            onEditClick={setSelectedTodo}
            onToggleStatus={handleToggleStatus}
            onDeleteClick={handleDeleteTodo}
          />
        ))}

        {todos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <CheckCircle size={48} className="mb-3 opacity-50" />
            <p className="text-sm">
              {statusFilter === 'all' ? '暂无待办' : `暂无${getStatusLabel(statusFilter)}的待办`}
            </p>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="mt-4 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-all"
            >
              创建待办
            </button>
          </div>
        )}
      </div>

      {/* 创建待办对话框 */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <TodoForm
            mode="create"
            onSubmit={handleCreateTodo}
            onCancel={() => {
              setShowCreateDialog(false)
              setTags([])
              setTagInput('')
            }}
            tags={tags}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
          />
        </div>
      )}

      {/* 详情对话框 */}
      {selectedTodo && (
        <TodoDetailDialog
          todo={selectedTodo}
          open={!!selectedTodo}
          onClose={() => setSelectedTodo(null)}
          onUpdate={() => {
            refreshTodos()
            setSelectedTodo(null)
          }}
          onDelete={() => {
            handleDeleteTodo(selectedTodo)
            setSelectedTodo(null)
          }}
        />
      )}
    </div>
  )
}

function getStatusLabel(status: 'all' | 'pending' | 'in_progress' | 'completed'): string {
  const labels = {
    all: '',
    pending: '待处理',
    in_progress: '进行中',
    completed: '已完成',
  }
  return labels[status]
}
