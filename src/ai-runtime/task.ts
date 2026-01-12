/**
 * AI Task - 通用任务模型
 *
 * 定义了所有 AI Engine 必须支持的任务格式。
 * UI 层通过 AITask 向 AI Engine 提交任务请求。
 */

/**
 * 任务类型
 */
export type AITaskKind = 'chat' | 'refactor' | 'analyze' | 'generate'

/**
 * 任务输入
 */
export interface AITaskInput {
  /** 用户提示词 */
  prompt: string
  /** 关联的文件列表（路径） */
  files?: string[]
  /** 额外参数，不同 Engine 可自定义 */
  extra?: Record<string, unknown>
}

/**
 * AI 任务
 *
 * 这是 AI Runtime 的通用任务模型，所有 Engine 都必须能处理此格式。
 * 禁止在此出现 Claude / CLI / Tool 等具体实现名称。
 */
export interface AITask {
  /** 任务唯一标识 */
  id: string
  /** 任务类型 */
  kind: AITaskKind
  /** 任务输入 */
  input: AITaskInput
}

/**
 * 创建新的 AI 任务
 */
export function createTask(
  kind: AITaskKind,
  input: AITaskInput,
  id?: string
): AITask {
  return {
    id: id || crypto.randomUUID(),
    kind,
    input,
  }
}

/**
 * 任务状态
 */
export type AITaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted'

/**
 * 任务元数据
 */
export interface AITaskMetadata {
  /** 任务 ID */
  taskId: string
  /** 所属会话 ID */
  sessionId: string
  /** 任务状态 */
  status: AITaskStatus
  /** 开始时间 */
  startTime?: number
  /** 结束时间 */
  endTime?: number
  /** 错误信息（失败时） */
  error?: string
}
