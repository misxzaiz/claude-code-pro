/**
 * AI 待办工具集
 *
 * 提供 AI 调用待办功能的工具接口
 * 包括：创建、列表、更新、删除待办
 */

import { simpleTodoService } from '@/services/simpleTodoService'
import type { TodoPriority, TodoStatus } from '@/types'
import type { AITool, AIToolInput, AIToolResult } from '../types/tool-types'

/**
 * 获取当前工作区路径并刷新待办数据
 * 如果没有工作区则返回错误
 */
async function ensureWorkspace(): Promise<string> {
  const { useWorkspaceStore } = await import('@/stores')
  const currentWorkspace = useWorkspaceStore.getState().getCurrentWorkspace()

  if (!currentWorkspace) {
    throw new Error('请先创建或选择一个工作区')
  }

  // 确保 simpleTodoService 使用正确的工作区
  // setWorkspace 会自动重新加载待办数据
  await simpleTodoService.setWorkspace(currentWorkspace.path)

  return currentWorkspace.path
}

/**
 * 创建待办工具
 */
export const createTodoTool: AITool = {
  name: 'create_todo',
  description: '创建一个新的待办事项。支持设置优先级、标签、截止日期等。',
  inputSchema: {
    properties: {
      content: {
        type: 'string',
        description: '待办内容（必填）',
      },
      description: {
        type: 'string',
        description: '详细描述（可选）',
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
        description: '优先级：low（低）、normal（普通）、high（高）、urgent（紧急）',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '标签列表，如 ["frontend", "bug", "feature"]',
      },
      dueDate: {
        type: 'string',
        description: '截止日期（ISO 8601 格式），如 "2024-12-31" 或 "2024-12-31T23:59:59"',
      },
      estimatedHours: {
        type: 'number',
        description: '预估工时（小时）',
      },
      subtasks: {
        type: 'array',
        items: { type: 'object' },
        description: '子任务列表，格式：[{ "title": "子任务1" }, { "title": "子任务2" }]',
      },
    },
    required: ['content'],
  },
  execute: async (input: AIToolInput): Promise<AIToolResult> => {
    try {
      await ensureWorkspace()

      // 类型检查
      const content = input.content as string
      if (typeof content !== 'string' || !content.trim()) {
        return { success: false, error: '待办内容不能为空' }
      }

      // 创建待办
      const todo = await simpleTodoService.createTodo({
        content: content.trim(),
        description: input.description as string | undefined,
        priority: input.priority as TodoPriority | undefined,
        tags: input.tags as string[] | undefined,
        dueDate: input.dueDate as string | undefined,
        estimatedHours: input.estimatedHours as number | undefined,
        subtasks: input.subtasks as Array<{ title: string }> | undefined,
      })

      console.log('[createTodoTool] 创建待办成功:', todo.id, todo.content)

      return {
        success: true,
        data: {
          id: todo.id,
          content: todo.content,
          status: todo.status,
          priority: todo.priority,
          tags: todo.tags,
        },
      }
    } catch (error) {
      console.error('[createTodoTool] 创建失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

/**
 * 列出待办工具
 */
export const listTodosTool: AITool = {
  name: 'list_todos',
  description: '列出当前工作区的待办事项，支持按状态筛选。',
  inputSchema: {
    properties: {
      status: {
        type: 'string',
        enum: ['all', 'pending', 'in_progress', 'completed'],
        description: '筛选状态：all（全部）、pending（待处理）、in_progress（进行中）、completed（已完成）',
      },
    },
  },
  execute: async (input: AIToolInput): Promise<AIToolResult> => {
    try {
      await ensureWorkspace()

      const status = (input.status as 'all' | 'pending' | 'in_progress' | 'completed') || 'all'
      const todos = simpleTodoService.getTodosByStatus(status)

      console.log(`[listTodosTool] 查询待办: status=${status}, count=${todos.length}`)

      return {
        success: true,
        data: todos.map((t) => ({
          id: t.id,
          content: t.content,
          status: t.status,
          priority: t.priority,
          tags: t.tags,
          description: t.description,
          dueDate: t.dueDate,
          estimatedHours: t.estimatedHours,
          subtaskCount: t.subtasks?.length || 0,
          completedSubtasks: t.subtasks?.filter((st) => st.completed).length || 0,
        })),
      }
    } catch (error) {
      console.error('[listTodosTool] 查询失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

/**
 * 更新待办工具
 */
export const updateTodoTool: AITool = {
  name: 'update_todo',
  description: '更新已存在的待办事项。可以通过内容、ID 或索引来指定待办。',
  inputSchema: {
    properties: {
      id: {
        type: 'string',
        description: '待办 ID（推荐使用）',
      },
      content: {
        type: 'string',
        description: '待办内容（用于查找待办，如果没有提供 id）',
      },
      newContent: {
        type: 'string',
        description: '新的待办内容',
      },
      newDescription: {
        type: 'string',
        description: '新的详细描述',
      },
      newStatus: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed', 'cancelled'],
        description: '新状态：pending（待处理）、in_progress（进行中）、completed（已完成）、cancelled（已取消）',
      },
      newPriority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
        description: '新优先级',
      },
      newTags: {
        type: 'array',
        items: { type: 'string' },
        description: '新标签列表',
      },
    },
  },
  execute: async (input: AIToolInput): Promise<AIToolResult> => {
    try {
      await ensureWorkspace()

      // 查找待办 ID
      let todoId = input.id as string | undefined

      if (!todoId) {
        // 如果没有提供 id，尝试通过内容查找
        const content = input.content as string
        if (!content) {
          return { success: false, error: '请提供待办 ID 或内容' }
        }

        const todos = simpleTodoService.getAllTodos()
        const matched = todos.find((t) => t.content === content)

        if (!matched) {
          return { success: false, error: `未找到内容为 "${content}" 的待办` }
        }

        todoId = matched.id
      }

      // 构建更新参数
      const updates: Record<string, unknown> = {}

      if (input.newContent) updates.content = input.newContent
      if (input.newDescription !== undefined) updates.description = input.newDescription
      if (input.newStatus) updates.status = input.newStatus
      if (input.newPriority) updates.priority = input.newPriority
      if (input.newTags) updates.tags = input.newTags

      if (Object.keys(updates).length === 0) {
        return { success: false, error: '没有提供任何更新内容' }
      }

      // 执行更新
      await simpleTodoService.updateTodo(todoId, updates)

      console.log('[updateTodoTool] 更新待办成功:', todoId, updates)

      return {
        success: true,
        data: {
          id: todoId,
          updates,
        },
      }
    } catch (error) {
      console.error('[updateTodoTool] 更新失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

/**
 * 删除待办工具
 */
export const deleteTodoTool: AITool = {
  name: 'delete_todo',
  description: '删除指定的待办事项。此操作不可撤销，请谨慎使用。',
  inputSchema: {
    properties: {
      id: {
        type: 'string',
        description: '待办 ID（推荐使用）',
      },
      content: {
        type: 'string',
        description: '待办内容（用于查找待办，如果没有提供 id）',
      },
    },
  },
  execute: async (input: AIToolInput): Promise<AIToolResult> => {
    try {
      await ensureWorkspace()

      // 查找待办 ID
      let todoId = input.id as string | undefined

      if (!todoId) {
        // 如果没有提供 id，尝试通过内容查找
        const content = input.content as string
        if (!content) {
          return { success: false, error: '请提供待办 ID 或内容' }
        }

        const todos = simpleTodoService.getAllTodos()
        const matched = todos.find((t) => t.content === content)

        if (!matched) {
          return { success: false, error: `未找到内容为 "${content}" 的待办` }
        }

        todoId = matched.id
      }

      // 执行删除
      await simpleTodoService.deleteTodo(todoId)

      console.log('[deleteTodoTool] 删除待办成功:', todoId)

      return {
        success: true,
        data: {
          id: todoId,
          message: '待办已删除',
        },
      }
    } catch (error) {
      console.error('[deleteTodoTool] 删除失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

/**
 * 切换待办状态工具
 */
export const toggleTodoStatusTool: AITool = {
  name: 'toggle_todo_status',
  description: '切换待办的状态。可以在 pending、in_progress、completed 之间切换。',
  inputSchema: {
    properties: {
      id: {
        type: 'string',
        description: '待办 ID',
      },
      content: {
        type: 'string',
        description: '待办内容（用于查找待办，如果没有提供 id）',
      },
      newStatus: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed'],
        description: '新状态',
      },
    },
    required: ['newStatus'],
  },
  execute: async (input: AIToolInput): Promise<AIToolResult> => {
    try {
      await ensureWorkspace()

      // 查找待办 ID
      let todoId = input.id as string | undefined

      if (!todoId) {
        const content = input.content as string
        if (!content) {
          return { success: false, error: '请提供待办 ID 或内容' }
        }

        const todos = simpleTodoService.getAllTodos()
        const matched = todos.find((t) => t.content === content)

        if (!matched) {
          return { success: false, error: `未找到内容为 "${content}" 的待办` }
        }

        todoId = matched.id
      }

      const newStatus = input.newStatus as TodoStatus
      await simpleTodoService.updateTodo(todoId, { status: newStatus })

      console.log('[toggleTodoStatusTool] 切换状态成功:', todoId, newStatus)

      return {
        success: true,
        data: {
          id: todoId,
          status: newStatus,
        },
      }
    } catch (error) {
      console.error('[toggleTodoStatusTool] 切换状态失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

/**
 * 完成待办工具
 */
export const completeTodoTool: AITool = {
  name: 'complete_todo',
  description: '将指定的待办标记为已完成。这是一个快捷操作，等同于将状态设置为 completed。',
  inputSchema: {
    properties: {
      id: {
        type: 'string',
        description: '待办 ID（推荐使用）',
      },
      content: {
        type: 'string',
        description: '待办内容（用于查找待办，如果没有提供 id）',
      },
    },
  },
  execute: async (input: AIToolInput): Promise<AIToolResult> => {
    try {
      await ensureWorkspace()

      // 查找待办 ID
      let todoId = input.id as string | undefined

      if (!todoId) {
        const content = input.content as string
        if (!content) {
          return { success: false, error: '请提供待办 ID 或内容' }
        }

        const todos = simpleTodoService.getAllTodos()
        const matched = todos.find((t) => t.content === content)

        if (!matched) {
          return { success: false, error: `未找到内容为 "${content}" 的待办` }
        }

        todoId = matched.id
      }

      // 标记为完成
      await simpleTodoService.updateTodo(todoId, { status: 'completed' })

      console.log('[completeTodoTool] 完成待办成功:', todoId)

      return {
        success: true,
        data: {
          id: todoId,
          status: 'completed',
          message: '待办已标记为完成 ✅',
        },
      }
    } catch (error) {
      console.error('[completeTodoTool] 完成待办失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

/**
 * 开始待办工具
 */
export const startTodoTool: AITool = {
  name: 'start_todo',
  description: '将指定的待办标记为进行中。这是一个快捷操作，等同于将状态设置为 in_progress。',
  inputSchema: {
    properties: {
      id: {
        type: 'string',
        description: '待办 ID（推荐使用）',
      },
      content: {
        type: 'string',
        description: '待办内容（用于查找待办，如果没有提供 id）',
      },
    },
  },
  execute: async (input: AIToolInput): Promise<AIToolResult> => {
    try {
      await ensureWorkspace()

      // 查找待办 ID
      let todoId = input.id as string | undefined

      if (!todoId) {
        const content = input.content as string
        if (!content) {
          return { success: false, error: '请提供待办 ID 或内容' }
        }

        const todos = simpleTodoService.getAllTodos()
        const matched = todos.find((t) => t.content === content)

        if (!matched) {
          return { success: false, error: `未找到内容为 "${content}" 的待办` }
        }

        todoId = matched.id
      }

      // 标记为进行中
      await simpleTodoService.updateTodo(todoId, { status: 'in_progress' })

      console.log('[startTodoTool] 开始待办成功:', todoId)

      return {
        success: true,
        data: {
          id: todoId,
          status: 'in_progress',
          message: '待办已开始 🔄',
        },
      }
    } catch (error) {
      console.error('[startTodoTool] 开始待办失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

/**
 * 导出所有待办工具
 */
export const todoTools = [
  createTodoTool,
  listTodosTool,
  updateTodoTool,
  deleteTodoTool,
  toggleTodoStatusTool,
  completeTodoTool,  // 新增：完成待办
  startTodoTool,     // 新增：开始待办
] as const
