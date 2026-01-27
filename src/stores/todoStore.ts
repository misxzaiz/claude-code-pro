/**
 * 待办事项 Store
 *
 * 管理所有待办事项的状态、CRUD 操作和持久化
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  TodoItem,
  TodoStatus,
  TodoPriority,
  TodoStats,
  TodoFilter,
  TodoCreateParams,
  TodoUpdateParams,
  TodoStore,
  TodoState,
  TodoActions,
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
        const newTodo: TodoItem = {
          id: crypto.randomUUID(),
          content: params.content,
          status: 'pending',
          priority: params.priority || 'normal',
          tags: params.tags || [],
          relatedFiles: params.relatedFiles || [],
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          todos: [...state.todos, newTodo],
        }))

        get().refreshStats()

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
          status: 'pending',
          priority: params.priority || 'normal',
          tags: params.tags || [],
          relatedFiles: params.relatedFiles || [],
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

          updated = {
            ...state.todos[index],
            ...updates,
            updatedAt: new Date().toISOString(),
          }

          // 如果状态变为 completed，记录完成时间
          if (updates.status === 'completed' && state.todos[index].status !== 'completed') {
            updated.completedAt = new Date().toISOString()
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
              t.tags?.some((tag) => tag.toLowerCase().includes(query))
          )
        }

        // 排序
        result = result.sort((a, b) => {
          // 1. 未完成在前
          if (a.status === 'completed' && b.status !== 'completed') return 1
          if (a.status !== 'completed' && b.status === 'completed') return -1

          // 2. in_progress 优先
          if (a.status === 'in_progress' && b.status !== 'in_progress') return -1
          if (a.status !== 'in_progress' && b.status === 'in_progress') return 1

          // 3. 按优先级排序
          const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
          const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
          if (priorityDiff !== 0) return priorityDiff

          // 4. 按创建时间排序（新的在前）
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

            const updated: TodoItem = {
              ...t,
              status,
              updatedAt: now,
            }

            // 如果状态变为 completed，记录完成时间
            if (status === 'completed' && t.status !== 'completed') {
              updated.completedAt = now
            }

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
       * 关联待办到会话
       */
      linkToSession: (todoId: string, sessionId: string) => {
        get().updateTodo(todoId, { sessionId })
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
