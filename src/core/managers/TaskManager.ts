/**
 * Task Manager
 *
 * 管理任务的生命周期：创建、启动、取消、完成
 */

import type { Task, CreateTaskParams, ReviewFeedback } from '../models'
import { useTaskStore } from '../../stores/taskStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { RunManager } from './RunManager'
import { getReviewManager } from './ReviewManager'

/**
 * Task Manager
 *
 * 负责任务的完整生命周期管理
 */
export class TaskManager {
  private taskStore = useTaskStore.getState()
  private workspaceStore = useWorkspaceStore.getState()
  private runManager = new RunManager()
  private reviewManager = getReviewManager()

  /**
   * 创建新任务
   *
   * @param params 创建参数
   * @returns 创建的任务
   */
  createTask(params: CreateTaskParams): Task {
    const task = this.taskStore.createTask(params)
    console.log(`[TaskManager] Task created: ${task.id} - ${task.title}`)
    return task
  }

  /**
   * 启动任务（创建第一次 Run）
   *
   * @param taskId 任务 ID
   * @returns 创建的 Run ID
   */
  async startTask(taskId: string): Promise<string> {
    const task = this.taskStore.getTask(taskId)
    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }

    if (task.status === 'running') {
      throw new Error(`Task is already running: ${taskId}`)
    }

    // 更新任务状态
    this.taskStore.updateTask(taskId, { status: 'running' })

    // 构建执行上下文
    const context = this.buildRunContext(task)

    // 创建第一次 Run
    const run = this.runManager.createRun({
      taskId: task.id,
      sequence: task.runIds.length + 1,
      agentType: task.agentType,
      context,
    })

    // 关联 Run 到 Task
    this.taskStore.addRunId(taskId, run.id)
    this.taskStore.updateTask(taskId, { activeRunId: run.id })

    // 启动执行
    this.runManager.executeRun(run.id)

    console.log(`[TaskManager] Task started: ${taskId}, Run: ${run.id}`)
    return run.id
  }

  /**
   * 取消任务
   *
   * @param taskId 任务 ID
   */
  cancelTask(taskId: string): void {
    const task = this.taskStore.getTask(taskId)
    if (!task) {
      return
    }

    // 取消当前活跃的 Run
    if (task.activeRunId) {
      this.runManager.abortRun(task.activeRunId)
    }

    // 更新任务状态
    this.taskStore.updateTask(taskId, { status: 'cancelled' })

    console.log(`[TaskManager] Task cancelled: ${taskId}`)
  }

  /**
   * 完成任务
   *
   * @param taskId 任务 ID
   */
  completeTask(taskId: string): void {
    const task = this.taskStore.getTask(taskId)
    if (!task) {
      return
    }

    this.taskStore.updateTask(taskId, { status: 'completed' })
    console.log(`[TaskManager] Task completed: ${taskId}`)
  }

  /**
   * 标记任务等待审查
   *
   * @param taskId 任务 ID
   * @param runId Run ID
   */
  async markTaskWaitingReview(taskId: string, runId: string): Promise<void> {
    const task = this.taskStore.getTask(taskId)
    if (!task) {
      return
    }

    // 更新任务状态
    this.taskStore.updateTask(taskId, { status: 'waiting_review' })

    // 创建审查
    const review = this.reviewManager.createReview({
      runId,
      taskId,
    })

    console.log(`[TaskManager] Task waiting review: ${taskId}, Review: ${review.id}`)
  }

  /**
   * 任务执行失败
   *
   * @param taskId 任务 ID
   * @param error 错误信息
   */
  markTaskFailed(taskId: string, error: string): void {
    const task = this.taskStore.getTask(taskId)
    if (!task) {
      return
    }

    this.taskStore.updateTask(taskId, { status: 'failed' })
    console.error(`[TaskManager] Task failed: ${taskId}`, error)
  }

  /**
   * 根据审查反馈重新执行任务
   *
   * @param taskId 任务 ID
   * @param reviewId 审查 ID
   * @returns 新的 Run ID
   */
  async retryTaskFromReview(taskId: string, reviewId: string): Promise<string> {
    const task = this.taskStore.getTask(taskId)
    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }

    // 获取审查
    const review = this.reviewManager.getReview(reviewId)
    if (!review || !review.feedback) {
      throw new Error(`Review not found or has no feedback: ${reviewId}`)
    }

    // 更新任务状态
    this.taskStore.updateTask(taskId, { status: 'running' })

    // 准备执行上下文（使用 RunManager 的上下文管理逻辑）
    const filteredFeedback = this.runManager.prepareNextRunContext([review.feedback])

    // 构建执行上下文
    const context = this.buildRunContext(task, filteredFeedback)

    // 创建新的 Run
    const run = this.runManager.createRun({
      taskId: task.id,
      sequence: task.runIds.length + 1,
      agentType: task.agentType,
      context,
    })

    // 关联 Run 到 Task
    this.taskStore.addRunId(taskId, run.id)
    this.taskStore.updateTask(taskId, { activeRunId: run.id })

    // 启动执行
    this.runManager.executeRun(run.id)

    console.log(`[TaskManager] Task retried: ${taskId}, Run: ${run.id}`)
    return run.id
  }

  /**
   * 删除任务
   *
   * @param taskId 任务 ID
   */
  deleteTask(taskId: string): void {
    const task = this.taskStore.getTask(taskId)
    if (!task) {
      return
    }

    // 删除所有关联的 Run
    task.runIds.forEach(runId => {
      this.runManager.deleteRun(runId)
    })

    // 删除所有关联的 Review
    const reviews = this.reviewManager.getReviewsByTask(taskId)
    reviews.forEach((review: any) => {
      this.reviewManager.deleteReview(review.id)
    })

    // 删除任务
    this.taskStore.deleteTask(taskId)

    console.log(`[TaskManager] Task deleted: ${taskId}`)
  }

  /**
   * 构建执行上下文
   *
   * @param task 任务
   * @param previousFeedback 之前的反馈
   * @returns 执行上下文
   */
  private buildRunContext(task: Task, previousFeedback?: ReviewFeedback[]): any {
    // 获取工作区信息
    const workspace = this.workspaceStore.workspaces.find(w => w.id === task.workspaceId)

    return {
      userInput: task.description,
      files: [], // TODO: 从任务关联的文件中获取
      previousFeedback: previousFeedback || [],
      options: {
        workspaceId: task.workspaceId,
        agentType: task.agentType,
        taskKind: task.kind,
        workspacePath: workspace?.path,
      },
    }
  }

  /**
   * 获取任务的所有运行历史
   *
   * @param taskId 任务 ID
   * @returns Run 列表
   */
  getTaskRuns(taskId: string) {
    const task = this.taskStore.getTask(taskId)
    if (!task) {
      return []
    }

    return task.runIds.map(runId =>
      this.runManager['runStore'].getRunSummary(runId)
    ).filter(Boolean)
  }

  /**
   * 获取任务的活跃 Run
   *
   * @param taskId 任务 ID
   * @returns Run ID
   */
  getActiveRun(taskId: string): string | undefined {
    const task = this.taskStore.getTask(taskId)
    return task?.activeRunId
  }
}

/**
 * 单例 Task Manager
 */
let taskManagerInstance: TaskManager | null = null

/**
 * 获取 Task Manager 单例
 */
export function getTaskManager(): TaskManager {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager()
  }
  return taskManagerInstance
}
