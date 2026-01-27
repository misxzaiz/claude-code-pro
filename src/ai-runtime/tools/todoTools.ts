/**
 * 待办工具定义
 *
 * 为 AI 提供创建、更新、查询待办的能力
 *
 * 这些工具会被注册到 AI Runtime 中，让 Claude Code 可以调用它们
 */

import type { TodoCreateParams, TodoPriority, TodoStatus } from '@/types'

// 临时定义 AITool 类型（等待 AI Runtime 实现工具系统）
export interface AIToolInput extends Record<string, unknown> {}
export interface AIToolResult {
  success: boolean
  data?: unknown
  error?: string
  requiresConfirmation?: boolean
}

// AITool 类型定义（作为对象字面量的类型）
export type AITool = {
  name: string
  description: string
  inputSchema?: {
    type: 'object'
    properties?: Record<string, {
      type: string
      description?: string
      enum?: string[]
      default?: any
      items?: { type: string; enum?: string[]; properties?: any; required?: string[] }
    }>
    required?: string[]
  }
  execute(input: AIToolInput): Promise<AIToolResult>
}

/**
 * TodoCreate 工具 - 创建单个待办
 */
export const TodoCreateTool: AITool = {
  name: 'TodoCreate',
  description: '创建一个新的待办事项。当用户提到需要完成的任务、bug 或功能时使用。',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '待办事项的详细描述',
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
        description: '优先级',
        default: 'normal',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '标签（如 frontend, bug, feature, backend）',
      },
      relatedFiles: {
        type: 'array',
        items: { type: 'string' },
        description: '相关的文件路径',
      },
    },
    required: ['content'],
  },

  async execute(input: AIToolInput): Promise<AIToolResult> {
    try {
      // 动态导入 TodoStore 避免循环依赖
      const { useTodoStore } = await import('@/stores')
      const todoStore = useTodoStore.getState()

      const params: TodoCreateParams = {
        content: input.content as string,
        priority: (input.priority as TodoPriority) || 'normal',
        tags: input.tags as string[] || [],
        relatedFiles: input.relatedFiles as string[] || [],
      }

      const newTodo = await todoStore.createTodo(params)

      return {
        success: true,
        data: {
          todoId: newTodo.id,
          content: newTodo.content,
          priority: newTodo.priority,
          status: newTodo.status,
          message: `✓ 已创建待办：${newTodo.content}`,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: `创建待办失败：${(error as Error).message}`,
      }
    }
  },
}

/**
 * TodoBatchCreate 工具 - 批量创建待办
 */
export const TodoBatchCreateTool: AITool = {
  name: 'TodoBatchCreate',
  description:
    '批量创建多个待办事项。当用户提到需要完成多个相关任务时使用。建议先询问用户确认。',
  inputSchema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            priority: {
              type: 'string',
              enum: ['low', 'normal', 'high', 'urgent'],
            },
            tags: { type: 'array', items: { type: 'string' } },
          },
          required: ['content'],
        },
      },
      requireConfirmation: {
        type: 'boolean',
        description: '是否需要用户确认（默认 true）',
        default: true,
      },
    },
    required: ['todos'],
  },

  async execute(input: AIToolInput): Promise<AIToolResult> {
    try {
      const todos = input.todos as Array<{
        content: string
        priority?: string
        tags?: string[]
      }>

      const requireConfirmation = input.requireConfirmation !== false

      // 如果需要确认，返回预览数据
      if (requireConfirmation) {
        return {
          success: true,
          requiresConfirmation: true,
          data: {
            preview: todos.map((t, i) => ({
              index: i + 1,
              content: t.content,
              priority: t.priority || 'normal',
            })),
            message: `即将创建 ${todos.length} 个待办，请确认`,
          },
        }
      }

      // 直接创建
      const { useTodoStore } = await import('@/stores')
      const todoStore = useTodoStore.getState()

      const paramsList: TodoCreateParams[] = todos.map((t) => ({
        content: t.content,
        priority: (t.priority as TodoPriority) || 'normal',
        tags: t.tags || [],
      }))

      const newTodos = await todoStore.batchCreateTodos(paramsList)

      return {
        success: true,
        data: {
          todoIds: newTodos.map((t) => t.id),
          count: newTodos.length,
          message: `✓ 已创建 ${newTodos.length} 个待办`,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: `批量创建待办失败：${(error as Error).message}`,
      }
    }
  },
}

/**
 * TodoUpdate 工具 - 更新待办状态
 */
export const TodoUpdateTool: AITool = {
  name: 'TodoUpdate',
  description: '更新待办事项的状态或内容',
  inputSchema: {
    type: 'object',
    properties: {
      todoId: {
        type: 'string',
        description: '待办 ID（如果不知道 ID，可以用 TodoQuery 查询）',
      },
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed', 'cancelled'],
        description: '新状态',
      },
      content: {
        type: 'string',
        description: '新内容',
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
        description: '新优先级',
      },
    },
    required: ['todoId'],
  },

  async execute(input: AIToolInput): Promise<AIToolResult> {
    try {
      const { useTodoStore } = await import('@/stores')
      const todoStore = useTodoStore.getState()

      const updated = todoStore.updateTodo(input.todoId as string, {
        status: input.status as TodoStatus,
        content: input.content as string,
        priority: input.priority as TodoPriority,
      })

      if (!updated) {
        return {
          success: false,
          error: '待办不存在或更新失败',
        }
      }

      return {
        success: true,
        data: {
          todoId: updated.id,
          content: updated.content,
          status: updated.status,
          priority: updated.priority,
          message: `✓ 已更新待办：${updated.content}`,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: `更新待办失败：${(error as Error).message}`,
      }
    }
  },
}

/**
 * TodoQuery 工具 - 查询待办
 */
export const TodoQueryTool: AITool = {
  name: 'TodoQuery',
  description: '查询待办事项列表。可以帮助用户了解当前的待办情况。',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed', 'cancelled', 'all'],
        description: '按状态筛选',
        default: 'all',
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
        description: '按优先级筛选',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '按标签筛选',
      },
      search: {
        type: 'string',
        description: '关键词搜索',
      },
      limit: {
        type: 'number',
        description: '返回数量限制',
        default: 10,
      },
    },
  },

  async execute(input: AIToolInput): Promise<AIToolResult> {
    try {
      const { useTodoStore } = await import('@/stores')
      const todoStore = useTodoStore.getState()

      const todos = todoStore.queryTodos({
        status: input.status as TodoStatus | 'all',
        priority: input.priority as TodoPriority,
        tags: input.tags as string[],
        search: input.search as string,
        limit: input.limit as number,
      })

      return {
        success: true,
        data: {
          todos: todos.map((t) => ({
            id: t.id,
            content: t.content,
            status: t.status,
            priority: t.priority,
            tags: t.tags,
          })),
          count: todos.length,
          message: `找到 ${todos.length} 个待办`,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: `查询待办失败：${(error as Error).message}`,
      }
    }
  },
}

/**
 * 导出所有待办工具
 */
export const todoTools = [TodoCreateTool, TodoBatchCreateTool, TodoUpdateTool, TodoQueryTool]

/**
 * 工具注册表（用于集成到 AI Runtime）
 */
export const TODO_TOOL_REGISTRY: Record<string, AITool> = {
  TodoCreate: TodoCreateTool,
  TodoBatchCreate: TodoBatchCreateTool,
  TodoUpdate: TodoUpdateTool,
  TodoQuery: TodoQueryTool,
}
