/**
 * Todo 事件同步服务
 *
 * 处理 Todo Store 与 AI Runtime 之间的双向事件同步
 */

import { getEventBus } from '@/ai-runtime'
import { useTodoStore } from '@/stores'
import type { AIEvent } from '@/ai-runtime'

/**
 * 初始化 Todo 与 AI 的事件同步
 *
 * 监听 AI Runtime 的 todo 事件，并同步到 Todo Store
 * 同时提供清理函数用于取消监听
 *
 * @returns 清理函数，调用后取消所有监听
 */
export function initTodoEventSync(): () => void {
  console.log('[TodoEventSync] Initializing Todo-AI event synchronization...')

  const todoStore = useTodoStore.getState()
  const unsubscribers: Array<() => void> = []

  // ========================================
  // 防止事件循环的机制
  // ========================================
  // 使用 Set 来跟踪正在处理的待办 ID,避免循环触发
  const processingTodoIds = new Set<string>()
  const isProcessing = (todoId: string): boolean => {
    if (processingTodoIds.has(todoId)) {
      console.warn(`[TodoEventSync] 检测到事件循环: todoId=${todoId}, 已阻止`)
      return true
    }
    return false
  }
  const markProcessing = (todoId: string) => processingTodoIds.add(todoId)
  const unmarkProcessing = (todoId: string) => processingTodoIds.delete(todoId)

  // ========================================
  // 监听 todo_created 事件（AI 创建了待办）
  // ========================================
  const createdUnsub = getEventBus().on('todo_created', (event: AIEvent) => {
    if (event.type !== 'todo_created') return

    // 多层防护：避免事件循环
    // 1. 检查 source 字段
    if (event.source === 'user') {
      console.log('[TodoEventSync] Ignoring user-created todo (avoiding loop)')
      return
    }

    // 2. 检查是否正在处理此待办
    if (event.todoId && isProcessing(event.todoId)) {
      return
    }

    // 3. 验证必需字段
    if (!event.content || event.content.trim() === '') {
      console.warn('[TodoEventSync] Invalid todo_created event: empty content')
      return
    }

    console.log('[TodoEventSync] AI created todo:', event.content)

    // 标记为正在处理
    if (event.todoId) {
      markProcessing(event.todoId)
    }

    try {
      // AI 创建的待办，同步到 store
      todoStore.createTodo({
        content: event.content,
        priority: event.priority as any,
      })
    } catch (error) {
      console.error('[TodoEventSync] Failed to create todo from event:', error)
    } finally {
      // 清除处理标记
      if (event.todoId) {
        unmarkProcessing(event.todoId)
      }
    }
  })

  unsubscribers.push(createdUnsub)

  // ========================================
  // 监听 todo_updated 事件（AI 更新了待办）
  // ========================================
  const updatedUnsub = getEventBus().on('todo_updated', (event: AIEvent) => {
    if (event.type !== 'todo_updated') return

    // 防止事件循环
    if (event.todoId && isProcessing(event.todoId)) {
      return
    }

    // 验证必需字段
    if (!event.todoId) {
      console.warn('[TodoEventSync] Invalid todo_updated event: missing todoId')
      return
    }

    if (!event.changes || typeof event.changes !== 'object') {
      console.warn('[TodoEventSync] Invalid todo_updated event: invalid changes')
      return
    }

    console.log('[TodoEventSync] AI updated todo:', event.todoId, event.changes)

    // 标记为正在处理
    markProcessing(event.todoId)

    try {
      // AI 更新的待办，同步到 store
      todoStore.updateTodo(event.todoId, event.changes as any)
    } catch (error) {
      console.error('[TodoEventSync] Failed to update todo from event:', error)
    } finally {
      // 清除处理标记
      unmarkProcessing(event.todoId)
    }
  })

  unsubscribers.push(updatedUnsub)

  // ========================================
  // 监听 todo_deleted 事件（AI 删除了待办）
  // ========================================
  const deletedUnsub = getEventBus().on('todo_deleted', (event: AIEvent) => {
    if (event.type !== 'todo_deleted') return

    // 防止事件循环
    if (event.todoId && isProcessing(event.todoId)) {
      return
    }

    // 验证必需字段
    if (!event.todoId) {
      console.warn('[TodoEventSync] Invalid todo_deleted event: missing todoId')
      return
    }

    console.log('[TodoEventSync] AI deleted todo:', event.todoId)

    // 标记为正在处理
    markProcessing(event.todoId)

    try {
      // AI 删除的待办，同步到 store
      todoStore.deleteTodo(event.todoId)
    } catch (error) {
      console.error('[TodoEventSync] Failed to delete todo from event:', error)
    } finally {
      // 清除处理标记
      unmarkProcessing(event.todoId)
    }
  })

  unsubscribers.push(deletedUnsub)

  // ========================================
  // 监听待办执行进度事件（可选）
  // ========================================
  const progressUnsub = getEventBus().on('todo_execution_progress', (event: AIEvent) => {
    if (event.type !== 'todo_execution_progress') return

    console.log('[TodoEventSync] Todo execution progress:', event.todoId, event.message)

    // 更新待办的进度信息
    const todo = todoStore.getTodoById(event.todoId)
    if (todo) {
      todoStore.updateTodo(event.todoId, {
        lastProgress: event.message,
      })
    }
  })

  unsubscribers.push(progressUnsub)

  // ========================================
  // 监听待办执行完成事件
  // ========================================
  const completedUnsub = getEventBus().on('todo_execution_completed', (event: AIEvent) => {
    if (event.type !== 'todo_execution_completed') return

    console.log('[TodoEventSync] Todo execution completed:', event.todoId, event.status)

    // 根据执行结果更新待办状态
    if (event.status === 'success') {
      todoStore.updateTodo(event.todoId, { status: 'completed' })
    } else if (event.status === 'failed') {
      todoStore.updateTodo(event.todoId, {
        lastError: event.error,
        status: 'pending', // 失败后重置为待处理
      })
    } else if (event.status === 'aborted') {
      todoStore.updateTodo(event.todoId, { status: 'cancelled' })
    }
  })

  unsubscribers.push(completedUnsub)

  console.log(`[TodoEventSync] Initialized with ${unsubscribers.length} event listeners`)

  // 返回清理函数
  return () => {
    console.log('[TodoEventSync] Cleaning up event listeners...')
    unsubscribers.forEach((unsub, index) => {
      try {
        unsub()
        console.log(`[TodoEventSync] Cleaned up listener ${index + 1}/${unsubscribers.length}`)
      } catch (error) {
        console.error(`[TodoEventSync] Error cleaning up listener ${index + 1}:`, error)
      }
    })
    console.log('[TodoEventSync] Cleanup completed')
  }
}

/**
 * 手动触发待办创建事件（用于测试或特殊情况）
 */
export async function emitTodoCreated(params: {
  todoId: string
  content: string
  priority: string
  source?: 'user' | 'ai'
}): Promise<void> {
  try {
    const { createTodoCreatedEvent } = await import('@/ai-runtime')
    getEventBus().emit(
      createTodoCreatedEvent(params.todoId, params.content, params.priority, params.source || 'user')
    )
  } catch (error) {
    console.error('[TodoEventSync] Failed to emit todo_created event:', error)
  }
}

/**
 * 手动触发待办更新事件
 */
export async function emitTodoUpdated(params: {
  todoId: string
  changes: {
    status?: string
    content?: string
    priority?: string
  }
}): Promise<void> {
  try {
    const { createTodoUpdatedEvent } = await import('@/ai-runtime')
    getEventBus().emit(createTodoUpdatedEvent(params.todoId, params.changes))
  } catch (error) {
    console.error('[TodoEventSync] Failed to emit todo_updated event:', error)
  }
}

/**
 * 手动触发待办删除事件
 */
export async function emitTodoDeleted(params: { todoId: string }): Promise<void> {
  try {
    const { createTodoDeletedEvent } = await import('@/ai-runtime')
    getEventBus().emit(createTodoDeletedEvent(params.todoId))
  } catch (error) {
    console.error('[TodoEventSync] Failed to emit todo_deleted event:', error)
  }
}
