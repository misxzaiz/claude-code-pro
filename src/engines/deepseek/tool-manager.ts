/**
 * DeepSeek Tool Call Manager
 *
 * 工具调用管理器，负责：
 * - 将 DeepSeek 的工具调用桥接到 Tauri 后端
 * - 处理工具执行结果
 * - 管理工具执行错误
 *
 * @author Polaris Team
 * @since 2025-01-24
 */

import { invoke } from '@tauri-apps/api/core'
import type { DeepSeekSessionConfig } from './session'

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean
  /** 返回数据 */
  data?: any
  /** 错误信息 */
  error?: string
}

/**
 * 工具调用管理器
 *
 * 将 DeepSeek 的工具调用转发到 Tauri 后端执行
 */
export class ToolCallManager {
  /** 会话 ID */
  private readonly sessionId: string

  /** 会话配置 */
  private readonly config: Pick<DeepSeekSessionConfig, 'workspaceDir'>

  /**
   * 构造函数
   *
   * @param sessionId - 会话 ID
   * @param config - 会话配置
   */
  constructor(sessionId: string, config: Pick<DeepSeekSessionConfig, 'workspaceDir'>) {
    this.sessionId = sessionId
    this.config = config
  }

  /**
   * 执行工具调用
   *
   * @param toolName - 工具名称
   * @param args - 工具参数
   * @returns 工具执行结果
   */
  async executeTool(toolName: string, args: Record<string, any>): Promise<ToolResult> {
    console.log(`[ToolCallManager] Executing: ${toolName}`, args)

    try {
      switch (toolName) {
        // ===== 文件操作 =====
        case 'read_file':
          return await this.readFile(args.path)

        case 'write_file':
          return await this.writeFile(args.path, args.content)

        case 'edit_file':
          return await this.editFile(args.path, args.old_str, args.new_str)

        case 'list_files':
          return await this.listFiles(args.path, args.recursive)

        // ===== Bash =====
        case 'bash':
          return await this.executeBash(args.command)

        // ===== Git =====
        case 'git_status':
          return await this.gitStatus()

        case 'git_diff':
          return await this.gitDiff(args.path, args.cached)

        case 'git_log':
          return await this.gitLog(args.max_count)

        // ===== Todo =====
        case 'todo_add':
          return await this.todoAdd(args.content, args.priority)

        case 'todo_list':
          return await this.todoList(args.status)

        case 'todo_complete':
          return await this.todoComplete(args.id)

        case 'todo_delete':
          return await this.todoDelete(args.id)

        // ===== 搜索 =====
        case 'search_files':
          return await this.searchFiles(args.pattern, args.path)

        case 'search_code':
          return await this.searchCode(args.query, args.path, args.file_pattern)

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`,
          }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[ToolCallManager] Tool ${toolName} failed:`, errorMsg)
      return {
        success: false,
        error: errorMsg,
      }
    }
  }

  // ==================== 文件操作实现 ====================

  /**
   * 读取文件
   */
  private async readFile(path: string): Promise<ToolResult> {
    try {
      const content = await invoke<string>('read_file', { path })
      return {
        success: true,
        data: content,
      }
    } catch (error) {
      return {
        success: false,
        error: this.formatError('读取文件失败', error),
      }
    }
  }

  /**
   * 写入文件
   */
  private async writeFile(path: string, content: string): Promise<ToolResult> {
    try {
      await invoke('write_file', { path, content })
      return {
        success: true,
        data: `Successfully wrote to ${path}`,
      }
    } catch (error) {
      return {
        success: false,
        error: this.formatError('写入文件失败', error),
      }
    }
  }

  /**
   * 编辑文件
   */
  private async editFile(path: string, oldStr: string, newStr: string): Promise<ToolResult> {
    try {
      await invoke('edit_file', { path, old_str: oldStr, new_str: newStr })
      return {
        success: true,
        data: `Successfully edited ${path}`,
      }
    } catch (error) {
      return {
        success: false,
        error: this.formatError('编辑文件失败', error),
      }
    }
  }

  /**
   * 列出文件
   */
  private async listFiles(path?: string, recursive?: boolean): Promise<ToolResult> {
    try {
      // 如果没有指定路径，使用工作区根目录
      const targetPath = path || this.config.workspaceDir || '.'

      // 读取目录结构
      const files = await invoke<string[]>('list_directory', {
        path: targetPath,
        recursive: recursive || false,
      })

      return {
        success: true,
        data: files,
      }
    } catch (error) {
      return {
        success: false,
        error: this.formatError('列出文件失败', error),
      }
    }
  }

  // ==================== Bash 实现 ====================

  /**
   * 执行 Bash 命令
   */
  private async executeBash(command: string): Promise<ToolResult> {
    try {
      const result = await invoke<{
        stdout: string
        stderr: string
        exit_code: number | null
      }>('execute_bash', {
        command,
        sessionId: this.sessionId,
      })

      // 检查退出码
      if (result.exit_code !== 0 && result.exit_code !== null) {
        return {
          success: false,
          error: `Command failed with exit code ${result.exit_code}`,
          data: {
            stdout: result.stdout,
            stderr: result.stderr,
          },
        }
      }

      return {
        success: true,
        data: {
          stdout: result.stdout,
          stderr: result.stderr,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: this.formatError('执行命令失败', error),
      }
    }
  }

  // ==================== Git 实现 ====================

  /**
   * Git 状态
   */
  private async gitStatus(): Promise<ToolResult> {
    try {
      const result = await this.executeBash('git status --porcelain')

      if (!result.success) {
        return result
      }

      // 解析 git status 输出
      const stdout = result.data?.stdout || ''
      const lines = stdout.trim().split('\n').filter((line: string) => line.trim())

      const files = lines.map((line: string) => {
        const status = line.slice(0, 2).trim()
        const path = line.slice(3)
        return { status, path }
      })

      return {
        success: true,
        data: {
          files,
          summary: {
            modified: files.filter((f: { status: string }) => f.status.includes('M')).length,
            added: files.filter((f: { status: string }) => f.status.includes('A')).length,
            deleted: files.filter((f: { status: string }) => f.status.includes('D')).length,
            untracked: files.filter((f: { status: string }) => f.status.includes('?')).length,
          },
        },
      }
    } catch (error) {
      return {
        success: false,
        error: this.formatError('获取 Git 状态失败', error),
      }
    }
  }

  /**
   * Git Diff
   */
  private async gitDiff(path?: string, cached?: boolean): Promise<ToolResult> {
    try {
      let command = 'git diff'

      if (cached) {
        command += ' --cached'
      }

      if (path) {
        command += ` ${path}`
      }

      return await this.executeBash(command)
    } catch (error) {
      return {
        success: false,
        error: this.formatError('获取 Git diff 失败', error),
      }
    }
  }

  /**
   * Git Log
   */
  private async gitLog(maxCount?: number): Promise<ToolResult> {
    try {
      const count = maxCount || 10
      const command = `git log -n ${count} --pretty=format:"%H|%an|%ad|%s" --date=iso`

      return await this.executeBash(command)
    } catch (error) {
      return {
        success: false,
        error: this.formatError('获取 Git log 失败', error),
      }
    }
  }

  // ==================== Todo 实现 ====================

  /**
   * 添加待办事项
   */
  private async todoAdd(content: string, priority?: string): Promise<ToolResult> {
    try {
      // 使用现有的 todo store (通过 Tauri 事件或直接调用)
      await invoke('plugin:todo|add', {
        content,
        priority: priority || 'normal',
      })

      return {
        success: true,
        data: `Added todo: ${content}`,
      }
    } catch (error) {
      return {
        success: false,
        error: this.formatError('添加待办失败', error),
      }
    }
  }

  /**
   * 列出待办事项
   */
  private async todoList(status?: string): Promise<ToolResult> {
    try {
      const todos = await invoke('plugin:todo|list', {
        status: status || 'all',
      })

      return {
        success: true,
        data: todos,
      }
    } catch (error) {
      return {
        success: false,
        error: this.formatError('获取待办列表失败', error),
      }
    }
  }

  /**
   * 完成待办事项
   */
  private async todoComplete(id: string): Promise<ToolResult> {
    try {
      await invoke('plugin:todo|complete', { id })

      return {
        success: true,
        data: `Marked todo ${id} as complete`,
      }
    } catch (error) {
      return {
        success: false,
        error: this.formatError('完成待办失败', error),
      }
    }
  }

  /**
   * 删除待办事项
   */
  private async todoDelete(id: string): Promise<ToolResult> {
    try {
      await invoke('plugin:todo|delete', { id })

      return {
        success: true,
        data: `Deleted todo ${id}`,
      }
    } catch (error) {
      return {
        success: false,
        error: this.formatError('删除待办失败', error),
      }
    }
  }

  // ==================== 搜索实现 ====================

  /**
   * 搜索文件
   */
  private async searchFiles(pattern: string, path?: string): Promise<ToolResult> {
    try {
      const targetPath = path || this.config.workspaceDir || '.'

      // 使用 ripgrep 或 find
      // 在 Tauri 中，我们统一使用 find 命令（跨平台）
      const command = `find "${targetPath}" -name "${pattern}"`

      return await this.executeBash(command)
    } catch (error) {
      return {
        success: false,
        error: this.formatError('搜索文件失败', error),
      }
    }
  }

  /**
   * 搜索代码
   */
  private async searchCode(
    query: string,
    path?: string,
    filePattern?: string
  ): Promise<ToolResult> {
    try {
      const targetPath = path || this.config.workspaceDir || '.'

      // 使用 ripgrep (rg) 或 grep
      let command = 'rg'

      if (filePattern) {
        command += ` -g "${filePattern}"`
      }

      command += ` "${query}" "${targetPath}"`

      // 如果 rg 不可用，回退到 grep
      try {
        return await this.executeBash(command)
      } catch {
        const grepCmd = `grep -r "${query}" "${targetPath}" ${filePattern ? `--include="${filePattern}"` : ''}`
        return await this.executeBash(grepCmd)
      }
    } catch (error) {
      return {
        success: false,
        error: this.formatError('搜索代码失败', error),
      }
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 格式化错误信息
   */
  private formatError(prefix: string, error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return `${prefix}: ${message}`
  }
}
