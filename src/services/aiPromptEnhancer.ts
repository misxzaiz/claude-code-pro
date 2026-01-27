/**
 * AI 系统提示词增强器
 *
 * 为 AI 对话生成增强的上下文提示词，包含待办信息和工具说明
 */

import { globalToolRegistry } from '@/ai-runtime'
import { useTodoStore } from '@/stores'
import type { TodoContext } from '@/types'
import { selectTodoContext, formatTodoContextForAI } from './todoContextService'

/**
 * 检测用户消息是否与待办相关
 */
export function isTodoRelatedMessage(message: string): boolean {
  const TODO_KEYWORDS = [
    'todo',
    '待办',
    '任务',
    'task',
    '完成',
    '进度',
    '进行中',
    '优先级',
    '截止',
    'deadline',
    '工时',
    '子任务',
    'subtask',
  ]

  const lowerMessage = message.toLowerCase()
  return TODO_KEYWORDS.some((keyword) => lowerMessage.includes(keyword))
}

/**
 * 检测是否需要完整待办上下文
 */
export function shouldInjectFullTodoContext(message: string): boolean {
  // 如果明确提到待办管理关键词，注入完整上下文
  const FULL_CONTEXT_KEYWORDS = [
    '待办列表',
    '所有待办',
    'todo list',
    '全部任务',
    '查看待办',
    'show todos',
  ]

  const lowerMessage = message.toLowerCase()
  return FULL_CONTEXT_KEYWORDS.some((keyword) => lowerMessage.includes(keyword))
}

/**
 * 生成增强的 AI 系统提示词
 *
 * @param userMessage 用户消息
 * @param sessionId 会话 ID（可选，用于筛选相关待办）
 * @returns 增强后的系统提示词
 */
export function generateEnhancedSystemPrompt(
  userMessage: string,
  sessionId?: string
): string {
  const sections: string[] = []

  // 1. 工具说明（始终包含）
  const toolPrompt = globalToolRegistry.generateSystemPrompt()
  if (toolPrompt) {
    sections.push(toolPrompt)
  }

  // 2. 待办上下文（根据消息决定是否注入）
  const shouldInjectTodos = isTodoRelatedMessage(userMessage)
  const shouldInjectFull = shouldInjectFullTodoContext(userMessage)

  if (shouldInjectTodos) {
    const todoStore = useTodoStore.getState()
    const allTodos = todoStore.getAllTodos()

    if (allTodos.length > 0) {
      // 选择相关待办
      const todoContext: TodoContext = selectTodoContext(allTodos, userMessage, {
        maxTodos: shouldInjectFull ? 20 : 5,
        onlyInProgress: !shouldInjectFull,
        includeRecentCompleted: shouldInjectFull ? 5 : 2,
        minPriority: 'low',
        workspaceId: sessionId,
      })

      const todoText = formatTodoContextForAI(todoContext)
      if (todoText) {
        sections.push('## Todo Context')
        sections.push(todoText)
        sections.push('')
      }
    } else {
      sections.push('## Todo Context')
      sections.push('// 当前没有待办事项')
      sections.push('')
    }
  }

  // 3. 使用指南
  sections.push('## Interaction Guidelines')
  sections.push('')
  sections.push('- Proactively suggest creating todos when user mentions tasks')
  sections.push('- Use TodoCreate tool when user wants to track a task')
  sections.push('- Use TodoUpdate tool to change todo status or priority')
  sections.push('- Use TodoQuery tool to show user their todo list')
  sections.push('- Always confirm before creating high-priority or urgent todos')
  sections.push('- When user completes a task, suggest updating the todo status')
  sections.push('')

  return sections.join('\n')
}

/**
 * 生成待办详细上下文（用于特定待办操作）
 */
export function generateTodoDetailPrompt(todoId: string): string | null {
  const todoStore = useTodoStore.getState()
  const todo = todoStore.getTodoById(todoId)

  if (!todo) return null

  const sections: string[] = []

  sections.push(`## Todo Detail: ${todo.content}`)
  sections.push('')

  // 基本信息
  sections.push(`**Status**: ${todo.status}`)
  sections.push(`**Priority**: ${todo.priority}`)

  if (todo.description) {
    sections.push(`**Description**: ${todo.description}`)
  }

  if (todo.tags && todo.tags.length > 0) {
    sections.push(`**Tags**: ${todo.tags.join(', ')}`)
  }

  if (todo.dueDate) {
    const dueDate = new Date(todo.dueDate)
    const isOverdue = dueDate < new Date()
    sections.push(`**Due Date**: ${dueDate.toLocaleDateString()} ${isOverdue ? '(OVERDUE!)' : ''}`)
  }

  if (todo.estimatedHours) {
    sections.push(`**Estimated Hours**: ${todo.estimatedHours}`)
    if (todo.spentHours) {
      sections.push(`**Spent Hours**: ${todo.spentHours}`)
    }
  }

  if (todo.relatedFiles && todo.relatedFiles.length > 0) {
    sections.push(`**Related Files**:`)
    todo.relatedFiles.forEach((file) => {
      sections.push(`  - ${file}`)
    })
  }

  // 子任务
  if (todo.subtasks && todo.subtasks.length > 0) {
    sections.push('')
    sections.push(`**Subtasks** (${todo.subtasks.filter((s) => s.completed).length}/${todo.subtasks.length}):`)
    todo.subtasks.forEach((subtask, index) => {
      const status = subtask.completed ? '[✓]' : '[ ]'
      sections.push(`  ${index + 1}. ${status} ${subtask.title}`)
    })
  }

  sections.push('')

  return sections.join('\n')
}

/**
 * 生成快捷操作建议
 */
export function generateTodoActionSuggestions(todoId: string): string[] {
  const todoStore = useTodoStore.getState()
  const todo = todoStore.getTodoById(todoId)

  if (!todo) return []

  const suggestions: string[] = []

  // 根据状态建议操作
  switch (todo.status) {
    case 'pending':
      suggestions.push('Start this todo (mark as in_progress)')
      suggestions.push('Edit priority or due date')
      suggestions.push('Add subtasks')
      break
    case 'in_progress':
      suggestions.push('Mark as completed')
      suggestions.push('Update progress')
      suggestions.push('Add time spent')
      break
    case 'completed':
      suggestions.push('Reopen if needed')
      suggestions.push('Create follow-up todo')
      break
  }

  // 根据优先级建议
  if (todo.priority === 'urgent') {
    suggestions.push('⚠️ This is urgent - focus on it now!')
  }

  // 逾期提醒
  if (todo.dueDate && new Date(todo.dueDate) < new Date()) {
    suggestions.push('⚠️ This todo is overdue!')
  }

  return suggestions
}
