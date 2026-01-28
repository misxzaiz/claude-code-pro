/**
 * TodoForm - 待办表单组件
 *
 * 用于创建和编辑待办,样式完全一致
 * 支持可折叠的高级选项
 * 包含所有字段:内容、描述、优先级、截止日期、工时、子任务
 */

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Calendar, Clock, Plus, Trash2 } from 'lucide-react'
import type { TodoItem, TodoPriority, TodoSubtask } from '@/types'

interface TodoFormProps {
  // 待办数据(创建时为空对象,编辑时传入现有待办)
  todo?: Partial<TodoItem>
  // 提交回调
  onSubmit: (data: {
    content: string
    description?: string
    priority: TodoPriority
    dueDate?: string
    estimatedHours?: number
    subtasks?: TodoSubtask[]
  }) => void
  // 取消回调
  onCancel: () => void
  // 模式
  mode: 'create' | 'edit'
}

export function TodoForm({ todo, onSubmit, onCancel, mode }: TodoFormProps) {
  // 表单状态
  const [content, setContent] = useState(todo?.content || '')
  const [description, setDescription] = useState(todo?.description || '')
  const [priority, setPriority] = useState<TodoPriority>(todo?.priority || 'normal')
  const [dueDate, setDueDate] = useState(todo?.dueDate || '')
  const [estimatedHours, setEstimatedHours] = useState(todo?.estimatedHours || 0)
  const [subtasks, setSubtasks] = useState<TodoSubtask[]>(todo?.subtasks || [])
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // 当 todo 变化时更新表单
  useEffect(() => {
    if (todo) {
      setContent(todo.content || '')
      setDescription(todo.description || '')
      setPriority(todo.priority || 'normal')
      setDueDate(todo.dueDate || '')
      setEstimatedHours(todo.estimatedHours || 0)
      setSubtasks(todo.subtasks || [])
    }
  }, [todo])

  // 计算子任务进度
  const completedSubtasks = subtasks.filter((st) => st.completed).length
  const subtaskProgress = subtasks.length > 0 ? (completedSubtasks / subtasks.length) * 100 : 0

  // 添加子任务
  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return

    const newSubtask: TodoSubtask = {
      id: crypto.randomUUID(),
      title: newSubtaskTitle.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    }

    setSubtasks([...subtasks, newSubtask])
    setNewSubtaskTitle('')
  }

  // 切换子任务完成状态
  const handleToggleSubtask = (subtaskId: string) => {
    setSubtasks(
      subtasks.map((st) =>
        st.id === subtaskId ? { ...st, completed: !st.completed } : st
      )
    )
  }

  // 删除子任务
  const handleDeleteSubtask = (subtaskId: string) => {
    setSubtasks(subtasks.filter((st) => st.id !== subtaskId))
  }

  // 更新子任务标题
  const handleUpdateSubtaskTitle = (subtaskId: string, newTitle: string) => {
    setSubtasks(
      subtasks.map((st) => (st.id === subtaskId ? { ...st, title: newTitle } : st))
    )
  }

  // 提交表单
  const handleSubmit = () => {
    if (!content.trim()) return

    onSubmit({
      content: content.trim(),
      description: description.trim() || undefined,
      priority,
      dueDate: dueDate || undefined,
      estimatedHours: estimatedHours || undefined,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
    })
  }

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const isEditMode = mode === 'edit'
  const dialogWidth = isEditMode ? 'max-w-2xl' : 'max-w-md'

  return (
    <div
      className="bg-background-elevated rounded-lg shadow-xl w-full ${dialogWidth} max-h-[90vh] overflow-hidden flex flex-col"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      {/* 头部 */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">
          {isEditMode ? '编辑待办' : '创建待办'}
        </h2>
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-background-hover text-text-secondary hover:text-text-primary transition-all"
          title="关闭 (ESC)"
        >
          ✕
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {/* 内容 */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">内容 *</label>
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="待办事项的主要内容"
            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            autoFocus={!isEditMode}
          />
        </div>

        {/* 详细描述 */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">详细描述</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="添加更详细的描述..."
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm resize-none"
          />
        </div>

        {/* 高级选项切换 */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors w-full"
        >
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <span>高级选项</span>
          <span className="ml-auto text-xs text-text-tertiary">
            {showAdvanced ? '点击收起' : '点击展开'}
          </span>
        </button>

        {/* 高级选项区域 */}
        {showAdvanced && (
          <div className="space-y-5 pt-2">
            {/* 优先级和截止日期 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">优先级</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TodoPriority)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-background-elevated"
                >
                  <option value="low">○ 低</option>
                  <option value="normal">● 普通</option>
                  <option value="high">◆ 高</option>
                  <option value="urgent">▲ 紧急</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">截止日期</label>
                <input
                  type="date"
                  value={dueDate ? new Date(dueDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => setDueDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>

            {/* 工作量 */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                <Clock size={14} className="inline mr-1" />
                预估工时（小时）
              </label>
              <input
                type="number"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(parseFloat(e.target.value) || 0)}
                min="0"
                step="0.5"
                placeholder="例如: 2"
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>

            {/* 子任务 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-text-primary">
                  子任务 ({completedSubtasks}/{subtasks.length})
                </label>
                {subtasks.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <div className="w-24 bg-background-tertiary rounded-full h-1.5">
                      <div
                        className="bg-primary h-1.5 rounded-full"
                        style={{ width: `${subtaskProgress}%` }}
                      />
                    </div>
                    <span>{Math.round(subtaskProgress)}%</span>
                  </div>
                )}
              </div>

              {/* 子任务列表 */}
              {subtasks.length > 0 && (
                <div className="space-y-2 mb-3">
                  {subtasks.map((subtask) => (
                    <div
                      key={subtask.id}
                      className="flex items-center gap-2 p-2 bg-background-surface rounded border border-border-subtle group"
                    >
                      <input
                        type="checkbox"
                        checked={subtask.completed}
                        onChange={() => handleToggleSubtask(subtask.id)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <input
                        type="text"
                        value={subtask.title}
                        onChange={(e) => handleUpdateSubtaskTitle(subtask.id, e.target.value)}
                        className={`flex-1 text-sm bg-transparent border-none focus:outline-none focus:ring-0 ${
                          subtask.completed ? 'line-through text-text-tertiary' : 'text-text-primary'
                        }`}
                      />
                      <button
                        onClick={() => handleDeleteSubtask(subtask.id)}
                        className="p-1 text-text-tertiary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="删除子任务"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 添加子任务 */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddSubtask()
                    }
                  }}
                  placeholder="添加子任务..."
                  className="flex-1 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
                <button
                  onClick={handleAddSubtask}
                  disabled={!newSubtaskTitle.trim()}
                  className="px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm flex items-center gap-1"
                >
                  <Plus size={16} />
                  添加
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="px-6 py-4 border-t border-border flex justify-end gap-2 bg-background-surface">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg hover:bg-background-hover text-text-secondary transition-all"
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={!content.trim()}
          className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isEditMode ? '保存 (Ctrl+Enter)' : '创建 (Ctrl+Enter)'}
        </button>
      </div>
    </div>
  )
}
