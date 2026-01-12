/**
 * AI Event - 通用事件模型
 *
 * 定义了 AI Engine 向 UI 层传递所有事件的标准格式。
 * UI / 日志 / Tool 面板只能消费 AIEvent，禁止直接消费 CLI 原始输出。
 */

/**
 * Token 事件 - 文本增量输出
 */
export interface TokenEvent {
  type: 'token'
  /** 文本内容 */
  value: string
}

/**
 * 工具调用开始事件
 */
export interface ToolCallStartEvent {
  type: 'tool_call_start'
  /** 工具名称 */
  tool: string
  /** 工具参数 */
  args: Record<string, unknown>
}

/**
 * 工具调用结束事件
 */
export interface ToolCallEndEvent {
  type: 'tool_call_end'
  /** 工具名称 */
  tool: string
  /** 工具执行结果 */
  result?: unknown
  /** 是否成功 */
  success: boolean
}

/**
 * 进度事件 - 任务进度更新
 */
export interface ProgressEvent {
  type: 'progress'
  /** 进度消息 */
  message?: string
  /** 进度百分比 0-100 */
  percent?: number
}

/**
 * 结果事件 - 任务完成
 */
export interface ResultEvent {
  type: 'result'
  /** 任务输出结果 */
  output: unknown
}

/**
 * 错误事件 - 任务出错
 */
export interface ErrorEvent {
  type: 'error'
  /** 错误信息 */
  error: string
  /** 错误码（可选） */
  code?: string
}

/**
 * 会话开始事件
 */
export interface SessionStartEvent {
  type: 'session_start'
  /** 会话 ID */
  sessionId: string
}

/**
 * 会话结束事件
 */
export interface SessionEndEvent {
  type: 'session_end'
  /** 会话 ID */
  sessionId: string
  /** 结束原因 */
  reason?: 'completed' | 'aborted' | 'error'
}

/**
 * 用户消息事件
 */
export interface UserMessageEvent {
  type: 'user_message'
  /** 用户消息内容 */
  content: string
  /** 关联的文件 */
  files?: string[]
}

/**
 * AI 消息事件
 */
export interface AssistantMessageEvent {
  type: 'assistant_message'
  /** 消息内容（可能是部分内容） */
  content: string
  /** 是否为增量更新 */
  isDelta: boolean
  /** 消息中包含的工具调用 */
  toolCalls?: ToolCallInfo[]
}

/**
 * 工具调用信息
 */
export interface ToolCallInfo {
  /** 工具唯一 ID */
  id: string
  /** 工具名称 */
  name: string
  /** 工具参数 */
  args: Record<string, unknown>
  /** 执行状态 */
  status: 'pending' | 'running' | 'completed' | 'failed'
  /** 执行结果 */
  result?: unknown
}

/**
 * Task 状态
 */
export type TaskStatus = 'pending' | 'running' | 'success' | 'error' | 'canceled'

/**
 * Task 元数据事件
 */
export interface TaskMetadataEvent {
  type: 'task_metadata'
  /** 任务 ID */
  taskId: string
  /** 任务状态 */
  status: TaskStatus
  /** 任务开始时间 */
  startTime?: number
  /** 任务结束时间 */
  endTime?: number
  /** 执行时长（毫秒） */
  duration?: number
  /** 错误信息（失败时） */
  error?: string
}

/**
 * Task 进度更新事件（继承 ProgressEvent，增加 taskId）
 */
export interface TaskProgressEvent {
  type: 'task_progress'
  /** 任务 ID */
  taskId: string
  /** 进度消息 */
  message?: string
  /** 进度百分比 0-100 */
  percent?: number
}

/**
 * Task 完成事件
 */
export interface TaskCompletedEvent {
  type: 'task_completed'
  /** 任务 ID */
  taskId: string
  /** 最终状态 */
  status: Exclude<TaskStatus, 'pending' | 'running'>
  /** 执行时长（毫秒） */
  duration?: number
  /** 错误信息（失败时） */
  error?: string
}

/**
 * Task 取消事件
 */
export interface TaskCanceledEvent {
  type: 'task_canceled'
  /** 任务 ID */
  taskId: string
  /** 取消原因 */
  reason?: string
}

/**
 * AI Event - 所有事件的联合类型
 *
 * UI 层只能消费此类型的事件，禁止直接解析 CLI 输出。
 * Engine 必须将原始输出转换为 AIEvent 后再传递给 UI。
 */
export type AIEvent =
  | TokenEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | ProgressEvent
  | ResultEvent
  | ErrorEvent
  | SessionStartEvent
  | SessionEndEvent
  | UserMessageEvent
  | AssistantMessageEvent
  | TaskMetadataEvent
  | TaskProgressEvent
  | TaskCompletedEvent
  | TaskCanceledEvent

/**
 * 事件监听器类型
 */
export type AIEventListener = (event: AIEvent) => void

/**
 * 事件过滤器类型
 */
export type AIEventFilter = (event: AIEvent) => boolean

/**
 * 创建 Token 事件
 */
export function createTokenEvent(value: string): TokenEvent {
  return { type: 'token', value }
}

/**
 * 创建工具调用开始事件
 */
export function createToolCallStartEvent(
  tool: string,
  args: Record<string, unknown>
): ToolCallStartEvent {
  return { type: 'tool_call_start', tool, args }
}

/**
 * 创建工具调用结束事件
 */
export function createToolCallEndEvent(
  tool: string,
  result?: unknown,
  success = true
): ToolCallEndEvent {
  return { type: 'tool_call_end', tool, result, success }
}

/**
 * 创建进度事件
 */
export function createProgressEvent(
  message?: string,
  percent?: number
): ProgressEvent {
  return { type: 'progress', message, percent }
}

/**
 * 创建错误事件
 */
export function createErrorEvent(
  error: string,
  code?: string
): ErrorEvent {
  return { type: 'error', error, code }
}

/**
 * 创建会话开始事件
 */
export function createSessionStartEvent(sessionId: string): SessionStartEvent {
  return { type: 'session_start', sessionId }
}

/**
 * 创建会话结束事件
 */
export function createSessionEndEvent(
  sessionId: string,
  reason?: SessionEndReason
): SessionEndEvent {
  return { type: 'session_end', sessionId, reason }
}

/**
 * 会话结束原因
 */
export type SessionEndReason = 'completed' | 'aborted' | 'error'

/**
 * 创建用户消息事件
 */
export function createUserMessageEvent(
  content: string,
  files?: string[]
): UserMessageEvent {
  return { type: 'user_message', content, files }
}

/**
 * 创建 AI 消息事件
 */
export function createAssistantMessageEvent(
  content: string,
  isDelta = false,
  toolCalls?: ToolCallInfo[]
): AssistantMessageEvent {
  return { type: 'assistant_message', content, isDelta, toolCalls }
}

/**
 * 判断事件类型
 */
export function isTokenEvent(event: AIEvent): event is TokenEvent {
  return event.type === 'token'
}

export function isToolCallStartEvent(event: AIEvent): event is ToolCallStartEvent {
  return event.type === 'tool_call_start'
}

export function isToolCallEndEvent(event: AIEvent): event is ToolCallEndEvent {
  return event.type === 'tool_call_end'
}

export function isProgressEvent(event: AIEvent): event is ProgressEvent {
  return event.type === 'progress'
}

export function isErrorEvent(event: AIEvent): event is ErrorEvent {
  return event.type === 'error'
}

export function isSessionStartEvent(event: AIEvent): event is SessionStartEvent {
  return event.type === 'session_start'
}

export function isSessionEndEvent(event: AIEvent): event is SessionEndEvent {
  return event.type === 'session_end'
}

export function isUserMessageEvent(event: AIEvent): event is UserMessageEvent {
  return event.type === 'user_message'
}

export function isAssistantMessageEvent(event: AIEvent): event is AssistantMessageEvent {
  return event.type === 'assistant_message'
}

/**
 * 创建 Task 元数据事件
 */
export function createTaskMetadataEvent(
  taskId: string,
  status: TaskStatus,
  metadata?: Partial<Omit<TaskMetadataEvent, 'type' | 'taskId' | 'status'>>
): TaskMetadataEvent {
  return { type: 'task_metadata', taskId, status, ...metadata }
}

/**
 * 创建 Task 进度事件
 */
export function createTaskProgressEvent(
  taskId: string,
  message?: string,
  percent?: number
): TaskProgressEvent {
  return { type: 'task_progress', taskId, message, percent }
}

/**
 * 创建 Task 完成事件
 */
export function createTaskCompletedEvent(
  taskId: string,
  status: Exclude<TaskStatus, 'pending' | 'running'>,
  duration?: number,
  error?: string
): TaskCompletedEvent {
  return { type: 'task_completed', taskId, status, duration, error }
}

/**
 * 创建 Task 取消事件
 */
export function createTaskCanceledEvent(
  taskId: string,
  reason?: string
): TaskCanceledEvent {
  return { type: 'task_canceled', taskId, reason }
}

/**
 * Task 事件类型守卫
 */
export function isTaskMetadataEvent(event: AIEvent): event is TaskMetadataEvent {
  return event.type === 'task_metadata'
}

export function isTaskProgressEvent(event: AIEvent): event is TaskProgressEvent {
  return event.type === 'task_progress'
}

export function isTaskCompletedEvent(event: AIEvent): event is TaskCompletedEvent {
  return event.type === 'task_completed'
}

export function isTaskCanceledEvent(event: AIEvent): event is TaskCanceledEvent {
  return event.type === 'task_canceled'
}
