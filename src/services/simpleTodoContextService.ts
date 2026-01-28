/**
 * 简化的待办上下文服务
 *
 * 为 AI 聊天提供待办相关的上下文信息
 * 使用 SimpleTodoService 作为数据源
 */

import { simpleTodoService } from './simpleTodoService'
import type { TodoItem, TodoContext, TodoStats } from '@/types'

/**
 * 从用户消息中提取关键词
 */
function extractKeywords(message: string): string[] {
  // 简单的关键词提取：中文分词和英文单词
  const keywords: string[] = []

  // 提取中文词组（2-4个字的连续汉字）
  const chineseMatches = message.match(/[\u4e00-\u9fa5]{2,4}/g)
  if (chineseMatches) {
    keywords.push(...chineseMatches)
  }

  // 提取英文单词
  const englishMatches = message.match(/[a-zA-Z]{3,}/g)
  if (englishMatches) {
    keywords.push(...englishMatches.map((w) => w.toLowerCase()))
  }

  // 常见技术关键词
  const techKeywords = ['bug', 'feature', 'fix', 'refactor', 'test', 'docs', 'frontend', 'backend']
  for (const kw of techKeywords) {
    if (message.toLowerCase().includes(kw) && !keywords.includes(kw)) {
      keywords.push(kw)
    }
  }

  return [...new Set(keywords)] // 去重
}

/**
 * 计算待办相关度分数
 */
function calculateRelevanceScore(todo: TodoItem, keywords: string[]): number {
  let score = 0

  for (const keyword of keywords) {
    // 内容匹配
    if (todo.content.includes(keyword)) {
      score += 10
    }

    // 描述匹配
    if (todo.description?.includes(keyword)) {
      score += 5
    }

    // 标签匹配
    if (todo.tags?.includes(keyword)) {
      score += 15
    }
  }

  // 进行中的待办优先级更高
  if (todo.status === 'in_progress') {
    score += 5
  }

  // 高优先级的待办优先级更高
  const priorityWeight = { urgent: 4, high: 3, normal: 2, low: 1 }
  score += priorityWeight[todo.priority] || 0

  return score
}

/**
 * 选择与用户消息相关的待办事项
 *
 * @param message 用户消息
 * @param options 选项
 * @returns 相关的待办列表
 */
export async function selectTodoContext(
  message: string,
  options: {
    maxTodos?: number
    onlyInProgress?: boolean
    includeRecentCompleted?: number
    minPriority?: 'low' | 'normal' | 'high' | 'urgent'
  } = {}
): Promise<TodoItem[]> {
  const {
    maxTodos = 5,
    onlyInProgress = false,
    includeRecentCompleted = 2,
    minPriority = 'normal',
  } = options

  try {
    // 确保使用当前工作区的最新数据
    const { useWorkspaceStore } = await import('@/stores')
    const currentWorkspace = useWorkspaceStore.getState().getCurrentWorkspace()

    if (currentWorkspace) {
      await simpleTodoService.setWorkspace(currentWorkspace.path)
    }

    const allTodos = simpleTodoService.getAllTodos()

    if (allTodos.length === 0) {
      return []
    }

    // 提取关键词
    const keywords = extractKeywords(message)

    // 如果没有关键词，返回优先级最高的待办
    if (keywords.length === 0) {
      let filtered = allTodos

      if (onlyInProgress) {
        filtered = filtered.filter((t) => t.status === 'in_progress')
      }

      // 按优先级排序
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
      filtered.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

      return filtered.slice(0, maxTodos)
    }

    // 计算相关度并排序
    const withScore = allTodos.map((todo) => ({
      todo,
      score: calculateRelevanceScore(todo, keywords),
    }))

    // 过滤并排序
    let filtered = withScore
      .filter((item) => {
        // 过滤低优先级的待办
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
        return priorityOrder[item.todo.priority] <= priorityOrder[minPriority]
      })
      .filter((item) => {
        // 如果只需要进行中的待办
        if (onlyInProgress) {
          return item.todo.status === 'in_progress'
        }
        // 只排除已取消的待办
        return item.todo.status !== 'cancelled'
      })
      .sort((a, b) => b.score - a.score)

    // 取前 maxTodos 个
    let selected = filtered.slice(0, maxTodos).map((item) => item.todo)

    // 可选：添加最近完成的待办
    if (includeRecentCompleted > 0) {
      const recentCompleted = allTodos
        .filter((t) => t.status === 'completed')
        .sort((a, b) => {
          const timeA = new Date(a.completedAt || a.updatedAt).getTime()
          const timeB = new Date(b.completedAt || b.updatedAt).getTime()
          return timeB - timeA // 最新的在前
        })
        .slice(0, includeRecentCompleted)

      // 合并并去重
      const selectedIds = new Set(selected.map((t) => t.id))
      for (const todo of recentCompleted) {
        if (!selectedIds.has(todo.id) && selected.length < maxTodos + includeRecentCompleted) {
          selected.push(todo)
        }
      }
    }

    return selected
  } catch (error) {
    console.error('[selectTodoContext] 选择待办上下文失败:', error)
    return []
  }
}

/**
 * 将待办上下文格式化为 AI 可读的文本
 *
 * @param todos 待办列表
 * @returns 格式化的文本
 */
export function formatTodoContextForAI(todos: TodoItem[]): string {
  if (todos.length === 0) {
    return ''
  }

  const sections: string[] = []

  sections.push('## 当前待办事项')
  sections.push('')

  // 按状态分组
  const byStatus: Record<string, TodoItem[]> = {
    in_progress: [],
    pending: [],
    completed: [],
  }

  for (const todo of todos) {
    const status = todo.status === 'in_progress' || todo.status === 'pending' || todo.status === 'completed'
      ? todo.status
      : 'pending'
    byStatus[status].push(todo)
  }

  // 进行中的待办
  if (byStatus.in_progress.length > 0) {
    sections.push('### 🔄 进行中')
    for (const todo of byStatus.in_progress) {
      sections.push(formatTodoItem(todo, byStatus.in_progress.indexOf(todo) + 1))
    }
    sections.push('')
  }

  // 待处理的待办
  if (byStatus.pending.length > 0) {
    sections.push('### 📋 待处理')
    for (const todo of byStatus.pending) {
      sections.push(formatTodoItem(todo, byStatus.pending.indexOf(todo) + 1))
    }
    sections.push('')
  }

  // 已完成的待办
  if (byStatus.completed.length > 0) {
    sections.push('### ✅ 最近完成')
    for (const todo of byStatus.completed) {
      sections.push(formatTodoItem(todo, byStatus.completed.indexOf(todo) + 1))
    }
    sections.push('')
  }

  return sections.join('\n')
}

/**
 * 格式化单个待办项
 */
function formatTodoItem(todo: TodoItem, index: number): string {
  const parts: string[] = []

  // 序号和内容
  parts.push(`${index}. **${todo.content}**`)

  // 状态标识
  const statusEmoji = {
    pending: '⏳',
    in_progress: '🔄',
    completed: '✅',
    cancelled: '❌',
  }
  parts.push(`${statusEmoji[todo.status] || '⏳'} [${todo.status}]`)

  // 优先级标识
  const priorityEmoji = {
    low: '🔵',
    normal: '⚪',
    high: '🟠',
    urgent: '🔴',
  }
  parts.push(`${priorityEmoji[todo.priority] || '⚪'} 优先级: ${todo.priority}`)

  // 标签
  if (todo.tags && todo.tags.length > 0) {
    parts.push(`标签: ${todo.tags.map((t) => `#${t}`).join(' ')}`)
  }

  // 子任务进度
  if (todo.subtasks && todo.subtasks.length > 0) {
    const completed = todo.subtasks.filter((st) => st.completed).length
    parts.push(`子任务: ${completed}/${todo.subtasks.length}`)
  }

  // 截止日期
  if (todo.dueDate) {
    parts.push(`截止: ${todo.dueDate}`)
  }

  // 描述
  if (todo.description) {
    parts.push(`> ${todo.description}`)
  }

  return parts.join('  \n')
}

/**
 * 生成待办统计信息
 */
export function generateTodoStats(): TodoStats | null {
  try {
    const allTodos = simpleTodoService.getAllTodos()

    const stats: TodoStats = {
      total: allTodos.length,
      pending: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
      urgent: 0,
    }

    for (const todo of allTodos) {
      switch (todo.status) {
        case 'pending':
          stats.pending++
          break
        case 'in_progress':
          stats.inProgress++
          break
        case 'completed':
          stats.completed++
          break
        case 'cancelled':
          stats.cancelled++
          break
      }

      if (todo.priority === 'urgent') {
        stats.urgent++
      }
    }

    return stats
  } catch (error) {
    console.error('[generateTodoStats] 生成统计失败:', error)
    return null
  }
}

/**
 * 生成完整的待办上下文
 */
export async function generateTodoContext(_message?: string): Promise<TodoContext | null> {
  try {
    // 确保使用当前工作区的最新数据
    const { useWorkspaceStore } = await import('@/stores')
    const currentWorkspace = useWorkspaceStore.getState().getCurrentWorkspace()

    if (currentWorkspace) {
      await simpleTodoService.setWorkspace(currentWorkspace.path)
    }

    const allTodos = simpleTodoService.getAllTodos()

    if (allTodos.length === 0) {
      return null
    }

    // 计算统计信息
    const totalStats = generateTodoStats()

    // 分类待办
    const activeTodos = allTodos.filter((t) => t.status === 'in_progress' || t.status === 'pending')
    const recentCompleted = allTodos
      .filter((t) => t.status === 'completed')
      .sort((a, b) => {
        const timeA = new Date(a.completedAt || a.updatedAt).getTime()
        const timeB = new Date(b.completedAt || b.updatedAt).getTime()
        return timeB - timeA
      })
      .slice(0, 5)

    return {
      activeTodos,
      recentCompleted,
      totalStats: totalStats || {
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
        urgent: 0,
      },
    }
  } catch (error) {
    console.error('[generateTodoContext] 生成待办上下文失败:', error)
    return null
  }
}
