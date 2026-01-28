/**
 * 工具启动注册
 *
 * 在应用启动时注册所有可用的 AI 工具
 */

import { globalToolRegistry } from '@/ai-runtime'
import { todoTools } from '@/ai-runtime/tools/todoTools'

/**
 * 注册所有 AI 工具
 */
export function bootstrapTools(): void {
  console.log('[ToolBootstrap] 开始注册 AI 工具...')

  // 注册待办工具
  for (const tool of todoTools) {
    globalToolRegistry.register(tool)
  }

  console.log(`[ToolBootstrap] 已注册 ${todoTools.length} 个待办工具`)
  console.log('[ToolBootstrap] 所有可用工具:', globalToolRegistry.listNames())
}
