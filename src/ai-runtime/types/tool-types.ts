/**
 * AI 工具类型定义
 */

export interface AIToolInput {
  [key: string]: unknown
}

export interface AIToolResult {
  success: boolean
  data?: unknown
  error?: string
  requiresConfirmation?: boolean
}

export interface AITool {
  name: string
  description: string
  inputSchema: {
    properties?: Record<string, unknown>
    required?: string[]
  }
  execute: (input: AIToolInput) => Promise<AIToolResult>
}
