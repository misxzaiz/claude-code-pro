/**
 * AI 调用封装 - 简化版
 * 使用现有的引擎系统
 *
 * @author Polaris Team
 * @since 2026-02-02
 */

/**
 * AI 调用选项
 */
export interface AICallOptions {
  engineId: 'claude-code' | 'iflow' | 'deepseek'
  prompt: string
  temperature?: number
}

/**
 * 调用 AI 生成文本
 *
 * 注意：这是一个简化实现
 * 实际实现需要考虑引擎的异步特性
 */
export async function callAI(options: AICallOptions): Promise<string> {
  const { engineId, prompt } = options

  console.log('[AICaller] 开始调用 AI...', {
    engineId,
    promptLength: prompt.length,
  })

  // TODO: 实现真实的 AI 调用
  // 当前版本：抛出错误，提示需要实现
  throw new Error(`AI 调用功能暂未完全实现。引擎: ${engineId}, 提示词长度: ${prompt.length}`)
}
