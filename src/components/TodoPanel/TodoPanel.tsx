/**
 * TodoPanel - 待办事项面板
 *
 * 显示所有待办，支持筛选、排序、执行操作
 */

import { useState, useMemo } from 'react'
import { Plus, CheckCircle, Circle, Clock, ChevronDown, ChevronUp, FolderOpen, Sparkles, RefreshCw, Globe, Search } from 'lucide-react'
import { useTodoStore, useWorkspaceStore, useEventChatStore, useGitStore } from '@/stores'
import { TodoCard } from './TodoCard'
import { TodoFilter } from './TodoFilter'
import { TemplateIcon } from './TemplateIcon'
import { todoTemplateService } from '@/services/todoTemplateService'
import { todoFileSyncService } from '@/services/todoFileSyncService'
import type { TodoTemplate, TemplateVariableContext } from '@/types'

type TodoScope = 'all' | 'workspace' | 'workspace-select'

export function TodoPanel() {
  const queryTodos = useTodoStore((state) => state.queryTodos)
  const stats = useTodoStore((state) => state.stats)
  const createTodo = useTodoStore((state) => state.createTodo)
  const filter = useTodoStore((state) => state.filter)
  const setFilter = useTodoStore((state) => state.setFilter)

  // 工作区相关状态
  const currentWorkspace = useWorkspaceStore((state) => state.getCurrentWorkspace())
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const allTodos = useTodoStore((state) => state.todos)

  // AI 对话相关状态
  const conversationId = useEventChatStore((state) => state.conversationId)

  // Git 状态
  const gitStatus = useGitStore((state) => state.status)

  // 作用域状态
  const [scope, setScope] = useState<TodoScope>('workspace')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false)

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
  const [relatedFiles, setRelatedFiles] = useState<string[]>([])
  const [fileInput, setFileInput] = useState('')

  // 模板相关状态
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)
  const [templates] = useState<TodoTemplate[]>(() => todoTemplateService.getAllTemplates())

  // 刷新相关状态
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 计算每个工作区的待办数量
  const workspaceStats = useMemo(() => {
    return workspaces.map((workspace) => ({
      workspace,
      count: allTodos.filter((t) =>
        t.workspaceId === workspace.id && t.status !== 'completed'
      ).length,
    }))
  }, [allTodos, workspaces])

  // 根据作用域筛选待办
  const filteredTodos = useMemo(() => {
    let targetWorkspaceId: string | null | undefined

    if (scope === 'all') {
      targetWorkspaceId = null  // 全局待办
    } else if (scope === 'workspace') {
      targetWorkspaceId = currentWorkspace?.id  // 当前工作区
    } else if (scope === 'workspace-select') {
      targetWorkspaceId = selectedWorkspaceId  // 选中的工作区
    }

    const baseFilter = {
      ...filter,
      workspaceId: targetWorkspaceId,
    }

    const todos = queryTodos(baseFilter)

    // 对于全局待办，进一步筛选出 workspaceId 为 null 或 undefined 的
    if (scope === 'all') {
      return todos.filter(t => !t.workspaceId)
    }

    return todos
  }, [filter, scope, currentWorkspace, selectedWorkspaceId, queryTodos])

  // 常用标签建议
  const commonTags = ['frontend', 'backend', 'bug', 'feature', 'refactor', 'docs', 'test']

  const handleCreateTodo = async () => {
    if (!content.trim()) return

    // 确定目标工作区 ID
    let targetWorkspaceId: string | null
    if (scope === 'all') {
      targetWorkspaceId = null  // 全局待办
    } else if (scope === 'workspace') {
      targetWorkspaceId = currentWorkspace?.id || null
    } else {
      targetWorkspaceId = selectedWorkspaceId || null
    }

    // 自动捕获 Git 上下文（仅在当前工作区模式下）
    let gitContext
    if (gitStatus?.exists && scope === 'workspace' && targetWorkspaceId) {
      gitContext = {
        branch: gitStatus.branch,
        baseCommit: gitStatus.shortCommit,
        currentCommit: gitStatus.shortCommit,
      }
    }

    await createTodo({
      content: content.trim(),
      description: description.trim() || undefined,
      priority,
      dueDate: dueDate || undefined,
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : undefined,
      tags: tags.length > 0 ? tags : undefined,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
      relatedFiles: relatedFiles.length > 0 ? relatedFiles : undefined,
      // 根据作用域自动设置 workspaceId
      workspaceId: targetWorkspaceId,
      // 关联当前 AI 会话（如果有）
      sessionId: conversationId || undefined,
      // 自动捕获 Git 上下文
      gitContext,
    })

    // 重置表单
    setContent('')
    setDescription('')
    setPriority('normal')
    setDueDate('')
    setEstimatedHours('')
    setShowAdvanced(false)
    setTags([])
    setTagInput('')
    setSubtasks([])
    setRelatedFiles([])
    setFileInput('')
    setShowCreateDialog(false)
  }

  const handleAddFile = () => {
    const file = fileInput.trim()
    if (file && !relatedFiles.includes(file)) {
      setRelatedFiles([...relatedFiles, file])
      setFileInput('')
    }
  }

  const handleRemoveFile = (file: string) => {
    setRelatedFiles(relatedFiles.filter((f) => f !== file))
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

  const handleApplyTemplate = (template: TodoTemplate) => {
    // 构建变量上下文
    const context: TemplateVariableContext = {
      project: currentWorkspace?.name,
    }

    // 应用模板
    const params = todoTemplateService.applyTemplate(template.id, context)
    if (!params) return

    // 填充表单
    setContent(params.content || '')
    setDescription(params.description || '')
    setPriority(params.priority || 'normal')
    setEstimatedHours(params.estimatedHours?.toString() || '')
    setTags(params.tags || [])
    setSubtasks(params.subtasks || [])
    setShowAdvanced(true)  // 展开高级选项显示子任务
    setShowTemplateMenu(false)
  }

  // 手动刷新待办（从文件重新加载）
  const handleRefresh = async () => {
    if (!currentWorkspace) {
      console.warn('[TodoPanel] 没有当前工作区，无法刷新')
      return
    }

    setIsRefreshing(true)
    try {
      const fileTodos = await todoFileSyncService.readWorkspaceTodos(currentWorkspace.path)
      if (fileTodos && fileTodos.length > 0) {
        await todoFileSyncService.mergeIntoStore(fileTodos, currentWorkspace.id)
        console.log(`[TodoPanel] 已刷新 ${fileTodos.length} 个待办`)
      } else {
        console.log('[TodoPanel] 文件中没有待办')
      }
    } catch (error) {
      console.error('[TodoPanel] 刷新待办失败:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-background-elevated">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary">待办事项</h2>
          <div className="flex items-center gap-1">
            {/* 刷新按钮 */}
            <button
              onClick={handleRefresh}
              disabled={!currentWorkspace || isRefreshing}
              className="p-1 rounded hover:bg-background-hover text-text-secondary hover:text-text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={isRefreshing ? '刷新中...' : '刷新待办'}
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>

            {/* 模板选择按钮 */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowTemplateMenu(!showTemplateMenu)
                  setShowCreateDialog(false)
                }}
                className="p-1 rounded hover:bg-background-hover text-text-secondary hover:text-text-primary transition-all"
                title="从模板创建"
              >
                <Sparkles size={16} />
              </button>

              {/* 模板下拉菜单 */}
              {showTemplateMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowTemplateMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 bg-background-elevated border border-border rounded shadow-lg z-20 py-1 min-w-[200px] max-h-[400px] overflow-y-auto">
                    <div className="px-3 py-1.5 text-xs font-medium text-text-tertiary border-b border-border">
                      选择模板
                    </div>
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => {
                          handleApplyTemplate(template)
                          setShowCreateDialog(true)
                          setShowTemplateMenu(false)
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-background-hover transition-colors text-text-primary"
                      >
                        <div className="flex items-center gap-2">
                          <TemplateIcon icon={template.icon} size={16} />
                          <span className="flex-1">{template.name}</span>
                        </div>
                        {template.description && (
                          <div className="text-xs text-text-tertiary mt-0.5 ml-6">
                            {template.description}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 新建待办按钮 */}
            <button
              onClick={() => {
                setShowCreateDialog(true)
                setShowTemplateMenu(false)
              }}
              className="p-1 rounded hover:bg-background-hover text-text-secondary hover:text-text-primary transition-all"
              title="新建待办"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* 作用域切换器 */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => {
              setScope('all')
              setShowWorkspaceMenu(false)
            }}
            className={`flex-1 px-2 py-1.5 text-xs rounded flex items-center justify-center gap-1.5 transition-all ${
              scope === 'all'
                ? 'bg-primary text-white'
                : 'bg-background-hover text-text-secondary hover:text-text-primary'
            }`}
          >
            <Globe size={14} className="text-blue-500" />
            全部
          </button>
          <button
            onClick={() => {
              setScope('workspace')
              setShowWorkspaceMenu(false)
            }}
            className={`flex-1 px-2 py-1.5 text-xs rounded flex items-center justify-center gap-1.5 transition-all ${
              scope === 'workspace'
                ? 'bg-primary text-white'
                : 'bg-background-hover text-text-secondary hover:text-text-primary'
            }`}
            disabled={!currentWorkspace}
            title={!currentWorkspace ? '请先创建工作区' : currentWorkspace?.name}
          >
            <FolderOpen size={14} className="text-purple-500" />
            当前项目
          </button>

          {/* 工作区选择按钮 */}
          <div className="relative">
            <button
              onClick={() => {
                setShowWorkspaceMenu(!showWorkspaceMenu)
                if (scope !== 'workspace-select') {
                  setScope('workspace-select')
                }
              }}
              className={`flex-1 px-2 py-1.5 text-xs rounded flex items-center justify-center gap-1.5 transition-all ${
                scope === 'workspace-select'
                  ? 'bg-primary text-white'
                  : 'bg-background-hover text-text-secondary hover:text-text-primary'
              }`}
              title="查看其他工作区的待办"
            >
              <Search size={14} className="text-gray-500" />
              其他项目
            </button>

            {/* 工作区下拉菜单 */}
            {showWorkspaceMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowWorkspaceMenu(false)}
                />
                <div className="absolute left-0 top-full mt-1 bg-background-elevated border border-border rounded shadow-lg z-20 py-1 min-w-[200px]">
                  <div className="px-3 py-1.5 text-xs font-medium text-text-tertiary border-b border-border">
                    选择工作区
                  </div>
                  {workspaceStats.map(({ workspace, count }) => (
                    <button
                      key={workspace.id}
                      onClick={() => {
                        setSelectedWorkspaceId(workspace.id)
                        setScope('workspace-select')
                        setShowWorkspaceMenu(false)
                      }}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-background-hover transition-colors ${
                        selectedWorkspaceId === workspace.id && scope === 'workspace-select'
                          ? 'bg-primary/10 text-primary'
                          : 'text-text-primary'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <FolderOpen size={14} />
                        {workspace.name}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {count}
                      </span>
                    </button>
                  ))}
                  {workspaceStats.length === 0 && (
                    <div className="px-3 py-4 text-sm text-text-tertiary text-center">
                      还没有其他工作区
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
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
                      <option value="low">○ 低</option>
                      <option value="normal">● 普通</option>
                      <option value="high">◆ 高</option>
                      <option value="urgent">▲ 紧急</option>
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

                      {/* 相关文件 */}
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">
                          相关文件
                        </label>

                        {/* 已添加文件 */}
                        {relatedFiles.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {relatedFiles.map((file) => (
                              <span
                                key={file}
                                className="px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-500 flex items-center gap-1 font-mono"
                                title={file}
                              >
                                {file.split('/').pop()}
                                <button
                                  onClick={() => handleRemoveFile(file)}
                                  className="hover:text-red-500"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* 添加文件 */}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={fileInput}
                            onChange={(e) => setFileInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleAddFile()
                              }
                            }}
                            placeholder="输入文件路径（如 src/App.tsx）"
                            className="flex-1 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm font-mono"
                          />
                          <button
                            onClick={handleAddFile}
                            disabled={!fileInput.trim()}
                            className="px-3 py-2 text-sm bg-border hover:bg-background-hover rounded-lg transition-colors disabled:opacity-50"
                          >
                            +
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

