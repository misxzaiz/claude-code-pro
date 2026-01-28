/**
 * TodoDetailDialog - 待办详情/编辑弹窗
 *
 * 支持编辑待办的所有字段，包括子任务管理
 */

import { useState, useEffect } from 'react'
import { X, Clock, CheckCircle, XCircle, Plus, Trash2, Play, FileText } from 'lucide-react'
import { simpleTodoService } from '@/services/simpleTodoService'
import type { TodoItem, TodoUpdateParams, TodoSubtask } from '@/types'

interface TodoDetailDialogProps {
  todo: TodoItem
  open: boolean
  onClose: () => void
  onUpdate?: () => void
}

export function TodoDetailDialog({ todo, open, onClose, onUpdate }: TodoDetailDialogProps) {
  // 移除 todoStore,使用 simpleTodoService

  // 表单状态
  const [content, setContent] = useState(todo.content)
  const [description, setDescription] = useState(todo.description || '')
  const [priority, setPriority] = useState(todo.priority)
  const [dueDate, setDueDate] = useState(todo.dueDate || '')
  const [estimatedHours, setEstimatedHours] = useState(todo.estimatedHours || 0)
  const [spentHours, setSpentHours] = useState(todo.spentHours || 0)
  const [subtasks, setSubtasks] = useState<TodoSubtask[]>(todo.subtasks || [])
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')

  // 当 todo 变化时更新表单
  useEffect(() => {
    setContent(todo.content)
    setDescription(todo.description || '')
    setPriority(todo.priority)
    setDueDate(todo.dueDate || '')
    setEstimatedHours(todo.estimatedHours || 0)
    setSpentHours(todo.spentHours || 0)
    setSubtasks(todo.subtasks || [])
    setNewSubtaskTitle('')
  }, [todo.id, todo.content, todo.description, todo.priority]) // 添加具体字段依赖

  // 计算子任务进度
  const completedSubtasks = subtasks.filter((st) => st.completed).length
  const subtaskProgress = subtasks.length > 0 ? (completedSubtasks / subtasks.length) * 100 : 0

  // 保存修改
  const handleSave = async () => {
    const updates: TodoUpdateParams = {
      content,
      description,
      priority,
      dueDate: dueDate || undefined,
      estimatedHours: estimatedHours || undefined,
      spentHours: spentHours || undefined,
      subtasks,
    }

    await simpleTodoService.updateTodo(todo.id, updates)
    onUpdate?.()
    onClose()
  }

  // 快捷操作：开始任务
  const handleStart = async () => {
    await simpleTodoService.updateTodo(todo.id, { status: 'in_progress' })
    onUpdate?.()
    onClose()
  }

  // 快捷操作：完成任务
  const handleComplete = async () => {
    await simpleTodoService.updateTodo(todo.id, { status: 'completed' })
    onUpdate?.()
    onClose()
  }

  // 快捷操作：取消任务
  const handleCancel = async () => {
    await simpleTodoService.updateTodo(todo.id, { status: 'cancelled' })
    onUpdate?.()
    onClose()
  }

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

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-background-elevated rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">待办详情</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-background-hover text-text-secondary hover:text-text-primary transition-all"
            title="关闭 (ESC)"
          >
            <X size={18} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* 内容 */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">内容</label>
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="待办事项的主要内容"
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
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

          {/* 优先级和截止日期 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">优先级</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TodoItem['priority'])}
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
              <div className="relative">
                <input
                  type="date"
                  value={dueDate ? new Date(dueDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => setDueDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>
          </div>

          {/* 工作量 */}
          <div className="grid grid-cols-2 gap-4">
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
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                <Clock size={14} className="inline mr-1" />
                实际工时（小时）
              </label>
              <input
                type="number"
                value={spentHours}
                onChange={(e) => setSpentHours(parseFloat(e.target.value) || 0)}
                min="0"
                step="0.5"
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
          </div>

          {/* 工作量进度 */}
          {estimatedHours > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
                <span>完成进度</span>
                <span>{spentHours} / {estimatedHours}h</span>
              </div>
              <div className="w-full bg-background-tertiary rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((spentHours / estimatedHours) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

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

          {/* 相关文件 */}
          {todo.relatedFiles && todo.relatedFiles.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                <FileText size={14} className="inline mr-1" />
                相关文件
              </label>
              <div className="space-y-1">
                {todo.relatedFiles.map((file) => (
                  <div
                    key={file}
                    className="px-3 py-1.5 text-xs text-blue-500 bg-blue-500/10 rounded font-mono truncate"
                    title={file}
                  >
                    {file}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 快速操作 */}
          <div className="pt-4 border-t border-border">
            <label className="block text-sm font-medium text-text-primary mb-3">快速操作</label>
            <div className="flex gap-2">
              {todo.status !== 'in_progress' && todo.status !== 'completed' && (
                <button
                  onClick={handleStart}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-500/90 transition-all text-sm flex items-center justify-center gap-2"
                >
                  <Play size={16} />
                  开始任务
                </button>
              )}
              {todo.status !== 'completed' && (
                <button
                  onClick={handleComplete}
                  className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-500/90 transition-all text-sm flex items-center justify-center gap-2"
                >
                  <CheckCircle size={16} />
                  完成任务
                </button>
              )}
              {todo.status !== 'cancelled' && (
                <button
                  onClick={handleCancel}
                  className="flex-1 px-4 py-2 bg-text-tertiary text-white rounded-lg hover:bg-text-tertiary/90 transition-all text-sm flex items-center justify-center gap-2"
                >
                  <XCircle size={16} />
                  取消任务
                </button>
              )}
            </div>
          </div>

          {/* 时间信息 */}
          <div className="pt-4 border-t border-border">
            <div className="text-xs text-text-muted space-y-1">
              <div>创建时间: {new Date(todo.createdAt).toLocaleString('zh-CN')}</div>
              {todo.updatedAt !== todo.createdAt && (
                <div>更新时间: {new Date(todo.updatedAt).toLocaleString('zh-CN')}</div>
              )}
              {todo.completedAt && (
                <div>完成时间: {new Date(todo.completedAt).toLocaleString('zh-CN')}</div>
              )}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2 bg-background-surface">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg hover:bg-background-hover text-text-secondary transition-all"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-all"
          >
            保存 (Ctrl+Enter)
          </button>
        </div>
      </div>
    </div>
  )
}
