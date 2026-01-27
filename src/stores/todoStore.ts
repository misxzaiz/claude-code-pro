/**
 * 待办事项 Store
 *
 * 管理所有待办事项的状态、CRUD 操作和持久化
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  createTodoCreatedEvent,
  createTodoUpdatedEvent,
  createTodoDeletedEvent,
  getEventBus,
} from '../ai-runtime'
import type {
  TodoItem,
  TodoStatus,
  TodoStats,
  TodoFilter,
  TodoCreateParams,
  TodoUpdateParams,
  TodoStore,
} from '../types'

const STORAGE_KEY = 'polaris_todos_v1'

/**
 * 计算待办统计信息
 */
function calculateStats(todos: TodoItem[]): TodoStats {
  return {
    total: todos.length,
    pending: todos.filter((t) => t.status === 'pending').length,
    inProgress: todos.filter((t) => t.status === 'in_progress').length,
    completed: todos.filter((t) => t.status === 'completed').length,
    cancelled: todos.filter((t) => t.status === 'cancelled').length,
    urgent: todos.filter((t) => t.priority === 'urgent' && t.status !== 'completed').length,
  }
}

/**
 * 创建 TodoStore
 */
export const useTodoStore = create<TodoStore>()(
  persist(
    (set, get) => ({
      // ========================================
      // State
      // ========================================

      todos: [],
      selectedTodoId: null,
      filter: {
        status: 'all',
        priority: undefined,
        tags: undefined,
        search: '',
        limit: undefined,
        offset: 0,
      },
      isLoading: false,
      error: null,
      stats: {
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
        urgent: 0,
      },

      // ========================================
      // CRUD Operations
      // ========================================

      /**
       * 创建待办
       */
      createTodo: async (params: TodoCreateParams) => {
        const now = new Date().toISOString()

        // 转换子任务：从简化类型转换为完整类型
        const subtasks = params.subtasks?.map((st) => ({
          id: crypto.randomUUID(),
          title: st.title,
          completed: false,
          createdAt: now,
        }))

        const newTodo: TodoItem = {
          id: crypto.randomUUID(),
          content: params.content,
          description: params.description,
          status: 'pending',
          priority: params.priority || 'normal',
          tags: params.tags || [],
          relatedFiles: params.relatedFiles || [],
          dueDate: params.dueDate,
          estimatedHours: params.estimatedHours,
          workspaceId: params.workspaceId,
          gitContext: params.gitContext,
          subtasks,
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          todos: [...state.todos, newTodo],
        }))

        get().refreshStats()

        // 发送事件到 AI Runtime
        try {
          getEventBus().emit(
            createTodoCreatedEvent(newTodo.id, newTodo.content, newTodo.priority, 'user')
          )
        } catch (error) {
          console.error('[TodoStore] Failed to emit todo_created event:', error)
        }

        return newTodo
      },

      /**
       * 批量创建待办
       */
      batchCreateTodos: async (paramsList: TodoCreateParams[]) => {
        const now = new Date().toISOString()
        const newTodos: TodoItem[] = paramsList.map((params) => ({
          id: crypto.randomUUID(),
          content: params.content,
          description: params.description,
          status: 'pending',
          priority: params.priority || 'normal',
          tags: params.tags || [],
          relatedFiles: params.relatedFiles || [],
          dueDate: params.dueDate,
          estimatedHours: params.estimatedHours,
          workspaceId: params.workspaceId,
          gitContext: params.gitContext,
          createdAt: now,
          updatedAt: now,
        }))

        set((state) => ({
          todos: [...state.todos, ...newTodos],
        }))

        get().refreshStats()

        return newTodos
      },

      /**
       * 更新待办
       */
      updateTodo: (id: string, updates: TodoUpdateParams) => {
        let updated: TodoItem | null = null

        set((state) => {
          const index = state.todos.findIndex((t) => t.id === id)
          if (index === -1) return state

          const originalTodo = state.todos[index]

          // 如果状态变为 completed，记录完成时间
          const shouldAddCompletedAt = updates.status === 'completed' && originalTodo.status !== 'completed'

          // 防御性检查: 保护关键字段不被清空
          // 只有当新值有效时才覆盖原始值
          const safeUpdates: TodoUpdateParams = {}
          if (updates.content !== undefined && updates.content !== null && updates.content !== '') {
            safeUpdates.content = updates.content
          }
          if (updates.description !== undefined) {
            safeUpdates.description = updates.description
          }
          if (updates.status !== undefined) {
            safeUpdates.status = updates.status
          }
          if (updates.priority !== undefined) {
            safeUpdates.priority = updates.priority
          }
          if (updates.tags !== undefined) {
            safeUpdates.tags = updates.tags
          }
          if (updates.relatedFiles !== undefined) {
            safeUpdates.relatedFiles = updates.relatedFiles
          }
          if (updates.dueDate !== undefined) {
            safeUpdates.dueDate = updates.dueDate
          }
          if (updates.estimatedHours !== undefined) {
            safeUpdates.estimatedHours = updates.estimatedHours
          }
          if (updates.spentHours !== undefined) {
            safeUpdates.spentHours = updates.spentHours
          }
          if (updates.reminderTime !== undefined) {
            safeUpdates.reminderTime = updates.reminderTime
          }
          if (updates.dependsOn !== undefined) {
            safeUpdates.dependsOn = updates.dependsOn
          }
          if (updates.sessionId !== undefined) {
            safeUpdates.sessionId = updates.sessionId
          }
          if (updates.gitContext !== undefined) {
            safeUpdates.gitContext = updates.gitContext
          }
          if (updates.subtasks !== undefined) {
            safeUpdates.subtasks = updates.subtasks
          }
          if (updates.lastProgress !== undefined) {
            safeUpdates.lastProgress = updates.lastProgress
          }
          if (updates.lastError !== undefined) {
            safeUpdates.lastError = updates.lastError
          }

          updated = {
            ...originalTodo,
            ...safeUpdates,
            updatedAt: new Date().toISOString(),
            ...(shouldAddCompletedAt && { completedAt: new Date().toISOString() }),
          }

          return {
            todos: [
              ...state.todos.slice(0, index),
              updated,
              ...state.todos.slice(index + 1),
            ],
          }
        })

        if (updated) {
          get().refreshStats()

          // 发送事件到 AI Runtime
          try {
            getEventBus().emit(
              createTodoUpdatedEvent(id, {
                status: updates.status,
                content: updates.content,
                priority: updates.priority,
              })
            )
          } catch (error) {
            console.error('[TodoStore] Failed to emit todo_updated event:', error)
          }
        }

        return updated
      },

      /**
       * 删除待办
       */
      deleteTodo: (id: string) => {
        let found = false

        set((state) => {
          const index = state.todos.findIndex((t) => t.id === id)
          if (index === -1) return state

          found = true

          return {
            todos: state.todos.filter((t) => t.id !== id),
            selectedTodoId: state.selectedTodoId === id ? null : state.selectedTodoId,
          }
        })

        if (found) {
          get().refreshStats()

          // 发送事件到 AI Runtime
          try {
            getEventBus().emit(createTodoDeletedEvent(id))
          } catch (error) {
            console.error('[TodoStore] Failed to emit todo_deleted event:', error)
          }
        }

        return found
      },

      // ========================================
      // Query Operations
      // ========================================

      /**
       * 获取所有待办
       */
      getAllTodos: () => {
        return get().todos
      },

      /**
       * 根据 ID 获取待办
       */
      getTodoById: (id: string) => {
        return get().todos.find((t) => t.id === id)
      },

      /**
       * 查询待办
       */
      queryTodos: (filter: TodoFilter) => {
        let result = [...get().todos]

        // 状态过滤
        if (filter.status && filter.status !== 'all') {
          result = result.filter((t) => t.status === filter.status)
        }

        // 优先级过滤
        if (filter.priority) {
          result = result.filter((t) => t.priority === filter.priority)
        }

        // 标签过滤
        if (filter.tags && filter.tags.length > 0) {
          result = result.filter((t) =>
            filter.tags!.some((tag) => t.tags?.includes(tag))
          )
        }

        // 关键词搜索
        if (filter.search) {
          const query = filter.search.toLowerCase()
          result = result.filter(
            (t) =>
              t.content.toLowerCase().includes(query) ||
              t.description?.toLowerCase().includes(query) ||
              t.tags?.some((tag) => tag.toLowerCase().includes(query))
          )
        }

        // 工作区过滤
        if (filter.workspaceId) {
          result = result.filter((t) => t.workspaceId === filter.workspaceId)
        }

        // 日期过滤
        if (filter.dateFilter && filter.dateFilter !== 'all') {
          const now = new Date()
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

          result = result.filter((t) => {
            if (!t.dueDate) return false

            const dueDate = new Date(t.dueDate)

            switch (filter.dateFilter) {
              case 'overdue':
                return dueDate < now
              case 'today':
                return dueDate >= todayStart && dueDate < new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
              case 'week':
                return dueDate >= weekStart && dueDate < new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
              case 'month':
                return dueDate >= monthStart && dueDate < new Date(monthStart.getTime() + 31 * 24 * 60 * 60 * 1000)
              default:
                return true
            }
          })
        }

        // 排序
        result = result.sort((a, b) => {
          // 1. 未完成在前
          if (a.status === 'completed' && b.status !== 'completed') return 1
          if (a.status !== 'completed' && b.status === 'completed') return -1

          // 2. in_progress 优先
          if (a.status === 'in_progress' && b.status !== 'in_progress') return -1
          if (a.status !== 'in_progress' && b.status === 'in_progress') return 1

          // 3. 逾期优先
          const now = new Date()
          const aOverdue = a.dueDate && new Date(a.dueDate) < now
          const bOverdue = b.dueDate && new Date(b.dueDate) < now
          if (aOverdue && !bOverdue) return -1
          if (!aOverdue && bOverdue) return 1

          // 4. 按优先级排序
          const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
          const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
          if (priorityDiff !== 0) return priorityDiff

          // 5. 按截止日期排序（越近越靠前）
          if (a.dueDate && b.dueDate) {
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
          }

          // 6. 按创建时间排序（新的在前）
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })

        // 分页
        if (filter.offset) {
          result = result.slice(filter.offset)
        }

        if (filter.limit) {
          result = result.slice(0, filter.limit)
        }

        return result
      },

      // ========================================
      // Batch Operations
      // ========================================

      /**
       * 批量更新状态
       */
      batchUpdateStatus: (ids: string[], status: TodoStatus) => {
        const now = new Date().toISOString()

        set((state) => ({
          todos: state.todos.map((t) => {
            if (!ids.includes(t.id)) return t

            // 防御性检查: 确保关键字段不会被意外清空
            const updated: TodoItem = {
              id: t.id,
              content: t.content || '<无内容>', // 确保 content 不为空
              description: t.description,
              status,
              priority: t.priority,
              tags: t.tags,
              relatedFiles: t.relatedFiles,
              sessionId: t.sessionId,
              workspaceId: t.workspaceId,
              subtasks: t.subtasks,
              dueDate: t.dueDate,
              reminderTime: t.reminderTime,
              estimatedHours: t.estimatedHours,
              spentHours: t.spentHours,
              dependsOn: t.dependsOn,
              blockers: t.blockers,
              gitContext: t.gitContext,
              milestoneId: t.milestoneId,
              complexity: t.complexity,
              attachments: t.attachments,
              createdAt: t.createdAt,
              updatedAt: now,
            }

            // 如果状态变为 completed，记录完成时间
            if (status === 'completed' && t.status !== 'completed') {
              updated.completedAt = now
            } else {
              updated.completedAt = t.completedAt
            }

            // 保留进度和错误信息
            updated.lastProgress = t.lastProgress
            updated.lastError = t.lastError

            return updated
          }),
        }))

        get().refreshStats()
      },

      /**
       * 批量删除
       */
      batchDelete: (ids: string[]) => {
        set((state) => ({
          todos: state.todos.filter((t) => !ids.includes(t.id)),
          selectedTodoId: ids.includes(state.selectedTodoId || '') ? null : state.selectedTodoId,
        }))

        get().refreshStats()
      },

      /**
       * 清空已完成
       */
      clearCompleted: () => {
        set((state) => ({
          todos: state.todos.filter((t) => t.status !== 'completed'),
        }))

        get().refreshStats()
      },

      // ========================================
      // Statistics & Helpers
      // ========================================

      /**
       * 刷新统计信息
       */
      refreshStats: () => {
        set({ stats: calculateStats(get().todos) })
      },

      /**
       * 修复损坏的待办数据
       * 检测并修复 content 为空或无效的待办
       */
      repairCorruptedTodos: () => {
        set((state) => {
          let repairedCount = 0
          const repairedTodos = state.todos.map((todo) => {
            // 检测 content 是否为空或无效
            if (!todo.content || todo.content.trim() === '') {
              repairedCount++
              console.warn(`[TodoStore] 检测到损坏的待办: ${todo.id}, content 为空`)
              return {
                ...todo,
                content: `<待办内容丢失 - ID: ${todo.id.slice(0, 8)}>`,
              }
            }
            return todo
          })

          if (repairedCount > 0) {
            console.log(`[TodoStore] 已修复 ${repairedCount} 个损坏的待办`)
          }

          return { todos: repairedTodos }
        })
        get().refreshStats()
      },

      /**
       * 关联待办到会话
       */
      linkToSession: (todoId: string, sessionId: string) => {
        get().updateTodo(todoId, { sessionId: sessionId })
      },

      /**
       * 获取会话相关的待办
       */
      getTodosBySession: (sessionId: string) => {
        return get().todos.filter((t) => t.sessionId === sessionId)
      },

      // ========================================
      // Import / Export
      // ========================================

      /**
       * 导出待办
       */
      exportTodos: () => {
        const state = get()
        return JSON.stringify(
          {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            todos: state.todos,
          },
          null,
          2
        )
      },

      /**
       * 导入待办
       */
      importTodos: (json: string) => {
        try {
          const data = JSON.parse(json)
          if (!data.todos || !Array.isArray(data.todos)) {
            throw new Error('Invalid format: missing todos array')
          }

          set((state) => ({
            todos: [
              ...state.todos,
              ...data.todos.map((todo: any) => ({
                ...todo,
                id: crypto.randomUUID(), // 重新生成 ID 避免冲突
                updatedAt: new Date().toISOString(),
              })),
            ],
          }))

          get().refreshStats()
        } catch (e) {
          set({ error: `导入失败: ${(e as Error).message}` })
        }
      },

      // ========================================
      // UI Operations
      // ========================================

      /**
       * 设置选中的待办
       */
      setSelectedTodo: (id: string | null) => {
        set({ selectedTodoId: id })
      },

      /**
       * 设置筛选器
       */
      setFilter: (filter: Partial<TodoFilter>) => {
        set((state) => ({
          filter: { ...state.filter, ...filter },
        }))
      },

      /**
       * 设置搜索关键词
       */
      setSearchQuery: (query: string) => {
        set((state) => ({
          filter: { ...state.filter, search: query },
        }))
      },

      // ========================================
      // Subtask Operations
      // ========================================

      /**
       * 添加子任务
       */
      addSubtask: (todoId: string, title: string) => {
        const todo = get().getTodoById(todoId)
        if (!todo) return

        const newSubtask = {
          id: crypto.randomUUID(),
          title,
          completed: false,
          createdAt: new Date().toISOString(),
        }

        get().updateTodo(todoId, {
          subtasks: [...(todo.subtasks || []), newSubtask],
        })
      },

      /**
       * 切换子任务完成状态
       */
      toggleSubtask: (todoId: string, subtaskId: string) => {
        const todo = get().getTodoById(todoId)
        if (!todo || !todo.subtasks) return

        const updatedSubtasks = todo.subtasks.map((st) =>
          st.id === subtaskId ? { ...st, completed: !st.completed } : st
        )

        get().updateTodo(todoId, { subtasks: updatedSubtasks })
      },

      /**
       * 删除子任务
       */
      deleteSubtask: (todoId: string, subtaskId: string) => {
        const todo = get().getTodoById(todoId)
        if (!todo || !todo.subtasks) return

        const updatedSubtasks = todo.subtasks.filter((st) => st.id !== subtaskId)

        get().updateTodo(todoId, { subtasks: updatedSubtasks })
      },

      /**
       * 更新子任务标题
       */
      updateSubtask: (todoId: string, subtaskId: string, title: string) => {
        const todo = get().getTodoById(todoId)
        if (!todo || !todo.subtasks) return

        const updatedSubtasks = todo.subtasks.map((st) =>
          st.id === subtaskId ? { ...st, title } : st
        )

        get().updateTodo(todoId, { subtasks: updatedSubtasks })
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({
        todos: state.todos,
        filter: state.filter,
      }),
    }
  )
)
