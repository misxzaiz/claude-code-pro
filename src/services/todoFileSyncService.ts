/**
 * 待办文件同步服务
 *
 * 负责将待办数据自动同步到工作区文件系统
 */

import { invoke } from '@tauri-apps/api/core'
import type { TodoItem } from '@/types'

const POLARIS_DIR = '.polaris'
const TODO_FILE = 'todos.json'
const MARKDOWN_FILE = 'TODOS.md'

/**
 * 检查是否在 Tauri 环境中
 */
function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

/**
 * 简单的路径拼接函数（跨平台兼容）
 */
function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/')
}

/**
 * 待办文件数据格式
 */
interface TodoFileData {
  version: string
  workspaceId: string
  workspaceName: string
  exportedAt: string
  polarisVersion: string
  todos: TodoItem[]
}

/**
 * 待办文件同步服务
 */
export class TodoFileSyncService {
  /**
   * 获取待办文件路径
   */
  static getTodoFilePath(workspacePath: string): string {
    return joinPath(workspacePath, POLARIS_DIR, TODO_FILE)
  }

  /**
   * 获取 Markdown 文件路径
   */
  static getMarkdownFilePath(workspacePath: string): string {
    return joinPath(workspacePath, POLARIS_DIR, MARKDOWN_FILE)
  }

  /**
   * 确保 .polaris 目录存在
   */
  static async ensurePolarisDir(workspacePath: string): Promise<void> {
    const polarisDir = `${workspacePath}/${POLARIS_DIR}`

    try {
      // 使用已有的 write_file_absolute 命令创建目录
      // 该命令会在父目录不存在时自动创建
      await invoke('write_file_absolute', {
        path: `${polarisDir}/.gitkeep`,
        content: '',
      })
    } catch (error) {
      console.warn('[TodoFileSyncService] 创建 .polaris 目录失败:', error)
    }
  }

  /**
   * 从 Store 中筛选当前工作区的待办
   */
  static filterWorkspaceTodos(todos: TodoItem[], workspaceId: string): TodoItem[] {
    return todos.filter((t) => t.workspaceId === workspaceId)
  }

  /**
   * 写入工作区待办文件
   */
  static async writeWorkspaceTodos(
    workspacePath: string,
    workspaceId: string,
    workspaceName: string,
    todos: TodoItem[]
  ): Promise<void> {
    try {
      // 检查环境
      if (!isTauriEnvironment()) {
        console.warn('[TodoFileSync] 非 Tauri 环境，跳过文件写入')
        console.warn('[TodoFileSync] 待办数据会保存到 localStorage（Zustand persist）')
        return
      }

      // 确保 .polaris 目录存在
      await this.ensurePolarisDir(workspacePath)

      // 准备文件数据（保留所有字段，不再使用 sanitizeTodo）
      const data: TodoFileData = {
        version: '1.0.0',
        workspaceId,
        workspaceName,
        exportedAt: new Date().toISOString(),
        polarisVersion: '0.1.0',
        todos: todos,  // 直接保存完整数据
      }

      // 写入 JSON 文件
      const filePath = this.getTodoFilePath(workspacePath)
      await invoke('write_file_absolute', {
        path: filePath,
        content: JSON.stringify(data, null, 2),
      })

      console.log(`[TodoFileSync] 已写入 ${todos.length} 个待办到 ${filePath}`)

      // 同时生成 Markdown 文件
      await this.writeMarkdownFile(workspacePath, todos)
    } catch (error) {
      console.error('[TodoFileSync] 写入待办文件失败:', error)
      throw error  // 重新抛出，让调用者知道失败了
    }
  }

  /**
   * 读取工作区待办文件
   */
  static async readWorkspaceTodos(
    workspacePath: string
  ): Promise<TodoItem[] | null> {
    try {
      // 检查环境
      if (!isTauriEnvironment()) {
        console.warn('[TodoFileSync] 非 Tauri 环境，无法读取文件')
        return null
      }

      const filePath = this.getTodoFilePath(workspacePath)
      const content = await invoke('read_file_absolute', { path: filePath })
      const data: TodoFileData = JSON.parse(content as string)

      // 验证文件格式
      if (!data.todos || !Array.isArray(data.todos)) {
        console.warn('[TodoFileSync] 文件格式无效:', data)
        return null
      }

      return data.todos
    } catch (error) {
      // 文件不存在或损坏，返回 null
      if ((error as any).code?.includes('NOT_FOUND')) {
        // 正常情况：第一次使用，文件不存在
        return null
      }
      console.warn('[TodoFileSync] 读取待办文件失败:', error)
      return null
    }
  }

  /**
   * 读取工作区待办文件（包含元数据）
   */
  static async readWorkspaceTodosWithMeta(
    workspacePath: string
  ): Promise<{ todos: TodoItem[]; exportedAt: string } | null> {
    try {
      // 检查环境
      if (!isTauriEnvironment()) {
        console.warn('[TodoFileSync] 非 Tauri 环境，无法读取文件')
        return null
      }

      const filePath = this.getTodoFilePath(workspacePath)
      const content = await invoke('read_file_absolute', { path: filePath })
      const data: TodoFileData = JSON.parse(content as string)

      // 验证文件格式
      if (!data.todos || !Array.isArray(data.todos)) {
        console.warn('[TodoFileSync] 文件格式无效:', data)
        return null
      }

      return {
        todos: data.todos,
        exportedAt: data.exportedAt,
      }
    } catch (error) {
      // 文件不存在或损坏，返回 null
      if ((error as any).code?.includes('NOT_FOUND')) {
        // 正常情况：第一次使用，文件不存在
        return null
      }
      console.warn('[TodoFileSync] 读取待办文件失败:', error)
      return null
    }
  }

  /**
   * 合并文件待办到 Store
   * 使用 mergeTodos 方法，不触发事件，保留所有字段和原始 ID
   */
  static async mergeIntoStore(fileTodos: TodoItem[], workspaceId: string): Promise<void> {
    // 动态导入避免循环依赖
    const { useTodoStore } = await import('@/stores')
    const store = useTodoStore.getState()

    // 使用 mergeTodos 方法，保留所有字段和原始 ID
    // skipEvents: true 避免触发 EventBus，防止 AI 响应文件同步事件
    store.mergeTodos(fileTodos, { skipEvents: true })

    console.log(`[TodoFileSync] 已合并 ${fileTodos.length} 个待办到工作区 ${workspaceId}`)
  }

  /**
   * 生成 Markdown 文件
   */
  static async writeMarkdownFile(
    workspacePath: string,
    todos: TodoItem[]
  ): Promise<void> {
    try {
      const markdown = this.generateMarkdown(todos, workspacePath)
      const filePath = this.getMarkdownFilePath(workspacePath)

      await invoke('write_file_absolute', {
        path: filePath,
        content: markdown,
      })

      console.log(`[TodoFileSync] 已生成 Markdown: ${filePath}`)
    } catch (error) {
      console.error('[TodoFileSync] 生成 Markdown 失败:', error)
    }
  }

  /**
   * 生成 Markdown 内容
   */
  static generateMarkdown(todos: TodoItem[], workspacePath: string): string {
    const workspaceName = workspacePath.split(/[/\\]/).pop() || workspacePath
    const stats = {
      total: todos.length,
      pending: todos.filter((t) => t.status === 'pending').length,
      inProgress: todos.filter((t) => t.status === 'in_progress').length,
      completed: todos.filter((t) => t.status === 'completed').length,
    }

    const lines: string[] = []

    // 标题
    lines.push(`# ${workspaceName} - 待办事项`)
    lines.push('')
    lines.push(`> 最后更新：${new Date().toLocaleString('zh-CN')}`)
    lines.push(`> 待办总数：${stats.total} | 待处理：${stats.pending} | 进行中：${stats.inProgress} | 已完成：${stats.completed}`)
    lines.push('')
    lines.push('---')
    lines.push('')

    // 待处理和进行中
    const activeTodos = todos.filter((t) => t.status !== 'completed')

    if (activeTodos.length > 0) {
      lines.push('## 📋 待处理和进行中')
      lines.push('')

      activeTodos.forEach((todo) => {
        lines.push(this.generateTodoMarkdown(todo))
        lines.push('')
        lines.push('---')
        lines.push('')
      })
    }

    // 已完成
    const completedTodos = todos.filter((t) => t.status === 'completed')
    if (completedTodos.length > 0) {
      lines.push('## ✅ 已完成')
      lines.push('')

      completedTodos.forEach((todo) => {
        lines.push(`### [x] ${todo.content}`)
        if (todo.completedAt) {
          lines.push(`> 完成时间：${new Date(todo.completedAt).toLocaleDateString('zh-CN')}`)
        }
        lines.push('')
      })
    }

    // 统计表格
    lines.push('')
    lines.push('## 📊 统计')
    lines.push('')
    lines.push('| 状态 | 数量 |')
    lines.push('|------|------|')
    lines.push(`| 待处理 | ${stats.pending} |`)
    lines.push(`| 进行中 | ${stats.inProgress} |`)
    lines.push(`| 已完成 | ${stats.completed} |`)
    lines.push(`| **总计** | **${stats.total}** |`)

    return lines.join('\n')
  }

  /**
   * 生成单个待办的 Markdown
   */
  static generateTodoMarkdown(todo: TodoItem): string {
    const priorityEmoji = {
      urgent: '🔴',
      high: '🟠',
      normal: '🟢',
      low: '⚪',
    }[todo.priority] || '⚪'

    const lines: string[] = []

    // 标题行
    const statusIcon = todo.status === 'completed' ? '[x]' : '[ ]'
    lines.push(`### ${statusIcon} ${todo.content} \`${priorityEmoji}\``)

    // 元数据
    if (todo.tags && todo.tags.length > 0) {
      lines.push(`**标签**：${todo.tags.map((t) => `#${t}`).join(' ')}`)
    }

    if (todo.dueDate) {
      const isOverdue = new Date(todo.dueDate) < new Date()
      const dueDateStr = new Date(todo.dueDate).toLocaleDateString('zh-CN')
      lines.push(`**截止日期**：${dueDateStr}${isOverdue ? ' ⚠️ 已逾期' : ''}`)
    }

    if (todo.estimatedHours) {
      lines.push(`**预估工时**：${todo.estimatedHours}h`)
    }

    lines.push('')

    // 描述
    if (todo.description) {
      lines.push(`**描述**：${todo.description}`)
      lines.push('')
    }

    // 相关文件
    if (todo.relatedFiles && todo.relatedFiles.length > 0) {
      lines.push('**相关文件**：')
      todo.relatedFiles.forEach((file) => {
        lines.push(`- \`${file}\``)
      })
      lines.push('')
    }

    // Git 上下文
    if (todo.gitContext?.branch) {
      lines.push('**Git 上下文**：')
      lines.push(`- 分支：\`${todo.gitContext.branch}\``)
      if (todo.gitContext.baseCommit) {
        lines.push(`- 提交：\`${todo.gitContext.baseCommit}\``)
      }
      lines.push('')
    }

    // 子任务
    if (todo.subtasks && todo.subtasks.length > 0) {
      lines.push('#### 子任务')
      lines.push('')
      todo.subtasks.forEach((st) => {
        const icon = st.completed ? '[x]' : '[ ]'
        lines.push(`- ${icon} ${st.title}`)
      })
      lines.push('')
    }

    return lines.join('\n')
  }
}

// 导出单例
export const todoFileSyncService = TodoFileSyncService
