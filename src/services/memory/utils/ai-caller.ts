/**
 * AI 调用封装 - 简化版
 * 使用现有的 eventChatStore 机制
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
 * 注意：这是一个占位实现，实际需要通过后端 API 调用
 * TODO: 实现真实的 AI 调用逻辑
 */
export async function callAI(options: AICallOptions): Promise<string> {
  const { engineId, prompt } = options

  console.log('[AICaller] 开始调用 AI...', {
    engineId,
    promptLength: prompt.length,
  })

  // TODO: 实现真实的 AI 调用
  // 目前返回占位响应，用于测试
  throw new Error('AI 调用功能需要后端支持，请先实现 Tauri 命令')
}
