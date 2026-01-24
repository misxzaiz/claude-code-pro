/**
 * Task Store
 *
 * 管理任务状态
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Task,
  TaskStatus,
  CreateTaskParams,
  UpdateTaskParams,
} from '../core/models'

/**
 * Task Store 状态
 */
interface TaskState {
  /** 所有任务 */
  tasks: Record<string, Task>

  /** 当前选中的任务 ID */
  selectedTaskId: string | null

  /** 加载状态 */
  isLoading: boolean

  /** 错误信息 */
  error: string | null
}

/**
 * Task Store 操作
 */
interface TaskActions {
  /** 获取所有任务 */
  getAllTasks: () => Task[]

  /** 获取单个任务 */
  getTask: (id: string) => Task | undefined

  /** 创建任务 */
  createTask: (params: CreateTaskParams) => Task

  /** 更新任务 */
  updateTask: (id: string, updates: UpdateTaskParams) => void

  /** 删除任务 */
  deleteTask: (id: string) => void

  /** 按状态获取任务 */
  getTasksByStatus: (status: TaskStatus) => Task[]

  /** 按工作区获取任务 */
  getTasksByWorkspace: (workspaceId: string) => Task[]

  /** 设置选中任务 */
  setSelectedTask: (id: string | null) => void

  /** 添加 Run ID 到任务 */
  addRunId: (taskId: string, runId: string) => void

  /** 清空所有任务 */
  clearTasks: () => void

  /** 设置加载状态 */
  setLoading: (loading: boolean) => void

  /** 设置错误信息 */
  setError: (error: string | null) => void
}

/**
 * Task Store 类型
 */
export type TaskStore = TaskState & TaskActions

/**
 * 创建 Task Store
 */
export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      // ========== 状态 ==========

      tasks: {},
      selectedTaskId: null,
      isLoading: false,
      error: null,

      // ========== 操作 ==========

      getAllTasks: () => {
        return Object.values(get().tasks).sort(
          (a, b) => b.updatedAt - a.updatedAt
        )
      },

      getTask: (id: string) => {
        return get().tasks[id]
      },

      createTask: (params: CreateTaskParams) => {
        const now = Date.now()
        const task: Task = {
          id: crypto.randomUUID(),
          title: params.title,
          description: params.description,
          kind: params.kind,
          status: 'draft',
          priority: params.priority || 'medium',
          agentType: params.agentType,
          workspaceId: params.workspaceId,
          runIds: [],
          createdAt: now,
          updatedAt: now,
          tags: params.tags,
          parentTaskId: params.parentTaskId,
        }

        set(state => ({
          tasks: { ...state.tasks, [task.id]: task },
        }))

        return task
      },

      updateTask: (id: string, updates: UpdateTaskParams) => {
        const task = get().tasks[id]
        if (!task) {
          throw new Error(`Task not found: ${id}`)
        }

        const updatedTask: Task = {
          ...task,
          ...updates,
          updatedAt: Date.now(),
        }

        // 处理特殊字段
        if (updates.addRunId) {
          updatedTask.runIds = [...task.runIds, updates.addRunId]
          delete (updatedTask as any).addRunId
        }

        if (updates.addSubTaskId) {
          updatedTask.subTaskIds = [...(task.subTaskIds || []), updates.addSubTaskId]
          delete (updatedTask as any).addSubTaskId
        }

        set(state => ({
          tasks: { ...state.tasks, [id]: updatedTask },
        }))
      },

      deleteTask: (id: string) => {
        const task = get().tasks[id]
        if (!task) {
          return
        }

        // 如果有子任务，需要先删除子任务
        if (task.subTaskIds && task.subTaskIds.length > 0) {
          task.subTaskIds.forEach(subTaskId => {
            get().deleteTask(subTaskId)
          })
        }

        set(state => {
          const newTasks = { ...state.tasks }
          delete newTasks[id]
          return { tasks: newTasks }
        })

        // 如果删除的是当前选中任务，清空选中
        if (get().selectedTaskId === id) {
          set({ selectedTaskId: null })
        }
      },

      getTasksByStatus: (status: TaskStatus) => {
        return Object.values(get().tasks)
          .filter(task => task.status === status)
          .sort((a, b) => b.updatedAt - a.updatedAt)
      },

      getTasksByWorkspace: (workspaceId: string) => {
        return Object.values(get().tasks)
          .filter(task => task.workspaceId === workspaceId)
          .sort((a, b) => b.updatedAt - a.updatedAt)
      },

      setSelectedTask: (id: string | null) => {
        set({ selectedTaskId: id })
      },

      addRunId: (taskId: string, runId: string) => {
        get().updateTask(taskId, { addRunId: runId })
      },

      clearTasks: () => {
        set({ tasks: {}, selectedTaskId: null })
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      setError: (error: string | null) => {
        set({ error })
      },
    }),
    {
      name: 'polaris-tasks',
      partialize: (state) => ({
        tasks: state.tasks,
        selectedTaskId: state.selectedTaskId,
      }),
    }
  )
)
