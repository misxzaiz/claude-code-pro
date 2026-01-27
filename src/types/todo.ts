/**
 * 待办事项类型定义
 *
 * 定义了 Todo 系统的所有数据结构和类型
 */

/**
 * 待办事项优先级
 */
export type TodoPriority = 'low' | 'normal' | 'high' | 'urgent'

/**
 * 待办事项状态
 */
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

/**
 * 待办事项主接口
 */
export interface TodoItem {
  /** 唯一标识符 */
  id: string

  /** 待办内容描述 */
  content: string

  /** 当前状态 */
  status: TodoStatus

  /** 优先级 */
  priority: TodoPriority

  /** 标签（用于分类和筛选） */
  tags?: string[]

  /** 相关文件路径 */
  relatedFiles?: string[]

  /** 关联的 AI 会话 ID */
  sessionId?: string

  /** 子任务列表 */
  subtasks?: TodoSubtask[]

  /** 创建时间 */
  createdAt: string

  /** 更新时间 */
  updatedAt: string

  /** 完成时间 */
  completedAt?: string

  /** 最后进度信息 */
  lastProgress?: string

  /** 最后错误信息 */
  lastError?: string
}

/**
 * 子任务接口
 */
export interface TodoSubtask {
  /** 子任务 ID */
  id: string

  /** 子任务内容 */
  title: string

  /** 是否完成 */
  completed: boolean

  /** 创建时间 */
  createdAt?: string
}

/**
 * 待办统计信息
 */
export interface TodoStats {
  /** 总数 */
  total: number

  /** 待处理数量 */
  pending: number

  /** 进行中数量 */
  inProgress: number

  /** 已完成数量 */
  completed: number

  /** 已取消数量 */
  cancelled: number

  /** 紧急待办数量 */
  urgent: number
}

/**
 * 待办上下文（用于注入 AI）
 */
export interface TodoContext {
  /** 当前活动待办 */
  activeTodos: TodoItem[]

  /** 最近完成的待办 */
  recentCompleted: TodoItem[]

  /** 统计信息 */
  totalStats: TodoStats
}

/**
 * 待办查询过滤器
 */
export interface TodoFilter {
  /** 状态筛选 */
  status?: TodoStatus | 'all'

  /** 优先级筛选 */
  priority?: TodoPriority

  /** 标签筛选 */
  tags?: string[]

  /** 关键词搜索 */
  search?: string

  /** 返回数量限制 */
  limit?: number

  /** 偏移量（分页） */
  offset?: number
}

/**
 * 待办创建参数
 */
export interface TodoCreateParams {
  /** 待办内容 */
  content: string

  /** 优先级 */
  priority?: TodoPriority

  /** 标签 */
  tags?: string[]

  /** 相关文件 */
  relatedFiles?: string[]
}

/**
 * 待办更新参数
 */
export interface TodoUpdateParams {
  /** 新内容 */
  content?: string

  /** 新状态 */
  status?: TodoStatus

  /** 新优先级 */
  priority?: TodoPriority

  /** 标签 */
  tags?: string[]

  /** 相关文件 */
  relatedFiles?: string[]

  /** 子任务 */
  subtasks?: TodoSubtask[]
}

/**
 * 待办执行选项
 */
export interface TodoExecutionOptions {
  /** 工作区目录 */
  workspaceDir: string

  /** 是否自动分解复杂待办 */
  autoBreakdown?: boolean

  /** 是否在执行前询问用户 */
  requireConfirmation?: boolean

  /** 执行时附加的系统提示词 */
  systemPrompt?: string
}

/**
 * 待办分解结果
 */
export interface TodoBreakdown {
  /** 子任务列表 */
  subtasks: Array<{
    content: string
    estimatedSteps: string[]
    relatedFiles: string[]
  }>

  /** 建议的执行顺序 */
  suggestedOrder: number[]
}

/**
 * 待办命令解析结果
 */
export interface ParsedTodoCommand {
  content: string
  priority?: TodoPriority
  tags?: string[]
  shouldCreate: boolean
}

/**
 * 待办同步规则
 */
export interface TodoSyncRule {
  /** 监听的 AI 事件类型 */
  eventType: string

  /** 匹配条件函数 */
  condition: (event: any, todo: TodoItem) => boolean

  /** 状态转换函数 */
  transform: (event: any, todo: TodoItem) => Partial<TodoItem>
}

/**
 * Todo Store 状态接口
 */
export interface TodoState {
  /** 所有待办事项 */
  todos: TodoItem[]

  /** 当前选中的待办 ID */
  selectedTodoId: string | null

  /** 当前筛选器 */
  filter: TodoFilter

  /** 是否正在加载 */
  isLoading: boolean

  /** 错误信息 */
  error: string | null

  /** 统计信息 */
  stats: TodoStats
}

/**
 * Todo Store 操作接口
 */
export interface TodoActions {
  /** 创建待办 */
  createTodo: (params: TodoCreateParams) => Promise<TodoItem>

  /** 批量创建待办 */
  batchCreateTodos: (paramsList: TodoCreateParams[]) => Promise<TodoItem[]>

  /** 更新待办 */
  updateTodo: (id: string, updates: TodoUpdateParams) => TodoItem | null

  /** 删除待办 */
  deleteTodo: (id: string) => boolean

  /** 获取所有待办 */
  getAllTodos: () => TodoItem[]

  /** 根据 ID 获取待办 */
  getTodoById: (id: string) => TodoItem | undefined

  /** 查询待办 */
  queryTodos: (filter: TodoFilter) => TodoItem[]

  /** 批量更新状态 */
  batchUpdateStatus: (ids: string[], status: TodoStatus) => void

  /** 批量删除 */
  batchDelete: (ids: string[]) => void

  /** 清空已完成 */
  clearCompleted: () => void

  /** 刷新统计 */
  refreshStats: () => void

  /** 关联待办到会话 */
  linkToSession: (todoId: string, sessionId: string) => void

  /** 获取会话相关的待办 */
  getTodosBySession: (sessionId: string) => TodoItem[]

  /** 导出待办 */
  exportTodos: () => string

  /** 导入待办 */
  importTodos: (json: string) => void

  /** UI 操作 */
  setSelectedTodo: (id: string | null) => void

  setFilter: (filter: Partial<TodoFilter>) => void

  setSearchQuery: (query: string) => void
}

/**
 * 完整的 Todo Store 接口
 */
export type TodoStore = TodoState & TodoActions
