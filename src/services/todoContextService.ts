/**
 * 待办上下文服务
 *
 * 智能选择相关待办注入 AI 上下文
 */

import type {
  TodoItem,
  TodoContext,
  TodoStats,
  TodoPriority,
} from '../types'

/**
 * 待办上下文选择器配置
 */
export interface TodoContextSelectorConfig {
  /** 最多注入多少个待办 */
  maxTodos?: number

  /** 是否只包含 in_progress 的待办 */
  onlyInProgress?: boolean

  /** 是否包含最近完成的待办（用于上下文连续性） */
  includeRecentCompleted?: number

  /** 是否包含相关文件的待办 */
  includeRelatedFiles?: boolean

  /** 优先级过滤（低于此优先级的不包含） */
  minPriority?: TodoPriority

  /** 工作区 ID（筛选特定工作区的待办） */
  workspaceId?: string
}

/**
 * 待办相关性分数结果
 */
interface ScoredTodo {
  todo: TodoItem
  score: number
}

/**
 * 从用户消息中提取关键词
 */
function extractKeywords(message: string): string[] {
  // 简单的关键词提取
  const words = message
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ') // 保留中英文
    .split(/\s+/)
    .filter((w) => w.length > 2) // 过滤短词

  // 去重
  return Array.from(new Set(words))
}

/**
 * 计算待办与消息的相关性分数
 */
function calculateRelevance(
  todo: TodoItem,
  _message: string,
  keywords: string[]
): number {
  let score = 0

  // 防御性检查：确保 content 存在
  if (!todo.content) {
    return score
  }

  const todoLower = todo.content.toLowerCase()

  // 1. 关键词匹配（每个匹配关键词 +10 分）
  for (const keyword of keywords) {
    if (todoLower.includes(keyword)) {
      score += 10
    }
  }

  // 2. 优先级加分
  const priorityScore: Record<TodoPriority, number> = {
    urgent: 50,
    high: 30,
    normal: 10,
    low: 0,
  }
  score += priorityScore[todo.priority]

  // 3. 状态加分（in_progress 优先）
  if (todo.status === 'in_progress') {
    score += 40
  } else if (todo.status === 'pending') {
    score += 20
  }

  // 4. 时间衰减（创建时间越近分数越高，最多减 20 分）
  const ageInHours = (Date.now() - new Date(todo.createdAt).getTime()) / (1000 * 60 * 60)
  score -= Math.min(ageInHours * 0.5, 20)

  return score
}

/**
 * 智能选择待办上下文
 */
export function selectTodoContext(
  allTodos: TodoItem[],
  message: string,
  config: TodoContextSelectorConfig = {}
): TodoContext {
  const {
    maxTodos = 5,
    onlyInProgress = false,
    includeRecentCompleted = 0,
    minPriority = 'low',
    workspaceId,
  } = config

  // 1. 过滤基本条件
  let candidates = allTodos.filter((todo) => {
    // 优先级过滤
    const priorityOrder: Record<TodoPriority, number> = {
      urgent: 0,
      high: 1,
      normal: 2,
      low: 3,
    }
    if (priorityOrder[todo.priority] > priorityOrder[minPriority]) {
      return false
    }

    // 状态过滤
    if (onlyInProgress && todo.status !== 'in_progress') {
      return false
    }

    // 工作区过滤
    if (workspaceId && todo.sessionId !== workspaceId) {
      // TODO: 当 TodoItem 添加 workspaceId 字段后使用
      // if (todo.workspaceId !== workspaceId) return false
    }

    return true
  })

  // 2. 计算相关性分数
  const keywords = extractKeywords(message)
  const scored: ScoredTodo[] = candidates.map((todo) => ({
    todo,
    score: calculateRelevance(todo, message, keywords),
  }))

  // 3. 按分数排序
  scored.sort((a, b) => b.score - a.score)

  // 4. 选择 top N
  const activeTodos = scored.slice(0, maxTodos).map((s) => s.todo)

  // 5. 包含最近完成的待办（可选）
  let recentCompleted: TodoItem[] = []
  if (includeRecentCompleted > 0) {
    recentCompleted = allTodos
      .filter((t) => t.status === 'completed')
      .sort(
        (a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime()
      )
      .slice(0, includeRecentCompleted)
  }

  // 6. 统计信息
  const stats: TodoStats = {
    total: allTodos.length,
    pending: allTodos.filter((t) => t.status === 'pending').length,
    inProgress: allTodos.filter((t) => t.status === 'in_progress').length,
    completed: allTodos.filter((t) => t.status === 'completed').length,
    cancelled: allTodos.filter((t) => t.status === 'cancelled').length,
    urgent: allTodos.filter((t) => t.priority === 'urgent' && t.status !== 'completed').length,
  }

  return {
    activeTodos,
    recentCompleted,
    totalStats: stats,
  }
}

/**
 * 将待办上下文格式化为 AI 可读的文本
 */
export function formatTodoContextForAI(context: TodoContext): string {
  if (context.activeTodos.length === 0 && context.recentCompleted.length === 0) {
    return '// 当前没有活动待办事项'
  }

  const lines: string[] = []

  // 统计摘要
  lines.push(`## 待办事项总览`)
  lines.push(`- 待处理: ${context.totalStats.pending}`)
  lines.push(`- 进行中: ${context.totalStats.inProgress}`)
  lines.push(`- 已完成: ${context.totalStats.completed}`)
  if (context.totalStats.urgent > 0) {
    lines.push(`- 🔴 紧急: ${context.totalStats.urgent}`)
  }
  lines.push('')

  // 当前活动待办
  if (context.activeTodos.length > 0) {
    lines.push(`## 当前活动待办`)
    context.activeTodos.forEach((todo, index) => {
      const statusIcon: Record<string, string> = {
        pending: '[ ]',
        in_progress: '[→]',
        completed: '[✓]',
        cancelled: '[✗]',
      }

      const priorityIcon: Record<string, string> = {
        urgent: '🔴',
        high: '🟠',
        normal: '🟢',
        low: '⚪',
      }

      lines.push(`${index + 1}. ${statusIcon[todo.status]} ${priorityIcon[todo.priority]} ${todo.content}`)

      if (todo.tags && todo.tags.length > 0) {
        lines.push(`   标签: ${todo.tags.join(', ')}`)
      }

      if (todo.relatedFiles && todo.relatedFiles.length > 0) {
        lines.push(`   相关文件: ${todo.relatedFiles.join(', ')}`)
      }

      if (todo.status === 'in_progress' && todo.lastProgress) {
        lines.push(`   当前进度: ${todo.lastProgress}`)
      }
    })
    lines.push('')
  }

  // 最近完成的待办（上下文连续性）
  if (context.recentCompleted.length > 0) {
    lines.push(`## 最近完成的待办`)
    context.recentCompleted.forEach((todo) => {
      const completedTime = todo.completedAt
        ? new Date(todo.completedAt).toLocaleDateString()
        : new Date(todo.createdAt).toLocaleDateString()
      lines.push(`- ✓ ${todo.content} (${completedTime})`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 构建待办详细上下文（用于 AI 处理特定待办时）
 */
export function buildTodoDetailContext(todo: TodoItem): string | null {
  if (!todo) return null

  // 防御性检查：确保 content 存在
  if (!todo.content) {
    return null
  }

  const lines: string[] = []

  lines.push(`## 待办详情`)
  lines.push(`**内容**: ${todo.content}`)
  lines.push(`**状态**: ${todo.status}`)
  lines.push(`**优先级**: ${todo.priority}`)
  lines.push(`**创建时间**: ${new Date(todo.createdAt).toLocaleString()}`)

  if (todo.description) {
    lines.push('')
    lines.push(`### 描述`)
    lines.push(todo.description)
  }

  if (todo.relatedFiles && todo.relatedFiles.length > 0) {
    lines.push('')
    lines.push(`### 相关文件`)
    todo.relatedFiles.forEach((file) => {
      lines.push(`- \`${file}\``)
    })
  }

  if (todo.tags && todo.tags.length > 0) {
    lines.push('')
    lines.push(`### 标签`)
    todo.tags.forEach((tag) => {
      lines.push(`- ${tag}`)
    })
  }

  if (todo.subtasks && todo.subtasks.length > 0) {
    lines.push('')
    lines.push(`### 子任务`)
    todo.subtasks.forEach((subtask, index) => {
      const checkbox = subtask.completed ? '[x]' : '[ ]'
      lines.push(`${index + 1}. ${checkbox} ${subtask.title}`)
    })
  }

  return lines.join('\n')
}

/**
 * 从消息中提取相关待办（简单版本，用于快速匹配）
 */
export function extractRelevantTodos(
  allTodos: TodoItem[],
  message: string,
  maxCount = 3
): TodoItem[] {
  const keywords = extractKeywords(message)
  const scored: ScoredTodo[] = allTodos
    .filter((t) => t.status !== 'completed') // 只考虑未完成的
    .map((todo) => ({
      todo,
      score: calculateRelevance(todo, message, keywords),
    }))

  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, maxCount).map((s) => s.todo)
}
