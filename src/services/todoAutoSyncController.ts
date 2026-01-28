/**
 * 待办自动同步控制器
 *
 * 负责监听 Store 变化并自动同步到文件系统
 */

import { useTodoStore, useWorkspaceStore } from '@/stores'
import { todoFileSyncService } from './todoFileSyncService'
import type { TodoItem, Workspace } from '@/types'

/**
 * 待办自动同步控制器
 */
export class TodoAutoSyncController {
  private pendingTodos: TodoItem[] = []  // 待写入的待办列表
  private isWriting: boolean = false      // 正在写入文件
  private writeTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 启动自动同步
   */
  start(): void {
    console.log('[TodoAutoSync] 启动自动同步')

    // 订阅待办变化
    useTodoStore.subscribe((state) => {
      // 只在当前工作区时才同步
      const currentWorkspace = useWorkspaceStore.getState().getCurrentWorkspace()
      if (!currentWorkspace) {
        return
      }

      // 筛选当前工作区的待办
      const workspaceTodos = todoFileSyncService.filterWorkspaceTodos(
        state.todos,
        currentWorkspace.id
      )

      // 保存最新的待办列表（不立即写入）
      this.pendingTodos = workspaceTodos

      // 重置定时器
      if (this.writeTimer) {
        clearTimeout(this.writeTimer)
      }

      // 3 秒后执行写入
      this.writeTimer = setTimeout(() => {
        this.flush().catch((error) => {
          console.error('[TodoAutoSync] 写入失败:', error)
        })
      }, 3000)
    })
  }

  /**
   * 执行写入（将最新的待办列表写入文件）
   */
  private async flush(): Promise<void> {
    // 清除定时器
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }

    // 如果正在写入，等待完成后会自动检查 pendingTodos
    if (this.isWriting) {
      console.log('[TodoAutoSync] 正在写入，待办的待办会在写入完成后处理')
      return
    }

    // 没有待办需要写入
    if (this.pendingTodos.length === 0) {
      console.log('[TodoAutoSync] 没有待办需要写入')
      return
    }

    this.isWriting = true
    const todosToWrite = [...this.pendingTodos]  // 复制当前待办列表
    this.pendingTodos = []  // 清空待办列表

    try {
      const currentWorkspace = useWorkspaceStore.getState().getCurrentWorkspace()
      if (!currentWorkspace) {
        console.log('[TodoAutoSync] 没有当前工作区，跳过写入')
        return
      }

      await todoFileSyncService.writeWorkspaceTodos(
        currentWorkspace.path,
        currentWorkspace.id,
        currentWorkspace.name,
        todosToWrite
      )

      console.log(`[TodoAutoSync] 已写入 ${todosToWrite.length} 个待办`)

      // 写入完成后，如果又有新的待办，立即再次写入
      if (this.pendingTodos.length > 0) {
        console.log(`[TodoAutoSync] 检测到 ${this.pendingTodos.length} 个待办的待办，立即写入`)
        await this.flush()
      }
    } catch (error) {
      console.error('[TodoAutoSync] 写入文件失败:', error)
      // 失败时，将待办放回 pendingTodos，等待下次重试
      this.pendingTodos = [...todosToWrite, ...this.pendingTodos]
    } finally {
      this.isWriting = false
    }
  }

  /**
   * 应用启动时恢复待办
   */
  async restoreOnStartup(currentWorkspace: Workspace): Promise<void> {
    console.log(`[TodoAutoSync] 检查工作区: ${currentWorkspace.name}`)

    try {
      const fileData = await todoFileSyncService.readWorkspaceTodosWithMeta(currentWorkspace.path)

      if (!fileData || fileData.todos.length === 0) {
        console.log('[TodoAutoSync] 文件中没有待办，跳过恢复')
        return
      }

      // 检查是否需要恢复
      const store = useTodoStore.getState()
      const storeTodos = store.todos.filter((t) => t.workspaceId === currentWorkspace.id)

      const shouldRestore =
        storeTodos.length === 0 || this.isFileDataNewer(fileData, storeTodos)

      if (shouldRestore) {
        console.log(`[TodoAutoSync] 从文件恢复 ${fileData.todos.length} 个待办`)
        await todoFileSyncService.mergeIntoStore(fileData.todos, currentWorkspace.id)
      } else {
        console.log('[TodoAutoSync] Store 数据更新或相同，无需恢复')
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

    // 切换工作区前，先写入当前待办
    if (this.pendingTodos.length > 0) {
      console.log('[TodoAutoSync] 切换工作区前，先写入待办的待办')
      await this.flush()
    }

    await this.restoreOnStartup(newWorkspace)
  }

  /**
   * 判断文件数据是否比 Store 新
   */
  private isFileDataNewer(
    fileData: { todos: TodoItem[]; exportedAt: string },
    storeTodos: TodoItem[]
  ): boolean {
    if (fileData.todos.length === 0 || storeTodos.length === 0) {
      return fileData.todos.length > 0
    }

    // 比较文件导出时间和 Store 中最新待办的更新时间
    const fileExportTime = new Date(fileData.exportedAt).getTime()

    const lastStoreTodo = storeTodos
      .filter((t) => t.updatedAt)
      .sort((a, b) => b.updatedAt!.localeCompare(a.updatedAt!))[0]

    if (!lastStoreTodo) return true

    const lastStoreTime = new Date(lastStoreTodo.updatedAt!).getTime()

    // 如果文件导出时间比 Store 中最新待办的更新时间新，则恢复
    return fileExportTime > lastStoreTime
  }

  /**
   * 手动触发同步（立即写入，不防抖）
   */
  async syncNow(): Promise<void> {
    const currentWorkspace = useWorkspaceStore.getState().getCurrentWorkspace()
    if (!currentWorkspace) return

    // 获取最新的待办
    const todos = useTodoStore.getState().todos
    const workspaceTodos = todoFileSyncService.filterWorkspaceTodos(
      todos,
      currentWorkspace.id
    )

    // 直接写入
    await todoFileSyncService.writeWorkspaceTodos(
      currentWorkspace.path,
      currentWorkspace.id,
      currentWorkspace.name,
      workspaceTodos
    )

    console.log('[TodoAutoSync] 手动同步完成')
  }
}

// 导出单例
export const todoAutoSyncController = new TodoAutoSyncController()
