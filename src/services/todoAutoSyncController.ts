/**
 * 待办自动同步控制器
 *
 * 负责监听 Store 变化并自动同步到文件系统
 */

import { useTodoStore, useWorkspaceStore } from '@/stores'
import { todoFileSyncService } from './todoFileSyncService'
import type { TodoItem, Workspace } from '@/types'

/**
 * 防抖函数
 */
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * 待办自动同步控制器
 */
export class TodoAutoSyncController {
  private writeDebouncer: (
    workspacePath: string,
    workspaceId: string,
    workspaceName: string,
    todos: TodoItem[]
  ) => void
  private isSyncing: boolean = false

  constructor() {
    // 3 秒防抖，避免频繁 I/O
    this.writeDebouncer = debounce(this.writeToFile.bind(this), 3000)
  }

  /**
   * 启动自动同步
   */
  start(): void {
    console.log('[TodoAutoSync] 启动自动同步')

    // 订阅待办变化
    useTodoStore.subscribe(
      (state) => {
        this.onTodosChange(state.todos).catch((error) => {
          console.error('[TodoAutoSync] 同步失败:', error)
        })
      }
    )
  }

  /**
   * 待办变化回调
   */
  private async onTodosChange(todos: TodoItem[]): Promise<void> {
    if (this.isSyncing) return

    const currentWorkspace = useWorkspaceStore.getState().getCurrentWorkspace()
    if (!currentWorkspace) {
      console.log('[TodoAutoSync] 没有当前工作区，跳过同步')
      return
    }

    // 筛选当前工作区的待办
    const workspaceTodos = todoFileSyncService.filterWorkspaceTodos(
      todos,
      currentWorkspace.id
    )

    if (workspaceTodos.length === 0) {
      console.log('[TodoAutoSync] 当前工作区没有待办，跳过同步')
      return
    }

    // 防抖写入
    this.writeDebouncer(
      currentWorkspace.path,
      currentWorkspace.id,
      currentWorkspace.name,
      workspaceTodos
    )
  }

  /**
   * 写入文件
   */
  private async writeToFile(
    workspacePath: string,
    workspaceId: string,
    workspaceName: string,
    todos: TodoItem[]
  ): Promise<void> {
    this.isSyncing = true

    try {
      await todoFileSyncService.writeWorkspaceTodos(
        workspacePath,
        workspaceId,
        workspaceName,
        todos
      )
    } catch (error) {
      console.error('[TodoAutoSync] 写入文件失败:', error)
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * 应用启动时恢复待办
   */
  async restoreOnStartup(currentWorkspace: Workspace): Promise<void> {
    console.log(`[TodoAutoSync] 检查工作区: ${currentWorkspace.name}`)

    try {
      const fileTodos = await todoFileSyncService.readWorkspaceTodos(currentWorkspace.path)

      if (!fileTodos || fileTodos.length === 0) {
        console.log('[TodoAutoSync] 文件中没有待办，跳过恢复')
        return
      }

      // 检查是否需要恢复
      const store = useTodoStore.getState()
      const storeTodos = store.todos.filter((t) => t.workspaceId === currentWorkspace.id)

      const shouldRestore =
        storeTodos.length === 0 || this.isFileNewer(fileTodos, storeTodos)

      if (shouldRestore) {
        console.log(`[TodoAutoSync] 从文件恢复 ${fileTodos.length} 个待办`)
        todoFileSyncService.mergeIntoStore(fileTodos, currentWorkspace.id)
      } else {
        console.log('[TodoAutoSync] Store 数据更新，无需恢复')
      }
    } catch (error) {
      console.error('[TodoAutoSync] 恢复待办失败:', error)
    }
  }

  /**
   * 切换工作区时恢复待办
   */
  async onWorkspaceSwitch(newWorkspace: Workspace): Promise<void> {
    console.log(`[TodoAutoSync] 切换到工作区: ${newWorkspace.name}`)
    await this.restoreOnStartup(newWorkspace)
  }

  /**
   * 判断文件是否比 Store 新
   */
  private isFileNewer(fileTodos: TodoItem[], storeTodos: TodoItem[]): boolean {
    if (fileTodos.length === 0 || storeTodos.length === 0) {
      return fileTodos.length > 0
    }

    const lastFileTodo = fileTodos
      .filter((t) => t.updatedAt)
      .sort((a, b) => b.updatedAt!.localeCompare(a.updatedAt!))[0]

    const lastStoreTodo = storeTodos
      .filter((t) => t.updatedAt)
      .sort((a, b) => b.updatedAt!.localeCompare(a.updatedAt!))[0]

    if (!lastFileTodo || !lastStoreTodo) return false

    return lastFileTodo.updatedAt! > lastStoreTodo.updatedAt!
  }

  /**
   * 手动触发同步（立即写入，不防抖）
   */
  async syncNow(): Promise<void> {
    const currentWorkspace = useWorkspaceStore.getState().getCurrentWorkspace()
    if (!currentWorkspace) return

    const todos = useTodoStore.getState().todos
    const workspaceTodos = todoFileSyncService.filterWorkspaceTodos(
      todos,
      currentWorkspace.id
    )

    await todoFileSyncService.writeWorkspaceTodos(
      currentWorkspace.path,
      currentWorkspace.id,
      currentWorkspace.name,
      workspaceTodos
    )
  }
}

// 导出单例
export const todoAutoSyncController = new TodoAutoSyncController()
