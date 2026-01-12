/**
 * 事件驱动的 Task 管理模块
 *
 * 基于 EventBus 的异步任务管理，支持：
 * - 任务生命周期管理
 * - 事件驱动的状态更新
 * - 任务优先级和并发控制
 * - 任务历史记录
 */

import type { AITask, AITaskMetadata, AITaskStatus } from './task'
import type { AIEvent } from './event'
import {
  isSessionStartEvent,
  isSessionEndEvent,
  isProgressEvent,
  isErrorEvent,
} from './event'
import { getEventBus } from './event-bus'

/**
 * 任务执行状态
 */
interface TaskExecution {
  /** 任务定义 */
  task: AITask
  /** 任务元数据 */
  metadata: AITaskMetadata
  /** 取消令牌 */
  abortController: AbortController
  /** 事件订阅清理函数 */
  cleanup: () => void
}

/**
 * 任务优先级
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

/**
 * 任务选项
 */
export interface TaskOptions {
  /** 任务优先级 */
  priority?: TaskPriority
  /** 是否为后台任务 */
  background?: boolean
  /** 超时时间（毫秒） */
  timeout?: number
  /** 重试次数 */
  retries?: number
  /** 任务标签 */
  tags?: string[]
}

/**
 * 任务结果
 */
export interface TaskResult<T = unknown> {
  /** 任务 ID */
  taskId: string
  /** 是否成功 */
  success: boolean
  /** 输出数据 */
  output?: T
  /** 错误信息 */
  error?: string
  /** 完成时间 */
  completedAt: number
}

/**
 * 任务事件
 */
export interface TaskManagerEvent {
  type: 'task_queued' | 'task_started' | 'task_progress' | 'task_completed' | 'task_failed' | 'task_aborted'
  taskId: string
  timestamp: number
  data?: unknown
}

/**
 * 任务管理器配置
 */
export interface TaskManagerConfig {
  /** 最大并发任务数 */
  maxConcurrent?: number
  /** 任务超时时间（毫秒） */
  defaultTimeout?: number
  /** 是否启用调试 */
  debug?: boolean
}

/**
 * 任务管理器
 *
 * 基于事件驱动的异步任务管理器。
 */
export class TaskManager {
  private eventBus: ReturnType<typeof getEventBus>
  private queue: Map<string, { task: AITask; options: TaskOptions }> = new Map()
  private executions: Map<string, TaskExecution> = new Map()
  private history: TaskResult[] = []
  private config: Required<TaskManagerConfig>
  private processing = false
  private eventUnsub!: () => void

  constructor(config: TaskManagerConfig = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 3,
      defaultTimeout: config.defaultTimeout ?? 300000,
      debug: config.debug ?? false,
    }
    this.eventBus = getEventBus({ debug: this.config.debug })

    // 监听 EventBus 中的 AIEvent，更新任务状态
    this.setupEventListeners()
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners(): void {
    const unsubscribers = [
      // 监听 session_start，标记任务开始
      this.eventBus.on('session_start', (event) => {
        if (isSessionStartEvent(event)) {
          this.log(`[TaskManager] Session started: ${event.sessionId}`)
          // 通知所有等待中的任务
          this.notifyTasksWaiting()
        }
      }),

      // 监听 progress，更新任务进度
      this.eventBus.on('progress', (event) => {
        if (isProgressEvent(event)) {
          // 找到对应的任务并更新进度
          this.executions.forEach((exec) => {
            if (exec.metadata.status === 'running') {
              this.emitTaskEvent('task_progress', exec.metadata.taskId, { message: event.message })
            }
          })
        }
      }),

      // 监听 session_end，标记任务完成
      this.eventBus.on('session_end', (event) => {
        if (isSessionEndEvent(event)) {
          this.log(`[TaskManager] Session ended: ${event.sessionId}, reason: ${event.reason}`)
          // 完成所有相关任务
          this.completeTasksForSession(event.sessionId, event.reason)
        }
      }),

      // 监听 error，标记任务失败
      this.eventBus.on('error', (event) => {
        if (isErrorEvent(event)) {
          this.log(`[TaskManager] Error: ${event.error}`)
          // 标记当前运行的任务为失败
          this.failRunningTasks(event.error)
        }
      }),
    ]

    this.eventUnsub = () => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }

  /**
   * 提交任务
   */
  submit(task: AITask, options: TaskOptions = {}): string {
    const taskId = task.id

    this.queue.set(taskId, { task, options })
    this.emitTaskEvent('task_queued', taskId, { task, options })

    this.log(`[TaskManager] Task queued: ${taskId}`)

    // 尝试处理队列
    this.processQueue()

    return taskId
  }

  /**
   * 提交并执行任务（异步）
   */
  async execute<T = unknown>(task: AITask, options: TaskOptions = {}): Promise<TaskResult<T>> {
    return new Promise((resolve, reject) => {
      const taskId = this.submit(task, options)

      // 监听任务完成事件
      const unsub = this.onTaskEvent((event) => {
        if (event.taskId === taskId) {
          if (event.type === 'task_completed') {
            unsub()
            resolve({
              taskId,
              success: true,
              output: event.data as T,
              completedAt: event.timestamp,
            })
          } else if (event.type === 'task_failed') {
            unsub()
            reject(new Error(event.data as string))
          } else if (event.type === 'task_aborted') {
            unsub()
            reject(new Error('Task aborted'))
          }
        }
      })
    })
  }

  /**
   * 中断任务
   */
  abort(taskId: string): boolean {
    const execution = this.executions.get(taskId)
    if (execution) {
      execution.abortController.abort()
      execution.metadata.status = 'aborted'

      this.emitTaskEvent('task_aborted', taskId)
      this.log(`[TaskManager] Task aborted: ${taskId}`)

      this.processQueue()
      return true
    }
    return false
  }

  /**
   * 获取任务状态
   */
  getStatus(taskId: string): AITaskStatus | undefined {
    const execution = this.executions.get(taskId)
    if (execution) {
      return execution.metadata.status
    }

    const queued = this.queue.get(taskId)
    if (queued) {
      return 'pending'
    }

    // 检查历史
    const history = this.history.find((h) => h.taskId === taskId)
    if (history) {
      return history.success ? 'completed' : 'failed'
    }

    return undefined
  }

  /**
   * 获取任务元数据
   */
  getMetadata(taskId: string): AITaskMetadata | undefined {
    const execution = this.executions.get(taskId)
    return execution?.metadata
  }

  /**
   * 获取所有活动任务
   */
  getActiveTasks(): Map<string, AITaskMetadata> {
    const result = new Map<string, AITaskMetadata>()
    this.executions.forEach((exec, id) => {
      result.set(id, exec.metadata)
    })
    return result
  }

  /**
   * 获取队列中的任务
   */
  getQueuedTasks(): AITask[] {
    return Array.from(this.queue.values()).map((v) => v.task)
  }

  /**
   * 获取任务历史
   */
  getHistory(filter?: (result: TaskResult) => boolean): TaskResult[] {
    if (filter) {
      return this.history.filter(filter)
    }
    return [...this.history]
  }

  /**
   * 清空队列
   */
  clearQueue(): void {
    this.queue.forEach((_, taskId) => {
      this.emitTaskEvent('task_aborted', taskId)
    })
    this.queue.clear()
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.eventUnsub()

    // 中断所有活动任务
    this.executions.forEach((_, taskId) => {
      this.abort(taskId)
    })

    this.queue.clear()
    this.executions.clear()
  }

  /**
   * 处理队列
   */
  private processQueue(): void {
    if (this.processing) return

    this.processing = true

    try {
      // 检查并发限制
      const runningCount = Array.from(this.executions.values()).filter(
        (e) => e.metadata.status === 'running'
      ).length

      if (runningCount >= this.config.maxConcurrent) {
        return
      }

      // 按优先级排序队列
      const queuedTasks = Array.from(this.queue.entries()).sort((a, b) => {
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
        const aPriority = priorityOrder[a[1].options.priority ?? 'normal']
        const bPriority = priorityOrder[b[1].options.priority ?? 'normal']
        return aPriority - bPriority
      })

      // 启动可以启动的任务
      const availableSlots = this.config.maxConcurrent - runningCount
      for (let i = 0; i < Math.min(availableSlots, queuedTasks.length); i++) {
        const [taskId, { task, options }] = queuedTasks[i]
        this.queue.delete(taskId)
        this.startTask(task, options)
      }
    } finally {
      this.processing = false
    }
  }

  /**
   * 启动任务
   */
  private startTask(task: AITask, options: TaskOptions): void {
    const abortController = new AbortController()
    const metadata: AITaskMetadata = {
      taskId: task.id,
      sessionId: 'pending',
      status: 'running',
      startTime: Date.now(),
    }

    // 设置超时
    const timeout = options.timeout ?? this.config.defaultTimeout
    const timeoutHandle = setTimeout(() => {
      if (metadata.status === 'running') {
        this.abort(task.id)
      }
    }, timeout)

    const execution: TaskExecution = {
      task,
      metadata,
      abortController,
      cleanup: () => {
        clearTimeout(timeoutHandle)
      },
    }

    this.executions.set(task.id, execution)
    this.emitTaskEvent('task_started', task.id, { task, options })

    this.log(`[TaskManager] Task started: ${task.id}`)
  }

  /**
   * 完成会话相关任务
   */
  private completeTasksForSession(sessionId: string, reason?: string): void {
    this.executions.forEach((exec, taskId) => {
      if (exec.metadata.sessionId === sessionId || exec.metadata.sessionId === 'pending') {
        exec.cleanup()

        exec.metadata.status = reason === 'aborted' ? 'aborted' : 'completed'
        exec.metadata.endTime = Date.now()

        // 记录历史
        this.history.push({
          taskId,
          success: reason !== 'aborted' && reason !== 'error',
          completedAt: Date.now(),
        })

        // 移除执行
        this.executions.delete(taskId)

        if (reason === 'completed') {
          this.emitTaskEvent('task_completed', taskId)
        } else {
          this.emitTaskEvent('task_aborted', taskId, { reason })
        }

        // 继续处理队列
        this.processQueue()
      }
    })
  }

  /**
   * 标记运行中的任务为失败
   */
  private failRunningTasks(error: string): void {
    this.executions.forEach((exec, taskId) => {
      if (exec.metadata.status === 'running') {
        exec.cleanup()

        exec.metadata.status = 'failed'
        exec.metadata.error = error
        exec.metadata.endTime = Date.now()

        // 记录历史
        this.history.push({
          taskId,
          success: false,
          error,
          completedAt: Date.now(),
        })

        this.executions.delete(taskId)
        this.emitTaskEvent('task_failed', taskId, { error })

        this.processQueue()
      }
    })
  }

  /**
   * 通知等待中的任务
   */
  private notifyTasksWaiting(): void {
    // 当 session 开始时，更新相关任务的 sessionId
    this.executions.forEach((exec) => {
      if (exec.metadata.sessionId === 'pending') {
        // 这里可以通过某种方式获取真实的 sessionId
        // 暂时保持 pending 状态
      }
    })
  }

  /**
   * 发送任务管理事件
   */
  private emitTaskEvent(type: TaskManagerEvent['type'], taskId: string, data?: unknown): void {
    const event: TaskManagerEvent = {
      type,
      taskId,
      timestamp: Date.now(),
      data,
    }

    // 通过 EventBus 发送
    this.eventBus.emit({
      type: 'progress',
      message: `Task ${type}: ${taskId}`,
    } as AIEvent)

    // 内部事件监听器
    this.taskEventListeners.forEach((listener) => listener(event))
  }

  /**
   * 任务事件监听器
   */
  private taskEventListeners: Set<(event: TaskManagerEvent) => void> = new Set()

  /**
   * 监听任务事件
   */
  onTaskEvent(listener: (event: TaskManagerEvent) => void): () => void {
    this.taskEventListeners.add(listener)
    return () => this.taskEventListeners.delete(listener)
  }

  /**
   * 日志
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(message)
    }
  }
}

/**
 * 全局任务管理器
 */
let globalTaskManager: TaskManager | null = null

/**
 * 获取任务管理器单例
 */
export function getTaskManager(config?: TaskManagerConfig): TaskManager {
  if (!globalTaskManager) {
    globalTaskManager = new TaskManager(config)
  }
  return globalTaskManager
}

/**
 * 重置任务管理器
 */
export function resetTaskManager(): void {
  if (globalTaskManager) {
    globalTaskManager.dispose()
    globalTaskManager = null
  }
}

/**
 * 快捷方法：提交任务
 */
export function submitTask(task: AITask, options?: TaskOptions): string {
  return getTaskManager().submit(task, options)
}

/**
 * 快捷方法：执行任务
 */
export function executeTask<T = unknown>(task: AITask, options?: TaskOptions): Promise<TaskResult<T>> {
  return getTaskManager().execute(task, options)
}

/**
 * 快捷方法：中断任务
 */
export function abortTask(taskId: string): boolean {
  return getTaskManager().abort(taskId)
}
