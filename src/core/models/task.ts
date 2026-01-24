/**
 * Task 模型
 *
 * Task 是用户希望 Agent 完成的目标，可以有多次执行尝试（Run）。
 */

/**
 * 任务类型
 */
export type TaskKind = 'chat' | 'refactor' | 'analyze' | 'generate' | 'debug' | 'test'

/**
 * 任务状态
 */
export type TaskStatus = 'draft' | 'pending' | 'running' | 'waiting_review' | 'completed' | 'failed' | 'cancelled'

/**
 * 任务优先级
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

/**
 * 任务
 */
export interface Task {
  /** 唯一标识 */
  id: string

  /** 任务标题（简短描述） */
  title: string

  /** 任务详细描述 */
  description: string

  /** 任务类型 */
  kind: TaskKind

  /** 当前状态 */
  status: TaskStatus

  /** 优先级 */
  priority: TaskPriority

  /** 使用的 Agent 类型 */
  agentType: string

  /** 关联的工作区 ID */
  workspaceId: string

  /** 执行历史（所有 Run 的 ID） */
  runIds: string[]

  /** 当前活跃的 Run ID（正在执行或等待审查） */
  activeRunId?: string

  /** 创建时间 */
  createdAt: number

  /** 更新时间 */
  updatedAt: number

  /** 标签 */
  tags?: string[]

  /** 父任务 ID（用于任务分解） */
  parentTaskId?: string

  /** 子任务 ID 列表 */
  subTaskIds?: string[]
}

/**
 * 创建新任务的参数
 */
export interface CreateTaskParams {
  /** 任务标题 */
  title: string

  /** 任务详细描述 */
  description: string

  /** 任务类型 */
  kind: TaskKind

  /** 优先级（默认 medium） */
  priority?: TaskPriority

  /** 使用的 Agent 类型 */
  agentType: string

  /** 关联的工作区 ID */
  workspaceId: string

  /** 标签 */
  tags?: string[]

  /** 父任务 ID（用于任务分解） */
  parentTaskId?: string
}

/**
 * 更新任务的参数
 */
export interface UpdateTaskParams {
  /** 任务标题 */
  title?: string

  /** 任务描述 */
  description?: string

  /** 任务状态 */
  status?: TaskStatus

  /** 优先级 */
  priority?: TaskPriority

  /** 标签 */
  tags?: string[]

  /** 当前活跃的 Run ID */
  activeRunId?: string

  /** 添加 Run ID */
  addRunId?: string

  /** 添加子任务 ID */
  addSubTaskId?: string
}
