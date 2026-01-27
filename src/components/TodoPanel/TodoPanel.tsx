/**
 * TodoPanel - 待办事项面板
 *
 * 显示所有待办，支持筛选、排序、执行操作
 */

import { useState } from 'react'
import { Plus, CheckCircle, Circle, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { useTodoStore } from '@/stores'
import { TodoCard } from './TodoCard'
import { TodoFilter } from './TodoFilter'

export function TodoPanel() {
  const queryTodos = useTodoStore((state) => state.queryTodos)
  const stats = useTodoStore((state) => state.stats)
  const createTodo = useTodoStore((state) => state.createTodo)
  const filter = useTodoStore((state) => state.filter)
  const setFilter = useTodoStore((state) => state.setFilter)

  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // 创建表单状态
  const [content, setContent] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal')
  const [dueDate, setDueDate] = useState('')
  const [estimatedHours, setEstimatedHours] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [subtasks, setSubtasks] = useState<Array<{ title: string }>>([])

  const filteredTodos = queryTodos(filter)

  // 常用标签建议
  const commonTags = ['frontend', 'backend', 'bug', 'feature', 'refactor', 'docs', 'test']

  const handleCreateTodo = async () => {
    if (!content.trim()) return

    await createTodo({
      content: content.trim(),
      description: description.trim() || undefined,
      priority,
      dueDate: dueDate || undefined,
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : undefined,
      tags: tags.length > 0 ? tags : undefined,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
    })

    // 重置表单
    setContent('')
    setDescription('')
    setPriority('normal')
    setDueDate('')
    setEstimatedHours('')
    setShowAdvanced(false)
    setTags([])
    setSubtasks([])
    setShowCreateDialog(false)
  }

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleAddSubtask = () => {
    const lastSubtask = document.getElementById('new-subtask-input') as HTMLInputElement
    const title = lastSubtask?.value.trim()
    if (title) {
      setSubtasks([...subtasks, { title }])
      lastSubtask.value = ''
    }
  }

  const handleRemoveSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index))
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background-elevated rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4">
              {/* 头部 */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-text-primary">新建待办</h3>
                <button
                  onClick={() => setShowCreateDialog(false)}
                  className="p-1 rounded hover:bg-background-hover text-text-secondary hover:text-text-primary transition-all"
                >
                  ✕
                </button>
              </div>

              {/* 基本信息 */}
              <div className="space-y-4">
                {/* 内容 */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    内容 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="待办事项的主要内容"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    autoFocus
                  />
                </div>

                {/* 详细描述 */}
                {showAdvanced && (
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">
                      详细描述
                    </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="添加更详细的描述..."
                    rows={2}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm resize-none"
                  />
                </div>
                )}

                {/* 优先级和截止日期 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">
                      优先级
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as any)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-background-elevated"
                    >
                      <option value="low">⚪ 低</option>
                      <option value="normal">🟢 普通</option>
                      <option value="high">🟠 高</option>
                      <option value="urgent">🔴 紧急</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">
                      截止日期
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                </div>

                {/* 高级选项 */}
                <div>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    高级选项
                  </button>

                  {showAdvanced && (
                    <div className="mt-3 space-y-4">
                      {/* 预估工时 */}
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">
                          预估工时（小时）
                        </label>
                        <input
                          type="number"
                          value={estimatedHours}
                          onChange={(e) => setEstimatedHours(e.target.value)}
                          min="0"
                          step="0.5"
                          placeholder="0.5 = 30分钟"
                          className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                        />
                      </div>

                      {/* 标签 */}
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">
                          标签
                        </label>

                        {/* 常用标签快捷选择 */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {commonTags.map((tag) => (
                            <button
                              key={tag}
                              onClick={() => {
                                if (!tags.includes(tag)) {
                                  setTags([...tags, tag])
                                }
                              }}
                              className={`px-2 py-1 text-xs rounded transition-colors ${
                                tags.includes(tag)
                                  ? 'bg-primary text-white'
                                  : 'bg-background-tertiary text-text-secondary hover:bg-background-hover'
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>

                        {/* 已选标签 */}
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-1 text-xs rounded bg-primary/20 text-primary flex items-center gap-1"
                              >
                                {tag}
                                <button
                                  onClick={() => handleRemoveTag(tag)}
                                  className="hover:text-red-500"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* 添加新标签 */}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleAddTag()
                              }
                            }}
                            placeholder="输入标签..."
                            className="flex-1 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                          />
                          <button
                            onClick={handleAddTag}
                            disabled={!tagInput.trim()}
                            className="px-3 py-2 text-sm bg-border hover:bg-background-hover rounded-lg transition-colors disabled:opacity-50"
                          >
                            添加
                          </button>
                        </div>
                      </div>

                      {/* 子任务 */}
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">
                          子任务
                        </label>

                        {/* 子任务列表 */}
                        {subtasks.length > 0 && (
                          <div className="space-y-1.5 mb-2">
                            {subtasks.map((subtask, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-2 p-2 bg-background-surface rounded border border-border-subtle text-sm"
                              >
                                <span className="flex-1 text-text-secondary">• {subtask.title}</span>
                                <button
                                  onClick={() => handleRemoveSubtask(index)}
                                  className="text-text-tertiary hover:text-red-500"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 添加子任务 */}
                        <div className="flex gap-2">
                          <input
                            id="new-subtask-input"
                            type="text"
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
                            className="px-3 py-2 text-sm bg-border hover:bg-background-hover rounded-lg transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 底部按钮 */}
                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border">
                  <button
                    onClick={() => setShowCreateDialog(false)}
                    className="px-4 py-2 text-sm rounded-lg hover:bg-background-hover text-text-secondary transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleCreateTodo}
                    disabled={!content.trim()}
                    className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    创建
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

