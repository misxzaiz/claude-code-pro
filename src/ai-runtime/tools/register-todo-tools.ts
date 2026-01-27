/**
 * 注册 Todo 工具到全局工具注册表
 *
 * 在应用初始化时调用此函数，使 AI 可以使用 Todo 相关工具
 */

import { globalToolRegistry } from '../tool-registry'
import { TodoCreateTool, TodoBatchCreateTool, TodoUpdateTool, TodoQueryTool } from './todoTools'

/**
 * 注册所有 Todo 工具
 *
 * @example
 * // 在应用启动时调用
 * import { registerTodoTools } from '@/ai-runtime/tools/register-todo-tools'
 * registerTodoTools()
 */
export function registerTodoTools(): void {
  console.log('[TodoTools] Registering Todo tools to global registry...')

  globalToolRegistry.registerBatch([
    TodoCreateTool,
    TodoBatchCreateTool,
    TodoUpdateTool,
    TodoQueryTool,
  ])

  console.log('[TodoTools] Successfully registered 4 Todo tools:')
  console.log('  - TodoCreate: 创建单个待办')
  console.log('  - TodoBatchCreate: 批量创建待办')
  console.log('  - TodoUpdate: 更新待办')
  console.log('  - TodoQuery: 查询待办')
}

/**
 * 注销所有 Todo 工具
 */
export function unregisterTodoTools(): void {
  console.log('[TodoTools] Unregistering Todo tools...')

  globalToolRegistry.unregister('TodoCreate')
  globalToolRegistry.unregister('TodoBatchCreate')
  globalToolRegistry.unregister('TodoUpdate')
  globalToolRegistry.unregister('TodoQuery')

  console.log('[TodoTools] Successfully unregistered all Todo tools')
}
