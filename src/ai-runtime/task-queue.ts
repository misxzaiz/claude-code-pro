/**
 * AI Task Queue - 任务队列
 *
 * 管理和调度 AI 任务的执行，支持并发控制。
 * UI 无感知，纯逻辑层。
 */

import type { AISession } from './session'
import type { AITask } from './task'
import type { AIEvent } from './event'

/**
 * 队列中任务的状态
 */
export type QueuedTaskStatus = 'pending' | 'running' | 'success' | 'error' | 'canceled'

/**
 * 队列中的任务项
 */
export interface QueuedTask {
  /** 任务 ID */
  id: string
  /** 任务本体 */
  task: AITask
  /** 执行该任务的 Session */
  session: AISession
  /** 当前状态 */
  status: QueuedTaskStatus
  /** 开始时间 */
  startTime?: number
  /** 结束时间 */
  endTime?: number
  /** 错误信息 */
  error?: string
  /** 任务事件回调 */
  onEvent?: (event: AIEvent) => void
  /** 任务完成回调 */
  onComplete?: (result: TaskResult) => void
  /** AbortController 用于取消任务 */
  abortController: AbortController
}

/**
 * 任务执行结果
 */
export interface TaskResult {
  /** 任务 ID */
  taskId: string
  /** 最终状态 */
  status: Exclude<QueuedTaskStatus, 'pending' | 'running'>
  /** 错误信息（失败时） */
  error?: string
  /** 执行时长（毫秒） */
  duration?: number
}

/**
 * TaskQueue 配置
 */
export interface TaskQueueConfig {
  /** 最大并发数（默认 1） */
  maxParallel?: number
  /** 是否启用调试日志 */
  debug?: boolean
}

/**
 * TaskQueue 事件类型
 */
export type TaskQueueEvent =
  | { type: 'task_enqueued'; taskId: string; queueSize: number }
  | { type: 'task_started'; taskId: string; runningCount: number }
  | { type: 'task_completed'; result: TaskResult }
  | { type: 'task_canceled'; taskId: string }
  | { type: 'queue_empty' }
  | { type: 'error'; error: string }

/**
 * TaskQueue 事件监听器
 */
export type TaskQueueEventListener = (event: TaskQueueEvent) => void

/**
 * AI 任务队列
 *
 * 负责管理 AI 任务的调度和执行，支持并发控制。
 */
export class TaskQueue {
  private pendingTasks: QueuedTask[] = []
  private runningTasks: Map<string, QueuedTask> = new Map()
  private completedTasks: Map<string, TaskResult> = new Map()
  private maxParallel: number
  private debug: boolean
  private eventListeners: Set<TaskQueueEventListener> = new Set()
  private isProcessing: boolean = false

  constructor(config?: TaskQueueConfig) {
    this.maxParallel = config?.maxParallel ?? 1
    this.debug = config?.debug ?? false
    this.log(`TaskQueue created with maxParallel=${this.maxParallel}`)
  }

  /**
   * 添加事件监听器
   */
  onEvent(listener: TaskQueueEventListener): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  /**
   * 发出事件
   */
  private emit(event: TaskQueueEvent): void {
    this.eventListeners.forEach((listener) => {
      try {
        listener(event)
      } catch (e) {
        console.error('[TaskQueue] Event listener error:', e)
      }
    })
  }

  /**
   * 调试日志
   */
  private log(message: string): void {
    if (this.debug) {
      console.log(`[TaskQueue] ${message}`)
    }
  }

  /**
   * 入队任务
   *
   * @param task 要执行的任务
   * @param session 执行任务的 Session
   * @param options 可选回调
   * @returns 任务 ID
   */
  enqueue(
    task: AITask,
    session: AISession,
    options?: {
      onEvent?: (event: AIEvent) => void
      onComplete?: (result: TaskResult) => void
    }
  ): string {
    const queuedTask: QueuedTask = {
      id: task.id,
      task,
      session,
      status: 'pending',
      abortController: new AbortController(),
      onEvent: options?.onEvent,
      onComplete: options?.onComplete,
    }

    this.pendingTasks.push(queuedTask)
    this.log(`Task enqueued: ${task.id}, queue size: ${this.pendingTasks.length}`)

    this.emit({ type: 'task_enqueued', taskId: task.id, queueSize: this.pendingTasks.length })

    // 触发处理
    this.schedule()

    return task.id
  }

  /**
   * 取消任务
   *
   * @param taskId 任务 ID
   * @returns 是否成功取消
   */
  cancel(taskId: string): boolean {
    // 检查 pending 任务
    const pendingIndex = this.pendingTasks.findIndex((t) => t.id === taskId)
    if (pendingIndex !== -1) {
      const task = this.pendingTasks.splice(pendingIndex, 1)[0]
      task.status = 'canceled'
      this.emit({ type: 'task_canceled', taskId })
      this.log(`Task canceled (pending): ${taskId}`)
      return true
    }

    // 检查 running 任务
    const runningTask = this.runningTasks.get(taskId)
    if (runningTask) {
      runningTask.abortController.abort()
      runningTask.session.abort(taskId)
      runningTask.status = 'canceled'
      this.runningTasks.delete(taskId)
      this.emit({ type: 'task_canceled', taskId })
      this.log(`Task canceled (running): ${taskId}`)
      // 触发处理，可能有待执行的任务
      this.schedule()
      return true
    }

    this.log(`Task not found for cancellation: ${taskId}`)
    return false
  }

  /**
   * 获取任务状态
   */
  getStatus(taskId: string): QueuedTaskStatus | undefined {
    // 检查 pending
    const pending = this.pendingTasks.find((t) => t.id === taskId)
    if (pending) return pending.status

    // 检查 running
    const running = this.runningTasks.get(taskId)
    if (running) return running.status

    // 检查 completed
    const completed = this.completedTasks.get(taskId)
    if (completed) return completed.status as QueuedTaskStatus

    return undefined
  }

  /**
   * 获取队列统计
   */
  getStats(): {
    pending: number
    running: number
    completed: number
  } {
    return {
      pending: this.pendingTasks.length,
      running: this.runningTasks.size,
      completed: this.completedTasks.size,
    }
  }

  /**
   * 清空队列（只清空未执行的任务）
   */
  clear(): number {
    const count = this.pendingTasks.length
    this.pendingTasks = []
    this.log(`Queue cleared, removed ${count} pending tasks`)
    return count
  }

  /**
   * 销毁队列，取消所有任务
   */
  dispose(): void {
    this.log('Disposing TaskQueue...')

    // 取消所有 pending 任务
    this.pendingTasks.forEach((task) => {
      task.abortController.abort()
    })
    this.pendingTasks = []

    // 取消所有 running 任务
    this.runningTasks.forEach((task) => {
      task.abortController.abort()
      task.session.abort(task.id)
    })
    this.runningTasks.clear()

    // 清理监听器
    this.eventListeners.clear()
  }

  /**
   * 调度器
   *
   * 核心调度逻辑：当有空闲槽位时，从 pending 取出任务执行
   */
  private schedule(): void {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    // 使用 async/await 但不阻塞
    this.processQueue().catch((error) => {
      this.emit({ type: 'error', error: String(error) })
      this.isProcessing = false
    })
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    while (this.pendingTasks.length > 0 && this.runningTasks.size < this.maxParallel) {
      const task = this.pendingTasks.shift()
      if (!task) break

      await this.executeTask(task)
    }

    // 检查是否所有任务都完成
    if (this.pendingTasks.length === 0 && this.runningTasks.size === 0) {
      this.emit({ type: 'queue_empty' })
    }

    this.isProcessing = false
  }

  /**
   * 执行单个任务
   */
  private async executeTask(queuedTask: QueuedTask): Promise<void> {
    const { id, task, session, abortController, onEvent } = queuedTask

    queuedTask.status = 'running'
    queuedTask.startTime = Date.now()
    this.runningTasks.set(id, queuedTask)

    this.log(`Task started: ${id}, running: ${this.runningTasks.size}/${this.maxParallel}`)
    this.emit({ type: 'task_started', taskId: id, runningCount: this.runningTasks.size })

    try {
      // 检查是否已被取消
      if (abortController.signal.aborted) {
        throw new Error('Task canceled before execution')
      }

      // 执行任务：遍历 AsyncIterable<AIEvent>
      const eventStream = session.run(task)

      for await (const event of eventStream) {
        // 检查取消信号
        if (abortController.signal.aborted) {
          queuedTask.status = 'canceled'
          this.completeTask(queuedTask, 'canceled')
          return
        }

        // 触发事件回调
        if (onEvent) {
          try {
            onEvent(event)
          } catch (e) {
            console.error(`[TaskQueue] Event callback error for task ${id}:`, e)
          }
        }
      }

      // 正常完成
      queuedTask.status = 'success'
      this.completeTask(queuedTask, 'success')
    } catch (error) {
      queuedTask.status = 'error'
      queuedTask.error = error instanceof Error ? error.message : String(error)
      this.completeTask(queuedTask, 'error', queuedTask.error)
    }
  }

  /**
   * 完成任务清理
   */
  private completeTask(
    queuedTask: QueuedTask,
    status: Exclude<QueuedTaskStatus, 'pending' | 'running'>,
    error?: string
  ): void {
    const { id } = queuedTask

    queuedTask.endTime = Date.now()
    this.runningTasks.delete(id)

    const result: TaskResult = {
      taskId: id,
      status,
      error,
      duration: queuedTask.startTime ? queuedTask.endTime - queuedTask.startTime : undefined,
    }

    this.completedTasks.set(id, result)
    this.log(`Task completed: ${id}, status: ${status}, duration: ${result.duration}ms`)

    this.emit({ type: 'task_completed', result })

    // 触发完成回调
    if (queuedTask.onComplete) {
      try {
        queuedTask.onComplete(result)
      } catch (e) {
        console.error(`[TaskQueue] Complete callback error for task ${id}:`, e)
      }
    }

    // 继续调度
    this.schedule()
  }

  /**
   * 等待所有任务完成
   */
  async waitIdle(): Promise<void> {
    return new Promise((resolve) => {
      const checkIdle = () => {
        if (this.pendingTasks.length === 0 && this.runningTasks.size === 0) {
          unsubscribe()
          resolve()
        }
      }

      // 订阅 queue_empty 事件
      const unsubscribe = this.onEvent((event) => {
        if (event.type === 'queue_empty') {
          checkIdle()
        }
      })

      // 检查初始状态
      checkIdle()
    })
  }

  /**
   * 获取指定 ID 的任务结果
   */
  getResult(taskId: string): TaskResult | undefined {
    return this.completedTasks.get(taskId)
  }

  /**
   * 清除已完成的任务记录
   */
  clearCompleted(): number {
    const count = this.completedTasks.size
    this.completedTasks.clear()
    this.log(`Cleared ${count} completed task results`)
    return count
  }
}

/**
 * 创建 TaskQueue 的工厂函数
 */
export function createTaskQueue(config?: TaskQueueConfig): TaskQueue {
  return new TaskQueue(config)
}

/**
 * 全局单例 TaskQueue
 */
let globalTaskQueue: TaskQueue | null = null

/**
 * 获取全局 TaskQueue 单例
 */
export function getTaskQueue(config?: TaskQueueConfig): TaskQueue {
  if (!globalTaskQueue) {
    globalTaskQueue = new TaskQueue(config)
  }
  return globalTaskQueue
}

/**
 * 重置全局 TaskQueue（主要用于测试）
 */
export function resetTaskQueue(): void {
  if (globalTaskQueue) {
    globalTaskQueue.dispose()
    globalTaskQueue = null
  }
}
