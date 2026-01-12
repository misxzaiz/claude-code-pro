/**
 * Engines Registry
 *
 * 导出所有可用的 AI Engine 实现。
 */

// 导出 Claude Code Engine
export * from './claude-code'

// 未来可以在这里添加其他 Engine
// export * from './openai'
// export * from './ollama'

/**
 * 获取所有可用的 Engine IDs
 */
export function getAvailableEngineIds(): string[] {
  return ['claude-code']
}

/**
 * 获取默认 Engine ID
 */
export function getDefaultEngineId(): string {
  return 'claude-code'
}
